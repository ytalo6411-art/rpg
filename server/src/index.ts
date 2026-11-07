process.on("uncaughtException", (err) => {
  console.error("[VEYRATH] exceção não capturada:", err);
});
process.on("unhandledRejection", (err) => {
  console.error("[VEYRATH] rejeição não tratada:", err);
});

/**
 * Servidor VEYRATH — ponto de entrada.
 *
 * Gerencia conexões WebSocket e roteia mensagens para a sala (zona) atual do
 * jogador. Suporta mudança de zona (transferência entre salas).
 */

import express from "express";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { WebSocket } from "ws";
import { getDb, closeDb, isLocalMode } from "./db.js";
import { registerAccount, loginAccount, sessions } from "./auth.js";
import { ZoneRoom, type PlayerSession } from "./room.js";
import {
  createCharacter,
  saveCharacter,
  loadCharacter,
  applyEquipmentStats,
} from "./character.js";
import { RACES, CLASSES, type ClassId } from "@veyrath/shared";
import { ZONE_BY_ID, type ZoneId } from "@veyrath/shared";
import { v4 as uuidv4 } from "uuid";

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || "0.0.0.0";

const app = express();
app.use(express.json());

// CORS — permite que o frontend (Vercel ou outro domínio) chame a API e o WebSocket
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*";
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", CLIENT_ORIGIN);
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  if (_req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

/* ---------- Salas ---------- */

const rooms = new Map<string, ZoneRoom>();
function getRoom(zoneId: string): ZoneRoom {
  let room = rooms.get(zoneId);
  if (!room) {
    room = new ZoneRoom(zoneId);
    room.start();
    rooms.set(zoneId, room);
  }
  return room;
}
for (const z of ["lumenfall", "meadows", "whisper_woods", "varkhenn_mines"]) {
  getRoom(z);
}

/* ---------- Conexões ---------- */

interface Conn {
  ws: WebSocket;
  token?: string;
  room?: ZoneRoom;
  session?: PlayerSession;
}
const conns = new Map<WebSocket, Conn>();

async function authenticate(conn: Conn, token: string) {
  const s = sessions.get(token);
  if (!s) {
    conn.ws.send(JSON.stringify({ type: "error", code: "Nao_autenticado" }));
    return;
  }
  conn.token = token;
  const list = await loadAccountCharacters(s.accountId);
  conn.ws.send(JSON.stringify({ type: "characters.list", characters: list }));
}

async function loadAccountCharacters(accountId: string) {
  const db = await getDb();
  const rows: any[] = await db.all(`SELECT id FROM characters WHERE account_id = ?`, [accountId]);
  const list: any[] = [];
  for (const row of rows) {
    const char = await loadCharacter(db, row.id);
    if (char) {
      applyEquipmentStats(char);
      list.push({
        id: char.id, name: char.name, race: char.race, class: char.class,
        level: char.level, zone: char.position.zone,
      });
    }
  }
  return list;
}

/* ---------- Seleção de personagem (entra na sala da zona) ---------- */

async function selectCharacter(conn: Conn, characterId: string) {
  if (!conn.token) {
    conn.ws.send(JSON.stringify({ type: "error", code: "Nao_autenticado" }));
    return;
  }
  const s = sessions.get(conn.token);
  if (!s) return;
  const db = await getDb();
  const character = await loadCharacter(db, characterId);
  if (!character || character.accountId !== s.accountId) {
    conn.ws.send(JSON.stringify({ type: "error", code: "personagem_invalido" }));
    return;
  }
  applyEquipmentStats(character);

  // Sai da sala atual, se houver
  if (conn.room && conn.session) {
    conn.room.handleDisconnect(conn.ws);
  }

  const zone = character.position.zone;
  const room = getRoom(zone);
  const session: PlayerSession = {
    ws: conn.ws,
    token: conn.token,
    accountId: s.accountId,
    characterId: character.id,
    character,
    zone,
    x: character.position.x,
    y: character.position.y,
    targetX: character.position.x,
    targetY: character.position.y,
    lastInput: Date.now(),
    seq: 0,
  };
  conn.session = session;
  conn.room = room;
  room.addPlayer(session);

  conn.ws.send(JSON.stringify({
    type: "character.selected",
    character,
    zone: ZONE_BY_ID[zone],
  }));
}

/* ---------- Mudança de zona ---------- */

async function changeZone(conn: Conn, zoneId: string) {
  if (!conn.session) {
    conn.ws.send(JSON.stringify({ type: "error", code: "personagem_nao_selecionado" }));
    return;
  }
  const zone = ZONE_BY_ID[zoneId];
  if (!zone) {
    conn.ws.send(JSON.stringify({ type: "error", code: "zona_invalida" }));
    return;
  }
  const character = conn.session.character!;
  const oldRoom = conn.room;
  if (oldRoom) oldRoom.handleDisconnect(conn.ws);

  const db = await getDb();
  const fresh = await loadCharacter(db, character.id);
  if (!fresh) return;
  applyEquipmentStats(fresh);
  // reposiciona no ponto de spawn da nova zona (sem teleporte dentro da mesma zona)
  fresh.position = { x: zone.spawnPoint.x, y: zone.spawnPoint.y, zone: zoneId };

  const room = getRoom(zoneId);
  const session: PlayerSession = {
    ws: conn.ws,
    token: conn.token!,
    accountId: conn.session.accountId,
    characterId: fresh.id,
    character: fresh,
    zone: zoneId,
    x: fresh.position.x,
    y: fresh.position.y,
    targetX: fresh.position.x,
    targetY: fresh.position.y,
    lastInput: Date.now(),
    seq: 0,
  };
  conn.session = session;
  conn.room = room;
  room.addPlayer(session);

  conn.ws.send(JSON.stringify({
    type: "world.enter",
    zone,
    players: room.serializeOtherPlayers(conn.ws),
    monsters: room.serializeMonsters(),
    npcs: room.getNpcs(),
  }));
  conn.ws.send(JSON.stringify({
    type: "inventory.sync",
    items: fresh.inventory.items,
    coin: fresh.inventory.coin,
  }));
}

/* ---------- HTTP API ---------- */

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "veyrath-server",
    mode: isLocalMode() ? "local" : "producao",
    rooms: Array.from(rooms.keys()),
    time: Date.now(),
  });
});

