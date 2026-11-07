/**
 * GameScene: mundo jogável de VEYRATH.
 * - Conecta WebSocket, sincroniza estado do servidor (autoritativo).
 * - Renderiza jogador, outros jogadores, monstros e NPCs.
 * - Movimento click-to-move, habilidades, combate, inventário, mercado,
 *   chat, missões e painéis de interface.
 */

import Phaser from "phaser";
import { NetClient } from "../systems/net";
import { RACES, CLASSES, ITEMS, MONSTERS, ZONE_BY_ID } from "@veyrath/shared";

const WS_URL = (import.meta.env.VITE_WS_URL || "ws://localhost:4000") + "/ws";

function raceColor(race: string): number {
  const map: Record<string, number> = {
    human: 0xf4a261,
    slime: 0xb5e48c,
    goblin: 0x7cb342,
    dryad: 0x4caf50,
    feral: 0xe64a19,
  };
  return map[race] ?? 0xffffff;
}

function hexToNumber(s: string): number {
  return parseInt((s || "#ffffff").replace("#", ""), 16) || 0xffffff;
}

interface NetEntity {
  characterId: string;
  name: string;
  race: string;
  class: string;
  level: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  hp: number;
  maxHp: number;
  hunger: number;
}

interface ViewEntity {
  sprite: Phaser.GameObjects.Sprite;
  nameText: Phaser.GameObjects.Text;
  hpBar: Phaser.GameObjects.Graphics;
  hpBarBg: Phaser.GameObjects.Graphics;
}

export class GameScene extends Phaser.Scene {
  private net!: NetClient;
  private token = "";
  private characterId = "";

  // câmera e mundo
  private world!: Phaser.GameObjects.Container;
  private tileLayer!: Phaser.GameObjects.TileSprite;
  private zoneName!: Phaser.GameObjects.Text;

  // entidades
  private entities = new Map<string, ViewEntity>(); // characterId | monsterId
  private entityMeta = new Map<string, { kind: "player" | "monster" | "npc"; hp: number; maxHp: number; name: string }>();
  private localPlayerId?: string;
  private localX = 400;
  private localY = 400;

  // monstros
  private monsters = new Map<string, any>();

  // NPCs
  private npcs = new Map<string, any>();

  // habilidades
  private skills: string[] = ["basic_attack"];
  private skillCooldowns = new Map<string, number>();
  private selectedSkill = 0;

  // combate / feedback
  private damageTexts: Phaser.GameObjects.Text[] = [];

  // UI painéis (overlays HTML)
  private inventoryPanel!: HTMLElement;
  private marketPanel!: HTMLElement;
  private chatPanel!: HTMLElement;
  private questPanel!: HTMLElement;
  private statsPanel!: HTMLElement;

  // estado de inventário local (espelho do servidor)
  private coin = 0;
  private inventoryItems: any[] = [];

  constructor() {
    super("GameScene");
  }

  init(data: { token: string; characterId: string }) {
    this.token = data.token;
    this.characterId = data.characterId;
  }

  create() {
    this.connectNet();
    this.createWorld();
    this.createHUD();
    this.createPanels();
    this.setupInput();

    this.add.text(20, 20, "VEYRATH — mundo vivo", {
      fontSize: "14px", color: "#b5e48c",
    }).setDepth(1000);

    this.zoneName = this.add.text(
      this.scale.width / 2, 20, "Lumenfall",
      { fontSize: "20px", color: "#f4d03f", stroke: "#000", strokeThickness: 4 }
    ).setOrigin(0.5).setDepth(1000);

    this.add.text(20, this.scale.height - 30, "Dicas: clique para andar · 1-4 habilidades · E: inventário · M: mercado · Q: missões", {
      fontSize: "12px", color: "#888",
    }).setDepth(1000);
  }

  /* ---------------- Rede ---------------- */

