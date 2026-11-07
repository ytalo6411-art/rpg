/**
 * Sala de zona (instância de mundo).
 * Gerencia jogadores, monstros, NPCs, movimento, combate, respawn e
 * transmissão de estado. Autoritativa: o servidor valida movimento, cooldowns,
 * dano, loot e inventário; nunca confia no cliente.
 *
 * A conexão WebSocket é gerenciada pelo hub central (index.ts); a sala recebe
 * os eventos de entrada/saída e mensagens de jogo.
 */

import { WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import {
  MONSTERS,
  MONSTER_BY_ID,
  ZONE_BY_ID,
  ITEMS,
  ITEM_BY_ID,
  SKILL_BY_ID,
  type ZoneId,
  type Character,
  type ItemInstance,
} from "@veyrath/shared";
import { resolveHit, type Combatant } from "./combat.js";
import { saveCharacter, loadCharacter, applyEquipmentStats } from "./character.js";
import { worldTick } from "./world.js";

const TICK_MS = 100; // simulação 10 Hz
const BROADCAST_MS = 100;

export interface PlayerSession {
  ws: WebSocket;
  token: string;
  accountId: string;
  characterId?: string;
  character?: Character;
  zone: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  lastInput: number;
  seq: number;
}

export interface MonsterInstance {
  id: string;
  def: (typeof MONSTERS)[number];
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  state: "patrol" | "chase" | "attack" | "returning";
  targetId?: string;
  stats: {
    maxHp: number;
    hp: number;
    maxMana: number;
    mana: number;
    attackPower: number;
    magicPower: number;
    defense: number;
    speed: number;
    critChance: number;
  };
  lastAttack: number;
  dead: boolean;
  respawnAt?: number;
  patrolAngle: number;
}

export class ZoneRoom {
  private zoneId: string;
  private players = new Map<WebSocket, PlayerSession>();
  private monsters = new Map<string, MonsterInstance>();
  private npcs: any[] = [];
  private timers: NodeJS.Timeout[] = [];
  private cooldowns = new Map<string, Map<string, number>>(); // charId -> skillId -> readyAt

  constructor(zoneId: string) {
    this.zoneId = zoneId;
  }

  start() {
    this.spawnMonsters();
    this.push("tick", setInterval(() => this.tick(), TICK_MS));
    this.push("broadcast", setInterval(() => this.broadcastState(), BROADCAST_MS));
    this.push("respawn", setInterval(() => this.checkRespawns(), 1000));
    this.push("world", setInterval(() => this.runWorldTick(), 10000));
    this.push("save", setInterval(() => this.saveAll(), 60000));
    console.log(`[Sala] Zona ${this.zoneId} iniciada`);
  }

  stop() {
    for (const t of this.timers) clearInterval(t);
    this.stopAndSave();
  }

  private push(name: string, t: NodeJS.Timeout) {
    this.timers.push(t);
  }

  /* ---------- Entrada / saída de jogadores (chamadas pelo hub) ---------- */

  addPlayer(session: PlayerSession) {
    this.players.set(session.ws, session);
    this.enterWorld(session);
  }

  handleDisconnect(ws: WebSocket) {
    const session = this.players.get(ws);
    if (session) {
      this.broadcastExcept(ws, {
        type: "player.left",
        characterId: session.characterId,
      });
      this.players.delete(ws);
      // Persiste a posição final antes de salvar
      if (session.character) {
        session.character.position = {
          x: session.x,
          y: session.y,
          zone: session.zone,
        };
      }
      this.saveCharacterNow(session).catch(() => {});
    }
  }

  getNpcs() {
    return this.npcs;
  }

  /* ---------- Mensagens de jogo ---------- */

  handleMessage(ws: WebSocket, parsed: any) {
    const session = this.players.get(ws);
    const now = Date.now();

    switch (parsed.type) {
      case "player.move":
        if (!session) break;
        this.handleMove(session, parsed.x, parsed.y, now);
        break;
      case "player.use_skill":
        if (!session || !session.character) break;
        this.handleSkillUse(session, parsed.skillId, parsed.targetId, parsed.x, parsed.y, now);
        break;
      case "player.use_item":
        if (!session) break;
        this.handleUseItem(session, parsed.itemInstanceId);
        break;
      case "player.chat":
        if (!session) break;
        this.broadcastExcept(ws, {
          type: "chat.message",
          from: session.character!.name,
          text: String(parsed.text || "").slice(0, 120),
          zone: session.zone,
          time: now,
        });
        this.send(ws, { type: "chat.message", from: "sistema", text: "Enviado.", messageType: "system", time: now });
        break;
      case "market.list":
      case "market.place_order":
      case "market.cancel_order":
      case "market.accept_order":
        if (!session) break;
        this.handleMarket(session, parsed);
        break;
      case "player.interact":
        if (!session) break;
        this.handleInteract(session, parsed.targetId);
        break;
      default:
        break;
    }
  }

  /* ---------- Movimento ---------------- */

  private handleMove(session: PlayerSession, x: number, y: number, now: number) {
    const char = session.character;
    if (!char) return;
    const dx = x - session.x;
    const dy = y - session.y;
    const maxDist = 4000; // anti-teleporte generoso; o tick limita a velocidade real
    if (dx * dx + dy * dy > maxDist * maxDist) return;
    session.targetX = x;
    session.targetY = y;
    session.lastInput = now;
    session.seq += 1;
  }

  /* ---------- Simulação ---------------- */

  private tick() {
    const now = Date.now();
    for (const session of this.players.values()) {
      if (!session.character) continue;
      const speed = session.character.combatStats.speed;
      const step = (speed / 1000) * TICK_MS;
      const dx = session.targetX - session.x;
      const dy = session.targetY - session.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1) {
        session.x += (dx / dist) * step;
        session.y += (dy / dist) * step;
        const zone = ZONE_BY_ID[session.zone];
        const b = zone.bounds;
        session.x = Math.min(Math.max(session.x, b.x), b.x + b.w);
        session.y = Math.min(Math.max(session.y, b.y), b.y + b.h);
      }
    }
    for (const mon of this.monsters.values()) {
      if (mon.dead) continue;
      this.monsterTick(mon, now);
    }
  }

  private monsterTick(mon: MonsterInstance, now: number) {
    const zone = ZONE_BY_ID[mon.def.zone];
    const b = zone.bounds;

    let target: PlayerSession | null = null;
    let bestDist = mon.def.perceptionRadius;
    for (const sess of this.players.values()) {
      if (!sess.character) continue;
      const d = Math.hypot(sess.x - mon.x, sess.y - mon.y);
      if (d < bestDist) {
        bestDist = d;
        target = sess;
      }
    }

    const aggressive = mon.def.behavior !== "passive";
    if (aggressive && target && bestDist <= mon.def.chaseRadius) {
      mon.state = "chase";
      mon.targetId = target.characterId;
    } else {
      mon.state = "patrol";
      mon.targetId = undefined;
    }

    if (mon.state === "patrol") {
      mon.patrolAngle += 0.02;
      const tx = mon.homeX + Math.sin(mon.patrolAngle) * 70;
      const ty = mon.homeY + Math.cos(mon.patrolAngle) * 70;
      this.moveTowards(mon, tx, ty);
    } else if (target) {
      const d = Math.hypot(target.x - mon.x, target.y - mon.y);
      if (d <= 70 && now - mon.lastAttack > 1400) {
        this.monsterAttack(mon, target, now);
      } else {
        this.moveTowards(mon, target.x, target.y);
      }
    }

    mon.x = Math.min(Math.max(mon.x, b.x), b.x + b.w);
    mon.y = Math.min(Math.max(mon.y, b.y), b.y + b.h);
  }

  private moveTowards(mon: MonsterInstance, tx: number, ty: number) {
    const dx = tx - mon.x;
    const dy = ty - mon.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 2) {
      const step = (mon.stats.speed / 1000) * TICK_MS;
      mon.x += (dx / dist) * Math.min(step, dist);
      mon.y += (dy / dist) * Math.min(step, dist);
    }
  }

  private monsterAttack(mon: MonsterInstance, target: PlayerSession, now: number) {
    if (!target.character) return;
    mon.lastAttack = now;
    const attacker: Combatant = this.monsterToCombatant(mon);
    const defender: Combatant = {
      id: target.character.id,
      type: "player",
      stats: target.character.combatStats,
      elementResistance: {},
    };
    const skillId = mon.def.abilities[0] || "basic_attack";
    const hit = resolveHit(attacker, defender, skillId, now);
    this.broadcastAll({
      type: "combat.hit",
      results: [hit],
      attacker: { id: mon.id, name: mon.def.name },
    });
    if (hit.targetDead) this.playerDie(target);
  }

  private monsterToCombatant(mon: MonsterInstance): Combatant {
    // Usa o mesmo objeto de stats para que dano aplicado pelo jogador
    // seja refletido na instância real do monstro.
    return {
      id: mon.id,
      type: "monster",
      stats: mon.stats,
      elementResistance: {},
    };
  }

  /* ---------- Habilidades / combate ---------------- */

  private handleSkillUse(
    session: PlayerSession,
    skillId: string,
    targetId: string | undefined,
    x: number | undefined,
    y: number | undefined,
    now: number
  ) {
    const char = session.character!;
    const skill = SKILL_BY_ID[skillId];
    if (!skill) {
      this.send(session.ws, { type: "error", code: "habilidade_desconhecida" });
      return;
    }
    const cdMap = this.cooldowns.get(char.id) ?? new Map();
    const readyAt = cdMap.get(skillId) ?? 0;
    if (now < readyAt) {
      this.send(session.ws, { type: "error", code: "cooldown", remainingMs: readyAt - now });
      return;
    }
    if (char.combatStats.mana < skill.manaCost) {
      this.send(session.ws, { type: "error", code: "mana_insuficiente" });
      return;
    }

    let targetSession: PlayerSession | undefined;
    let targetMonster: MonsterInstance | undefined;
    if (targetId) {
      targetSession = this.findPlayerByCharacterId(targetId);
      if (!targetSession) {
        const m = this.monsters.get(targetId);
        if (m && !m.dead) targetMonster = m;
      }
    }

    if (targetSession || targetMonster) {
      const t = targetSession || targetMonster!;
      const tx = "x" in t ? (t as any).x : session.x;
      const ty = "y" in t ? (t as any).y : session.y;
      const dist = Math.hypot(tx - session.x, ty - session.y);
      if (dist > skill.range + 60) {
        this.send(session.ws, { type: "error", code: "alvo_distante" });
        return;
      }
    }

    const attacker: Combatant = {
      id: char.id,
      type: "player",
      stats: char.combatStats,
      elementResistance: {},
    };
    const results: any[] = [];

    const applyHit = (hit: any) => {
      results.push(hit);
      if (hit.targetDead) {
        const mon = this.monsters.get(hit.targetId);
        if (mon) this.killMonster(mon);
      }
      this.grantXpAndLoot(session, hit.xpGranted, hit.loot);
    };

    if (skill.areaRadius) {
      const cx = targetSession ? targetSession.x : targetMonster ? targetMonster.x : session.x;
      const cy = targetSession ? targetSession.y : targetMonster ? targetMonster.y : session.y;
      for (const mon of this.monsters.values()) {
        if (mon.dead) continue;
        const d = Math.hypot(mon.x - cx, mon.y - cy);
        if (d <= skill.areaRadius) {
          const hit = resolveHit(attacker, this.monsterToCombatant(mon), skillId, now);
          applyHit(hit);
        }
      }
    } else if (targetMonster) {
      const hit = resolveHit(attacker, this.monsterToCombatant(targetMonster), skillId, now);
      applyHit(hit);
    } else if (targetSession) {
      const hit = resolveHit(
        attacker,
        {
          id: targetSession.character!.id,
          type: "player",
          stats: targetSession.character!.combatStats,
          elementResistance: {},
        },
        skillId,
        now
      );
      applyHit(hit);
      targetSession.character!.combatStats.hp = hit.targetHpAfter;
    } else {
      results.push({
        targetId: char.id,
        skillId,
        damage: 0,
        healed: 0,
        crit: false,
        missed: false,
        effect: skill.effect,
        targetHpAfter: char.combatStats.hp,
        targetManaAfter: char.combatStats.mana,
        targetDead: false,
        xpGranted: 0,
        loot: [],
      });
    }

    cdMap.set(skillId, now + skill.cooldownSec * 1000);
    this.cooldowns.set(char.id, cdMap);

    this.send(session.ws, {
      type: "combat.hit",
      results,
      attacker: { id: char.id, name: char.name },
    });
    this.broadcastExcept(session.ws, {
      type: "combat.hit",
      results,
      attacker: { id: char.id, name: char.name },
    });

    this.saveCharacterNow(session).catch(() => {});
  }

  private killMonster(mon: MonsterInstance) {
    mon.dead = true;
    mon.respawnAt = Date.now() + mon.def.respawnSec * 1000;
    this.broadcastAll({
      type: "monster.dead",
      monsterId: mon.id,
      respawnIn: mon.def.respawnSec,
    });
  }

  private checkRespawns() {
    const now = Date.now();
    for (const mon of this.monsters.values()) {
      if (mon.dead && mon.respawnAt && now >= mon.respawnAt) {
        mon.dead = false;
        mon.stats.hp = mon.stats.maxHp;
        mon.x = mon.homeX;
        mon.y = mon.homeY;
        mon.respawnAt = undefined;
        this.broadcastAll({
          type: "monster.spawned",
          monster: this.serializeMonster(mon),
        });
      }
    }
  }

  private runWorldTick() {
    worldTick().catch((e) => console.error("[World tick]", e));
    this.loadNpcsIntoCache();
  }

  private async loadNpcsIntoCache() {
    const db = await getDb();
    this.npcs = await db.all(`SELECT * FROM npcs`);
  }

  /* ---------- Jogadores: morte / respawn ---------------- */

  private playerDie(session: PlayerSession) {
    const char = session.character;
    if (!char) return;
    char.combatStats.hp = 0;
    this.broadcastAll({ type: "combat.death", characterId: char.id });
    setTimeout(() => {
      char.combatStats.hp = char.combatStats.maxHp;
      session.x = session.character!.position.x;
      session.y = session.character!.position.y;
      session.targetX = session.x;
      session.targetY = session.y;
      this.send(session.ws, {
        type: "character.respawned",
        x: session.x,
        y: session.y,
        hp: char.combatStats.hp,
      });
      this.broadcastExcept(session.ws, { type: "player.respawned", characterId: char.id });
    }, 2000);
  }

  /* ---------- Mercado ---------------- */

  private async handleMarket(session: PlayerSession, parsed: any) {
    const db = await getDb();
    const char = session.character!;
    switch (parsed.type) {
      case "market.list": {
        const orders: any[] = await db.all(
          `SELECT * FROM market_orders WHERE fulfilled = 0 AND expires_at > ? ORDER BY created_at DESC`,
          [Date.now()]
        );
        this.send(session.ws, { type: "market.orders", orders });
        break;
      }
      case "market.place_order": {
        const { side, itemDefinitionId, quantity, pricePerUnit } = parsed;
        const def = ITEM_BY_ID[itemDefinitionId];
        if (!def || !def.stackable || quantity <= 0 || !pricePerUnit || pricePerUnit <= 0) {
          this.send(session.ws, { type: "error", code: "item_negociavel_invalido" });
          return;
        }
        if (side === "sell") {
          const item = char.inventory.items.find(
            (i) => i.definitionId === itemDefinitionId && !i.equipped && i.quantity >= quantity
          );
          if (!item) {
            this.send(session.ws, { type: "error", code: "item_nao_encontrado" });
            return;
          }
          item.quantity -= quantity;
          if (item.quantity <= 0) {
            char.inventory.items = char.inventory.items.filter((i) => i.id !== item.id);
          }
        } else {
          const cost = quantity * pricePerUnit;
          if (char.inventory.coin < cost) {
            this.send(session.ws, { type: "error", code: "moeda_insuficiente" });
            return;
          }
          char.inventory.coin -= cost;
        }
        const order = {
          id: uuidv4(),
          sellerId: side === "sell" ? char.id : undefined,
          buyerId: side === "buy" ? char.id : undefined,
          itemDefinitionId,
          quantity,
          pricePerUnit,
          side,
          createdAt: Date.now(),
          expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
          fulfilled: 0,
        };
        await db.run(
          `INSERT INTO market_orders (id, seller_id, buyer_id, item_definition_id, quantity, price_per_unit, side, created_at, expires_at, fulfilled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [
            order.id, order.sellerId, order.buyerId, order.itemDefinitionId,
            order.quantity, order.pricePerUnit, order.side, order.createdAt, order.expiresAt,
          ]
        );
        await this.saveCharacterNow(session);
        await this.broadcastMarketList(db);
        break;
      }
      case "market.cancel_order": {
        const order: any = await db.get(
          `SELECT * FROM market_orders WHERE id = ? AND fulfilled = 0`,
          [parsed.orderId]
        );
        if (!order || order.seller_id !== char.id) {
          this.send(session.ws, { type: "error", code: "ordem_nao_encontrada" });
          return;
        }
        const existing = char.inventory.items.find(
          (i) => i.definitionId === order.item_definition_id && !i.equipped
        );
        if (existing) existing.quantity += order.quantity;
        else {
          char.inventory.items.push({
            id: uuidv4(), definitionId: order.item_definition_id, quantity: order.quantity,
            equipped: false, createdAt: Date.now(),
          });
        }
        await db.run(`UPDATE market_orders SET fulfilled = 1 WHERE id = ?`, [parsed.orderId]);
        await this.saveCharacterNow(session);
        await this.broadcastMarketList(db);
        break;
      }
      case "market.accept_order": {
        const order: any = await db.get(
          `SELECT * FROM market_orders WHERE id = ? AND fulfilled = 0 AND side = 'sell'`,
          [parsed.orderId]
        );
        if (!order) {
          this.send(session.ws, { type: "error", code: "ordem_nao_encontrada" });
          return;
        }
        const cost = order.quantity * order.price_per_unit;
        if (char.inventory.coin < cost) {
          this.send(session.ws, { type: "error", code: "moeda_insuficiente" });
          return;
        }
        const seller = this.findPlayerByCharacterId(order.seller_id!);
        if (seller && seller.character) seller.character.inventory.coin += cost;
        char.inventory.coin -= cost;
        const existing = char.inventory.items.find(
          (i) => i.definitionId === order.item_definition_id && !i.equipped
        );
        if (existing) existing.quantity += order.quantity;
        else {
          char.inventory.items.push({
            id: uuidv4(), definitionId: order.item_definition_id, quantity: order.quantity,
            equipped: false, createdAt: Date.now(),
          });
        }
        await db.run(`UPDATE market_orders SET fulfilled = 1, buyer_id = ? WHERE id = ?`, [char.id, parsed.orderId]);
        await this.saveCharacterNow(session);
        if (seller) await this.saveCharacterNow(seller);
        await this.broadcastMarketList(db);
        break;
      }
    }
  }

  private async broadcastMarketList(db: any) {
    const orders: any[] = await db.all(
      `SELECT * FROM market_orders WHERE fulfilled = 0 AND expires_at > ? ORDER BY created_at DESC`,
      [Date.now()]
    );
    this.broadcastAll({ type: "market.orders", orders });
  }

  /* ---------- Interação ---------------- */

  private handleInteract(session: PlayerSession, targetId: string | undefined) {
    if (!targetId) return;
    const npc = this.npcs.find((n) => n.npc_id === targetId);
    if (npc) {
      this.send(session.ws, {
        type: "npc.dialog",
        npcId: npc.npc_id,
        profession: npc.profession,
        stock: npc.stock,
        coin: npc.coin,
        messages: [
          `Saudações, ${session.character!.name}.`,
          `Sou ${npc.profession} e estou aqui para ajudar.`,
        ],
      });
      return;
    }
    const mon = this.monsters.get(targetId);
    if (mon && !mon.dead) {
      this.send(session.ws, {
        type: "monster.inspect",
        monsterId: mon.id,
        name: mon.def.name,
        level: mon.def.level,
        hpPercent: (mon.stats.hp / mon.stats.maxHp) * 100,
      });
      return;
    }
    const p = this.findPlayerByCharacterId(targetId);
    if (p && p.character) {
      this.send(session.ws, {
        type: "player.inspect",
        characterId: p.character.id,
        name: p.character.name,
        level: p.character.level,
        race: p.character.race,
        class: p.character.class,
      });
    }
  }

  private handleUseItem(session: PlayerSession, itemInstanceId: string | undefined) {
    if (!itemInstanceId || !session.character) return;
    const char = session.character;
    const item = char.inventory.items.find((i) => i.id === itemInstanceId);
    if (!item) return;
    const def = ITEM_BY_ID[item.definitionId];
    if (!def || !def.consumableEffect) return;
    const effect = def.consumableEffect;
    if (effect.type === "heal") {
      char.combatStats.hp = Math.min(char.combatStats.maxHp, char.combatStats.hp + effect.value);
      if (effect.hunger) char.hunger = Math.min(100, char.hunger + effect.hunger);
    }
    item.quantity--;
    if (item.quantity <= 0) {
      char.inventory.items = char.inventory.items.filter((i) => i.id !== item.id);
    }
    this.send(session.ws, {
      type: "item.used",
      itemInstanceId,
      definitionId: item.definitionId,
      effect,
    });
    this.saveCharacterNow(session).catch(() => {});
  }

  /* ---------- Progresso ---------------- */

  private grantXpAndLoot(session: PlayerSession, xp: number, loot: { itemId: string; quantity: number }[]) {
    if (!session.character || (xp <= 0 && !loot.length)) return;
    const char = session.character;
    char.xp += xp;
    let levelUp = false;
    while (char.xp >= char.level * 300) {
      char.xp -= char.level * 300;
      char.level += 1;
      levelUp = true;
      char.combatStats.maxHp += 20;
      char.combatStats.hp = char.combatStats.maxHp;
      char.combatStats.maxMana += 10;
      char.combatStats.mana = char.combatStats.maxMana;
      char.combatStats.attackPower += 2;
      char.combatStats.defense += 1;
      char.combatStats.speed += 1;
    }
    for (const drop of loot) {
      if (drop.itemId === "coin") {
        char.inventory.coin += drop.quantity;
      } else {
        const existing = char.inventory.items.find((i) => i.definitionId === drop.itemId && !i.equipped);
        const def = ITEM_BY_ID[drop.itemId];
        if (existing && def && def.stackable) {
          existing.quantity += drop.quantity;
        } else {
          char.inventory.items.push({
            id: uuidv4(), definitionId: drop.itemId, quantity: drop.quantity,
            equipped: false, createdAt: Date.now(),
          });
        }
      }
    }
    this.send(session.ws, {
      type: "xp.gained",
      xp,
      level: char.level,
      levelUp,
      coin: char.inventory.coin,
      loot,
    });
  }

  /* ---------- Serialização / envio ---------- */

  private findPlayerByCharacterId(characterId: string): PlayerSession | undefined {
    for (const s of this.players.values()) {
      if (s.characterId === characterId) return s;
    }
    return undefined;
  }

  private enterWorld(session: PlayerSession) {
    const zone = ZONE_BY_ID[session.zone];
    this.send(session.ws, {
      type: "world.enter",
      zone,
      players: this.serializeOtherPlayers(session.ws),
      monsters: this.serializeMonsters(),
      npcs: this.npcs,
    });
    this.send(session.ws, {
      type: "inventory.sync",
      items: session.character!.inventory.items,
      coin: session.character!.inventory.coin,
    });
    this.broadcastExcept(session.ws, {
      type: "player.joined",
      player: this.serializePlayer(session),
    });
  }

  private serializePlayer(session: PlayerSession) {
    const c = session.character!;
    return {
      characterId: c.id,
      name: c.name,
      race: c.race,
      class: c.class,
      level: c.level,
      x: session.x,
      y: session.y,
      targetX: session.targetX,
      targetY: session.targetY,
      hp: c.combatStats.hp,
      maxHp: c.combatStats.maxHp,
      hunger: c.hunger,
    };
  }

  public serializeOtherPlayers(ws: WebSocket) {
    const out: any[] = [];
    for (const [key, session] of this.players.entries()) {
      if (key === ws) continue;
      out.push(this.serializePlayer(session));
    }
    return out;
  }

  public serializeMonsters() {
    return Array.from(this.monsters.values()).map((m) => this.serializeMonster(m));
  }

  private serializeMonster(mon: MonsterInstance) {
    return {
      id: mon.id,
      definitionId: mon.def.id,
      name: mon.def.name,
      level: mon.def.level,
      x: mon.x,
      y: mon.y,
      hp: mon.stats.hp,
      maxHp: mon.stats.maxHp,
      dead: mon.dead,
      behavior: mon.def.behavior,
      color: mon.def.color,
      size: mon.def.size,
    };
  }

  private broadcastState() {
    const payload: any = {
      type: "state.delta",
      time: Date.now(),
      players: [],
      monsters: this.serializeMonsters(),
    };
    for (const session of this.players.values()) {
      if (!session.character) continue;
      payload.players.push(this.serializePlayer(session));
    }
    const message = JSON.stringify(payload);
    for (const session of this.players.values()) {
      if (session.ws.readyState === 1) session.ws.send(message);
    }
  }

  private broadcastAll(message: any) {
    const data = JSON.stringify(message);
    for (const session of this.players.values()) {
      if (session.ws.readyState === 1) session.ws.send(data);
    }
  }

  private broadcastExcept(ws: WebSocket, message: any) {
    const data = JSON.stringify(message);
    for (const [key, session] of this.players.entries()) {
      if (key === ws) continue;
      if (session.ws.readyState === 1) session.ws.send(data);
    }
  }

  private send(ws: WebSocket, message: any) {
    if (ws.readyState === 1) ws.send(JSON.stringify(message));
  }

  /* ---------- Persistência ---------- */

  private async saveCharacterNow(session: PlayerSession) {
    if (!session.character) return;
    const db = await getDb();
    await saveCharacter(db, session.character);
  }

  private async saveAll() {
    const db = await getDb();
    for (const session of this.players.values()) {
      if (session.character) {
        session.character.position = { x: session.x, y: session.y, zone: session.zone };
        await saveCharacter(db, session.character);
      }
    }
  }

  private stopAndSave() {
    const file = path.join(__dirname, "..", "data", "veyrath.db");
    const db = new Database(file);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    for (const session of this.players.values()) {
      if (session.character) {
        try { saveCharacter(db, session.character); } catch { /* ignora ao encerrar */ }
      }
    }
    db.close();
  }

  private spawnMonsters() {
    const defs = MONSTERS.filter((m) => m.zone === this.zoneId);
    for (const def of defs) {
      const count = def.id === "root_guardian" ? 1 : 4;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const radius = 200 + i * 40;
        const x = 400 + Math.cos(angle) * radius;
        const y = 400 + Math.sin(angle) * radius;
        const mon: MonsterInstance = {
          id: uuidv4(),
          def,
          x, y,
          homeX: x, homeY: y,
          state: "patrol",
          targetId: undefined,
          stats: {
            maxHp: def.combatStats.maxHp,
            hp: def.combatStats.maxHp,
            maxMana: 0,
            mana: 0,
            attackPower: def.combatStats.attackPower,
            magicPower: 0,
            defense: def.combatStats.defense,
            speed: def.combatStats.speed,
            critChance: 5,
          },
          lastAttack: 0,
          dead: false,
          patrolAngle: Math.random() * Math.PI * 2,
        };
        this.monsters.set(mon.id, mon);
      }
    }
  }
}