app.post("/auth/register", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: "Campos_obrigatorios" });
  }
  const result = await registerAccount(username, password);
  if (!result.ok) return res.status(409).json(result);
  res.json({ ok: true, token: result.token, accountId: result.accountId });
});

app.post("/auth/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: "Campos_obrigatorios" });
  }
  const result = await loginAccount(username, password);
  if (!result.ok) return res.status(401).json(result);
  res.json({ ok: true, token: result.token, accountId: result.accountId });
});

app.post("/characters", async (req, res) => {
  try {
    const token = (req.headers.authorization || "").replace(/^Bearer\s/i, "");
    const { name, race, classId } = req.body || {};
    const s = sessions.get(token);
    if (!s) return res.status(401).json({ ok: false, error: "Nao_autenticado" });
    if (!RACES.find((r) => r.id === race))
      return res.status(400).json({ ok: false, error: "raca_invalida" });
    if (!CLASSES.find((c) => c.id === classId))
      return res.status(400).json({ ok: false, error: "classe_invalida" });
    const db = await getDb();
    const rows: any[] = await db.all(
      `SELECT id FROM characters WHERE account_id = ?`,
      [s.accountId]
    );
    if (rows.length > 0)
      return res.status(409).json({ ok: false, error: "Ja_tem_personagem" });
    const char = createCharacter({
      accountId: s.accountId,
      name,
      race,
      classId: classId as ClassId,
    });
    await saveCharacter(db, char);
    res.json({
      ok: true,
      character: {
        id: char.id,
        name: char.name,
        race: char.race,
        class: char.class,
        level: char.level,
      },
    });
  } catch (e) {
    console.error("Erro ao criar personagem:", e);
    res.status(500).json({ ok: false, error: "erro_interno" });
  }
});

/* ---------- WebSocket ---------- */

wss.on("connection", (ws) => {
  const conn: Conn = { ws };
  conns.set(ws, conn);

  ws.on("message", (data: Buffer) => {
    let parsed: any;
    try {
      parsed = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (parsed.type === "auth.token") {
      authenticate(conn, parsed.token);
      return;
    }

    if (parsed.type === "character.select") {
      selectCharacter(conn, parsed.characterId);
      return;
    }

    if (!conn.room) {
      ws.send(JSON.stringify({ type: "error", code: "personagem_nao_selecionado" }));
      return;
    }

    if (parsed.type === "player.change_zone") {
      changeZone(conn, parsed.zoneId);
      return;
    }

    conn.room.handleMessage(ws, parsed);
  });

  ws.on("close", () => {
    if (conn.room) conn.room.handleDisconnect(conn.ws);
    conns.delete(ws);
  });

  ws.on("error", () => {
    if (conn.room) conn.room.handleDisconnect(conn.ws);
    conns.delete(ws);
  });
});

httpServer.listen(PORT, HOST, () => {
  console.log(`[VEYRATH] Servidor escutando em http://${HOST}:${PORT}`);
  if (isLocalMode()) {
    console.log(
      "[VEYRATH] MODO DE DESENVOLVIMENTO LOCAL — Banco SQLite. Não é produção online."
    );
  }
});

process.on("SIGTERM", async () => {
  for (const room of rooms.values()) room.stop();
  await closeDb();
  httpServer.close();
  process.exit(0);
});