  private connectNet() {
    this.net = new NetClient(WS_URL);
    this.net.connect(this.token);

    this.net.on("characters.list", () => {
      // personagem já selecionado via HTTP; entra direto
      this.net.send({ type: "character.select", characterId: this.characterId });
    });

    this.net.on("character.selected", (_) => {
      // pronto: aguarda world.enter
    });

    this.net.on("world.enter", (msg: any) => {
      this.zoneName.text = msg.zone.name;
      // limpa entidades da zona anterior (mudança de zona / reentrada)
      for (const [id, ent] of this.entities) {
        ent.sprite.destroy();
        ent.nameText.destroy();
        ent.hpBar?.destroy();
        ent.hpBarBg?.destroy();
      }
      this.entities.clear();
      this.entityMeta.clear();
      this.monsters.clear();
      this.npcs.clear();
      const stored = localStorage.getItem("veyrath_character");
      if (stored) {
        const char = JSON.parse(stored);
        const cls = CLASSES.find((c) => c.id === char.class);
        this.skills = cls ? cls.startingSkills.slice() : ["basic_attack"];
      }
      this.spawnEntities(msg.players, msg.monsters, msg.npcs);
    });

    this.net.on("inventory.sync", (msg: any) => {
      this.coin = msg.coin ?? 0;
      this.inventoryItems = msg.items ?? [];
      this.refreshInventoryPanel();
    });

    this.net.on("state.delta", (msg: any) => {
      // aplica posições recebidas (servidor autoritativo)
      for (const p of msg.players) {
        if (p.characterId === this.characterId) {
          this.localX = p.x;
          this.localY = p.y;
          const ent = this.entities.get(p.characterId);
          if (ent) {
            ent.sprite.setPosition(p.x, p.y);
            this.updateHpBar(ent, p.hp, p.maxHp);
          }
          continue;
        }
        this.updateNetworkPlayer(p);
      }
      for (const m of msg.monsters) {
        this.updateMonster(m);
      }
    });

    this.net.on("player.joined", (msg: any) => {
      this.addPlayerEntity(msg.player);
    });
    this.net.on("player.left", (msg: any) => {
      this.removeEntity(msg.characterId);
    });
    this.net.on("player.respawned", (msg: any) => {
      const ent = this.entities.get(msg.characterId);
      if (ent) ent.sprite.setPosition(msg.x, msg.y);
    });

    this.net.on("monster.dead", (msg: any) => {
      const ent = this.entities.get(msg.monsterId);
      if (ent) { ent.sprite.setTint(0x555555); ent.sprite.alpha = 0.5; }
    });
    this.net.on("monster.spawned", (msg: any) => {
      this.addMonsterEntity(msg.monster);
    });

    this.net.on("combat.hit", (msg: any) => {
      for (const hit of msg.results) {
        this.showDamageNumber(hit.targetId, hit.damage, hit.crit, hit.missed);
        if (hit.healed > 0) this.showHealNumber(hit.targetId, hit.healed);
      }
    });
    this.net.on("combat.death", (msg: any) => {
      if (msg.characterId === this.characterId) {
        this.add.text(this.scale.width / 2, this.scale.height / 2, "Você foi derrotado", {
          fontSize: "32px", color: "#ff6b6b",
        }).setOrigin(0.5).setDepth(2000);
      }
    });
    this.net.on("character.respawned", (msg: any) => {
      const ent = this.entities.get(this.characterId);
      if (ent) {
        ent.sprite.clearTint();
        ent.sprite.alpha = 1;
        ent.sprite.setPosition(msg.x, msg.y);
      }
    });

    this.net.on("xp.gained", (msg: any) => {
      this.showDamageNumber(this.characterId, msg.xp, false, false, "xp");
      this.add.text(this.scale.width / 2, this.scale.height / 2 - 60,
        `XP +${msg.xp}${msg.levelUp ? " — NÍVEL ${msg.level}!" : ""}`, {
          fontSize: "20px", color: "#f4d03f",
        }).setOrigin(0.5).setDepth(2000);
      this.time.delayedCall(1500, () => {
        // texto sobe e some (gerenciado abaixo simplesmente)
      });
    });

    this.net.on("item.used", (msg: any) => {
      this.refreshInventoryFromServer();
    });

    this.net.on("inventory.updated", (msg: any) => {
      this.coin = msg.coin;
      this.inventoryItems = msg.items;
      this.refreshInventoryPanel();
    });

    this.net.on("market.orders", (msg: any) => {
      this.refreshMarketPanel(msg.orders);
    });

    this.net.on("npc.dialog", (msg: any) => {
      this.showNPCDialog(msg);
    });

    this.net.on("chat.message", (msg: any) => {
      this.addChat(msg.from, msg.text, msg.type || "public");
    });

    this.net.on("error", (msg: any) => {
      this.addChat("sistema", msg.code || "erro", "system");
    });
  }

  /* ---------------- Mundo ---------------- */

  private createWorld() {
    this.world = this.add.container(0, 0);

    // Fundo da zona atual (Lumenfall) — tiles procedurais repetidos
    this.tileLayer = this.add.tileSprite(0, 0, 1400, 1000, "tex_grass");
    this.tileLayer.setOrigin(0, 0);
    this.world.add(this.tileLayer);

    // Árvore ancestral (ponto central de Lumenfall)
    const tree = this.add.image(700, 500, "tex_ancient_tree").setOrigin(0.5);
    tree.setTint(0x8ecae6);
    this.world.add(tree);

    // Estruturas simples da cidade (procedurais)
    const buildings = [
      { x: 250, y: 350, name: "Mercado das Mil Trocas" },
      { x: 450, y: 350, name: "Distrito dos Artesãos" },
      { x: 650, y: 300, name: "Guilda dos Aventureiros" },
      { x: 850, y: 450, name: "Biblioteca das Runas" },
      { x: 350, y: 650, name: "Taverna (Distrito do Crepúsculo)" },
    ];
    for (const b of buildings) {
      const img = this.add.image(b.x, b.y, "tex_building").setOrigin(0.5);
      img.setTint(0xe8d8b8);
      const label = this.add.text(b.x, b.y - 56, b.name, {
        fontSize: "12px", color: "#e0e0e0", stroke: "#000", strokeThickness: 3,
      }).setOrigin(0.5);
      this.world.add([img, label]);
    }

    // Saídas para regiões
    const exits = [
      { x: 1300, y: 500, zone: "meadows", label: "Pradarias de Brumaflor" },
      { x: 700, y: 960, zone: "whisper_woods", label: "Bosque dos Sussurros" },
    ];
    for (const e of exits) {
      const gate = this.add.rectangle(e.x, e.y, 40, 80, 0x4caf50, 0.6);
      gate.setStrokeStyle(2, 0xffffff);
      const label = this.add.text(e.x, e.y + 52, e.label, {
        fontSize: "12px", color: "#b5e48c", stroke: "#000", strokeThickness: 3,
      }).setOrigin(0.5);
      this.world.add([gate, label]);
      gate.setInteractive({ useHandCursor: true });
      gate.on("pointerdown", () => this.changeZone(e.zone));
    }

    this.add.existing(this.world);
    this.cameras.main.setBounds(0, 0, 1400, 1000);
  }

  private changeZone(zoneId: string) {
    const zone = ZONE_BY_ID[zoneId];
    if (!zone) return;
    this.net.send({ type: "player.move", x: zone.spawnPoint.x, y: zone.spawnPoint.y });
    this.localX = zone.spawnPoint.x;
    this.localY = zone.spawnPoint.y;
    this.zoneName.text = zone.name;
    // Recria cenário simples conforme zona
    const key = zoneId === "meadows" ? "tex_grass" : zoneId === "whisper_woods" ? "tex_dirt" : "tex_grass";
    this.tileLayer.setTexture(key);
    this.cameras.main.setBounds(0, 0, zone.bounds.w, zone.bounds.h);
  }

  /* ---------------- Entidades ---------------- */

  private spawnEntities(players: any[], monsters: any[], npcs: any[]) {
    // Limpa entidades antigas (exceto não há)
    for (const p of players) this.addPlayerEntity(p);
    for (const m of monsters) this.addMonsterEntity(m);
    for (const n of npcs) this.addNPCEntity(n);
  }

  private addPlayerEntity(p: any) {
    if (this.entities.has(p.characterId)) return;
    const color = raceColor(p.race);
    const sprite = this.add.sprite(p.x, p.y, `sprite_${p.race}`).setScale(1.6).setTint(color);
    const nameText = this.add.text(p.x, p.y - 42, `${p.name} (Lv${p.level})`, {
      fontSize: "14px", color: "#e0e0e0", stroke: "#000", strokeThickness: 4,
    }).setOrigin(0.5);
    const hpBarBg = this.add.graphics();
    hpBarBg.fillStyle(0x333333);
    hpBarBg.fillRect(0, 0, 34, 6);
    const hpBar = this.add.graphics();
    hpBar.fillStyle(0xff4444);
    hpBar.fillRect(0, 0, 34, 6);
    this.world.add([sprite, nameText, hpBarBg, hpBar]);
    this.entities.set(p.characterId, { sprite, nameText, hpBar, hpBarBg });
    this.entityMeta.set(p.characterId, { kind: "player", hp: p.hp, maxHp: p.maxHp, name: p.name });
    if (p.characterId === this.characterId) {
      this.localPlayerId = p.characterId;
      this.cameras.main.startFollow(sprite, true, 0.1, 0.1);
      this.cameras.main.setZoom(1.2);
    }
  }

  private addMonsterEntity(m: any) {
    if (this.entities.has(m.id)) return;
    const sprite = this.add.sprite(m.x, m.y, `sprite_${m.definitionId}`).setScale(m.size / 20);
    sprite.setTint(m.color ? hexToNumber(m.color) : 0xffffff);
    const nameText = this.add.text(m.x, m.y - 34, `${m.name} (Lv${m.level})`, {
      fontSize: "12px", color: "#ff8888", stroke: "#000", strokeThickness: 3,
    }).setOrigin(0.5);
    const hpBarBg = this.add.graphics();
    const hpBar = this.add.graphics();
    this.world.add([sprite, nameText, hpBarBg, hpBar]);
    this.entities.set(m.id, { sprite, nameText, hpBar, hpBarBg });
    this.entityMeta.set(m.id, { kind: "monster", hp: m.hp, maxHp: m.maxHp, name: m.name });
    this.monsters.set(m.id, m);
    sprite.setInteractive({ useHandCursor: true });
    sprite.on("pointerdown", () => this.targetMonster(m.id));
  }

  private addNPCEntity(n: any) {
    if (this.entities.has(n.npc_id)) return;
    const sprite = this.add.sprite(400 + Math.random() * 400, 300 + Math.random() * 400, "sprite_human").setScale(1.4);
    // posicionamento simples — servidor ainda não envia posições fixas de NPC; usa spawn aleatório estável por id
    const seed = this.hashCode(n.npc_id);
    const x = 200 + (seed % 500);
    const y = 150 + ((seed >> 8) % 400);
    sprite.setPosition(x, y);
    const nameText = this.add.text(x, y - 38, `${n.npc_id.split("_")[1] || n.npc_id}`, {
      fontSize: "12px", color: "#b5e48c", stroke: "#000", strokeThickness: 3,
    }).setOrigin(0.5);
    this.world.add([sprite, nameText]);
    this.entities.set(n.npc_id, { sprite, nameText, hpBar: null as any, hpBarBg: null as any });
    this.entityMeta.set(n.npc_id, { kind: "npc", hp: 0, maxHp: 0, name: n.npc_id });
    this.npcs.set(n.npc_id, n);
    sprite.setInteractive({ useHandCursor: true });
    sprite.on("pointerdown", () => this.interactNPC(n.npc_id));
  }

  private updateNetworkPlayer(p: any) {
    const ent = this.entities.get(p.characterId);
    if (!ent) return;
    // interpolação simples em direção ao estado recebido
    ent.sprite.setPosition(p.x, p.y);
    ent.nameText.setPosition(p.x, p.y - 42);
    this.updateHpBar(ent, p.hp, p.maxHp);
  }

  private updateMonster(m: any) {
    const ent = this.entities.get(m.id);
    if (!ent) return;
    ent.sprite.setPosition(m.x, m.y);
    ent.nameText.setPosition(m.x, m.y - 34);
    this.updateHpBar(ent, m.hp, m.maxHp);
  }

  private updateHpBar(ent: ViewEntity, hp: number, maxHp: number) {
    if (!ent.hpBar) return;
    const pct = Math.max(0, Math.min(1, hp / maxHp));
    ent.hpBar.clear();
    ent.hpBar.fillStyle(0xff4444, 1);
    ent.hpBar.fillRect(0, 0, 34 * pct, 6);
    ent.hpBarBg.setPosition(ent.sprite.x - 17, ent.sprite.y - 36);
    ent.hpBar.setPosition(ent.sprite.x - 17, ent.sprite.y - 36);
  }

  private removeEntity(id: string) {
    const ent = this.entities.get(id);
    if (ent) {
      ent.sprite.destroy();
      ent.nameText.destroy();
      ent.hpBar?.destroy();
      ent.hpBarBg?.destroy();
      this.entities.delete(id);
    }
    this.entityMeta.delete(id);
  }

  /* ---------------- Input / movimento ---------------- */

  private setupInput() {
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      // ignora se clicou em UI/HUD
      if (pointer.worldX === undefined) return;
      const worldPt = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.net.send({ type: "player.move", x: worldPt.x, y: worldPt.y });
    });

    // Teclas de habilidade 1-4
    this.input.keyboard?.on("keydown-1", () => this.useSkill(0));
    this.input.keyboard?.on("keydown-2", () => this.useSkill(1));
    this.input.keyboard?.on("keydown-3", () => this.useSkill(2));
    this.input.keyboard?.on("keydown-4", () => this.useSkill(3));

    this.input.keyboard?.on("keydown-E", () => this.togglePanel("inventory"));
    this.input.keyboard?.on("keydown-M", () => this.togglePanel("market"));
    this.input.keyboard?.on("keydown-Q", () => this.togglePanel("quests"));

    // Atualiza alvo do cursor para habilidades com mira
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      this.cursorWorld = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    });
  }

  private cursorWorld = { x: 400, y: 400 };
  private lastSkillUse = 0;

  private useSkill(index: number) {
    const skillId = this.skills[index];
    if (!skillId) return;
    const now = Date.now();
    const ready = this.skillCooldowns.get(skillId) ?? 0;
    if (now < ready) {
      this.addChat("sistema", `Recarregando ${skillId}...`, "system");
      return;
    }
    // alvo: monstro sob o cursor, senão posição do cursor
    let targetId: string | undefined;
    let mx = this.cursorWorld.x;
    let my = this.cursorWorld.y;
    for (const [id, ent] of this.entities) {
      if (this.entityMeta.get(id)?.kind !== "monster") continue;
      const spr = ent.sprite;
      const d = Phaser.Math.Distance.Between(spr.x, spr.y, mx, my);
      if (d < 40) { targetId = id; break; }
    }
    this.net.send({ type: "player.use_skill", skillId, targetId, x: mx, y: my });
    this.lastSkillUse = now;
  }

  private targetMonster(id: string) {
    this.selectedTargetMonster = id;
    this.addChat("sistema", `Alvo selecionado: ${id}`, "system");
  }

  private selectedTargetMonster: string | undefined;

  /* ---------------- HUD ---------------- */

  private createHUD() {
    const w = this.scale.width;
    const h = this.scale.height;

    // Barra de vida e mana (topo esquerda) — sobre o mundo
    const hud = this.add.container(20, 20).setDepth(1000);
    const hpBg = this.add.rectangle(0, 0, 160, 18, 0x333333).setOrigin(0, 0);
    const hpBar = this.add.rectangle(0, 0, 160, 18, 0xff4444).setOrigin(0, 0);
    const manaBg = this.add.rectangle(0, 22, 160, 12, 0x222244).setOrigin(0, 0);
    const manaBar = this.add.rectangle(0, 22, 160, 12, 0x4444ff).setOrigin(0, 0);
    const label = this.add.text(0, -20, "Jogador", { fontSize: "16px", color: "#e0e0e0" }).setOrigin(0, 0);
    this.add.text(0, 40, `Cobre: ${this.coin}`, { fontSize: "14px", color: "#f4d03f" }).setOrigin(0, 0);
    hud.add([hpBg, hpBar, manaBg, manaBar, label]);
    (this as any)._hudBars = { hpBar, manaBar };
  }

  /* ---------------- Painéis HTML ---------------- */

  private createPanels() {
    const base = {
      position: "absolute" as const,
      background: "#1a1a2e",
      border: "2px solid #4caf50",
      borderRadius: "8px",
      color: "#e0e0e0",
      fontFamily: '"Courier New", monospace',
      padding: "12px",
      zIndex: "100",
      display: "none",
      boxShadow: "0 0 20px rgba(0,0,0,0.9)",
    };
    const container = document.getElementById("game")!.parentElement!;

    this.inventoryPanel = this.makePanel("inventory", "Inventário", { ...base, left: "20px", top: "100px", width: "300px" }, container);
    this.marketPanel = this.makePanel("market", "Mercado", { ...base, right: "20px", top: "100px", width: "360px" }, container);
    this.chatPanel = this.makePanel("chat", "Chat", { ...base, right: "20px", bottom: "20px", width: "340px", height: "220px", overflowY: "auto" }, container);
    this.questPanel = this.makePanel("quests", "Missões", { ...base, left: "20px", top: "420px", width: "300px" }, container);
    this.statsPanel = this.makePanel("stats", "Ficha", { ...base, left: "20px", top: "260px", width: "300px" }, container);
  }

  private makePanel(id: string, title: string, style: any, container: HTMLElement) {
    const el = document.createElement("div");
    el.id = "veyrath-" + id;
    Object.assign(el.style, style);
    el.innerHTML = `<div style="font-weight:bold; color:#f4d03f; margin-bottom:8px; border-bottom:1px solid #333; padding-bottom:4px">${title}</div><div id="veyrath-${id}-content"></div><div style="margin-top:10px; text-align:right"><button id="veyrath-${id}-close" style="padding:4px 12px; background:#444; color:#fff; border:none; border-radius:4px; cursor:pointer">Fechar</button></div>`;
    container.appendChild(el);
    (el.querySelector("#veyrath-" + id + "-close") as HTMLButtonElement).onclick = () => { el.style.display = "none"; };
    return el;
  }

  private togglePanel(id: "inventory" | "market" | "quests" | "stats") {
    const el = document.getElementById("veyrath-" + id)!;
    el.style.display = el.style.display === "none" ? "block" : "none";
    if (id === "inventory") this.refreshInventoryPanel();
    if (id === "market") { this.net.send({ type: "market.list" }); }
    if (id === "quests") this.refreshQuestPanel();
    if (id === "stats") this.refreshStatsPanel();
  }

  /* ---------------- Inventário ---------------- */

  private refreshInventoryFromServer() {
    // pede ao servidor reenviar (simplificado; o servidor já envia em xp.gained etc.)
  }

  private refreshInventoryPanel() {
    const content = document.getElementById("veyrath-inventory-content")!;
    content.innerHTML = `<div>Cobre: <b style="color:#f4d03f">${this.coin}</b></div><hr style="border-color:#333;margin:6px 0">`;
    if (!this.inventoryItems.length) {
      content.innerHTML += `<div style="color:#888">Vazio</div>`;
    }
    for (const it of this.inventoryItems) {
      const def = ITEMS[it.definitionId];
      const row = document.createElement("div");
      row.style.cssText = "display:flex; gap:8px; align-items:center; padding:4px 0; border-bottom:1px solid #222;";
      row.innerHTML = `<div style="width:26px; height:26px; background:#333; border:1px solid #555; border-radius:4px; flex-shrink:0"></div>
        <div style="flex:1"><div style="font-weight:bold">${def ? def.name : it.definitionId}</div><div style="font-size:11px; color:#888">${def ? def.description : ""}</div></div>
        <div style="color:#f4d03f">${it.quantity}</div>`;
      if (def?.consumableEffect) {
        const btn = document.createElement("button");
        btn.textContent = "Usar";
        btn.style.cssText = "padding:2px 8px; background:#2e7d32; color:#fff; border:none; border-radius:4px; cursor:pointer";
        btn.onclick = () => this.net.send({ type: "player.use_item", itemInstanceId: it.id });
        row.appendChild(btn);
      }
      content.appendChild(row);
    }
  }

  /* ---------------- Mercado ---------------- */

  private refreshMarketPanel(orders: any[]) {
    const content = document.getElementById("veyrath-market-content")!;
    content.innerHTML = "";
    if (!orders.length) {
      content.innerHTML = `<div style="color:#888">Sem ordens no mercado.</div>`;
      return;
    }
    for (const o of orders) {
      const def = ITEMS[o.item_definition_id];
      const row = document.createElement("div");
      row.style.cssText = "display:flex; gap:6px; align-items:center; padding:4px 0; border-bottom:1px solid #222; font-size:12px;";
      row.innerHTML = `<div style="flex:1">${def ? def.name : o.item_definition_id} ×${o.quantity}</div>
        <div style="color:#f4d03f">${o.price_per_unit} cobre/un</div>
        <div>${o.side === "sell" ? "Venda" : "Compra"}</div>`;
      if (o.side === "sell") {
        const btn = document.createElement("button");
        btn.textContent = "Comprar";
        btn.style.cssText = "padding:2px 8px; background:#2e7d32; color:#fff; border:none; border-radius:4px; cursor:pointer";
        btn.onclick = () => this.net.send({ type: "market.accept_order", orderId: o.id });
        row.appendChild(btn);
      }
      content.appendChild(row);
    }
    // botão colocar ordem de venda rápida do primeiro item
    const sellBtn = document.createElement("button");
    sellBtn.textContent = "Vender item selecionado (simplificado)";
    sellBtn.style.cssText = "margin-top:10px; padding:6px; background:#1a4a2a; color:#b5e48c; border:none; border-radius:4px; cursor:pointer; width:100%";
    sellBtn.onclick = () => {
      const item = this.inventoryItems.find((i) => ITEMS[i.definitionId]?.stackable);
      if (!item) { alert("Nenhum item negociável"); return; }
      const qty = prompt("Quantidade?", "1");
      const price = prompt("Preço unitário (cobre)?", "5");
      if (qty === null || price === null) return;
      this.net.send({ type: "market.place_order", side: "sell", itemDefinitionId: item.definitionId, quantity: parseInt(qty) || 1, pricePerUnit: parseInt(price) || 5 });
    };
    content.appendChild(sellBtn);
  }

  /* ---------------- Missões ---------------- */

  private refreshQuestPanel() {
    const content = document.getElementById("veyrath-quests-content")!;
    content.innerHTML = `<div style="color:#888">Carregando missões...</div>`;
    // Questas são gerenciadas pelo servidor; exibe placeholder informativo
    content.innerHTML = `
      <div style="margin-bottom:8px"><b style="color:#f4d03f">Primeiros Passos</b><div style="font-size:11px;color:#888">Derrote 3 Slimes de Orvalho nas Pradarias.</div></div>
      <div style="margin-bottom:8px"><b style="color:#f4d03f">Ameaça das Raízes</b><div style="font-size:11px;color:#888">Cooperativo (2-5): elimine o Guardião de Raízes no Bosque dos Sussurros.</div></div>
      <div style="font-size:11px; color:#888">Missões são aceitas falando com NPCs nas cidades.</div>
    `;
  }

  /* ---------------- Ficha ---------------- */

  private refreshStatsPanel() {
    const content = document.getElementById("veyrath-stats-content")!;
    content.innerHTML = `<div style="color:#888">Carregando ficha...</div>`;
  }

  /* ---------------- NPC / diálogo ---------------- */

  private interactNPC(npcId: string) {
    this.net.send({ type: "player.interact", targetId: npcId });
  }

  private showNPCDialog(msg: any) {
    const el = document.getElementById("veyrath-npc-dialog") || this.makeNPCDialog();
    const content = document.getElementById("veyrath-npc-content")!;
    let html = `<div style="font-weight:bold;color:#f4d03f;margin-bottom:6px">${msg.npcId}</div>`;
    for (const m of msg.messages) html += `<div style="margin-bottom:4px">${m}</div>`;
    html += `<hr style="border-color:#333;margin:8px 0"><div style="font-size:11px;color:#8ecae6">Estoque: ${JSON.stringify(msg.stock || {})}</div>`;
    content.innerHTML = html;
    el.style.display = "block";
  }

  private makeNPCDialog() {
    const el = document.createElement("div");
    el.id = "veyrath-npc-dialog";
    Object.assign(el.style, {
      position: "absolute", left: "50%", top: "100px", transform: "translateX(-50%)",
      background: "#1a1a2e", border: "2px solid #4caf50", borderRadius: "8px",
      color: "#e0e0e0", fontFamily: '"Courier New", monospace', padding: "14px",
      zIndex: "200", minWidth: "300px", boxShadow: "0 0 20px rgba(0,0,0,0.9)",
    });
    el.innerHTML = `<div id="veyrath-npc-content"></div><div style="margin-top:10px; text-align:right"><button id="veyrath-npc-close" style="padding:4px 12px; background:#444; color:#fff; border:none; border-radius:4px; cursor:pointer">Fechar</button></div>`;
    document.getElementById("game")!.parentElement!.appendChild(el);
    (el.querySelector("#veyrath-npc-close") as HTMLButtonElement).onclick = () => { el.style.display = "none"; };
    return el;
  }

  /* ---------------- Chat ---------------- */

  private addChat(from: string, text: string, type: string) {
    const content = document.getElementById("veyrath-chat-content")!;
    const line = document.createElement("div");
    line.style.cssText = "padding:2px 0; font-size:12px; border-bottom:1px solid #111;";
    const color = type === "system" ? "#b5e48c" : type === "private" ? "#f4d03f" : "#e0e0e0";
    line.innerHTML = `<span style="color:#8ecae6">${from}</span>: <span style="color:${color}">${this.escape(text)}</span>`;
    content.appendChild(line);
    content.scrollTop = content.scrollHeight;
  }

  /* ---------------- Combate / feedback ---------------- */

  private showDamageNumber(targetId: string, damage: number, crit: boolean, missed: boolean, kind: string = "dmg") {
    const ent = this.entities.get(targetId);
    if (!ent) return;
    const txt = this.add.text(ent.sprite.x, ent.sprite.y - 30, missed ? "Errou" : kind === "xp" ? `+${damage}` : `-${damage}`, {
      fontSize: crit ? "18px" : "16px",
      color: kind === "xp" ? "#f4d03f" : (missed ? "#888" : crit ? "#ffd700" : "#ff4444"),
      stroke: "#000", strokeThickness: 2,
    }).setOrigin(0.5).setDepth(1000);
    this.damageTexts.push(txt);
    this.tweens.add({
      targets: txt,
      y: txt.y - 30,
      alpha: 0,
      duration: 800,
      onComplete: () => { txt.destroy(); this.damageTexts = this.damageTexts.filter((t) => t !== txt); },
    });
  }

  private showHealNumber(targetId: string, heal: number) {
    const ent = this.entities.get(targetId);
    if (!ent) return;
    const txt = this.add.text(ent.sprite.x, ent.sprite.y - 30, `+${heal}`, {
      fontSize: "16px", color: "#44ff44", stroke: "#000", strokeThickness: 2,
    }).setOrigin(0.5).setDepth(1000);
    this.tweens.add({
      targets: txt, y: txt.y - 30, alpha: 0, duration: 800,
      onComplete: () => txt.destroy(),
    });
  }

  /* ---------------- Utilitários ---------------- */

  private hex(s: string) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h) % 0xffffff;
  }

  private hashCode(s: string) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  private escape(s: string) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* Ciclo de vida */
  update() {
    // barra do jogador local
    const hud = (this as any)._hudBars;
    if (hud && this.entityMeta.has(this.characterId)) {
      const meta = this.entityMeta.get(this.characterId)!;
      const pct = Math.max(0, Math.min(1, meta.hp / meta.maxHp));
      hud.hpBar.displayWidth = 160 * pct;
    }
  }

  shutdown() {
    this.net?.disconnect();
  }
}
