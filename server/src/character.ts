/**
 * Serviço de personagens: criação, carregamento e persistência.
 * O servidor é autoridade sobre stats, inventário e progressão.
 */

import { v4 as uuidv4 } from "uuid";
import { getDb } from "./db.js";
import { RACES, CLASSES, SKILLS, ITEMS, ITEM_BY_ID, STARTING_ITEMS, ZONE_BY_ID, START_ZONE } from "@veyrath/shared";
import type { Character, RaceId, ClassId, ItemInstance } from "@veyrath/shared";

const NOW = () => Date.now();

function baseStatsFor(race: RaceId, classId: ClassId) {
  const r = RACES.find((x) => x.id === race)!;
  const c = CLASSES.find((x) => x.id === classId)!;
  return {
    str: r.stats.str + c.stats.str,
    dex: r.stats.dex + c.stats.dex,
    int: r.stats.int + c.stats.int,
    con: r.stats.con + c.stats.con,
  };
}

function combatStats(base: { str: number; dex: number; int: number; con: number }) {
  const maxHp = 400 + base.con * 12 + base.str * 4;
  const maxMana = 150 + base.int * 10;
  return {
    maxHp,
    hp: maxHp,
    maxMana,
    mana: maxMana,
    attackPower: 8 + base.str * 1.4,
    magicPower: 6 + base.int * 1.6,
    defense: 2 + base.con * 0.8,
    speed: 100 + base.dex * 3,
    critChance: 5,
  };
}

export function createCharacter({
  accountId,
  name,
  race,
  classId,
}: {
  accountId: string;
  name: string;
  race: RaceId;
  classId: ClassId;
}): Character {
  if (!name || name.length < 2 || name.length > 20) {
    throw new Error("Nome_invalido");
  }
  const base = baseStatsFor(race, classId);
  const zone = ZONE_BY_ID[START_ZONE];
  const character: Character = {
    id: uuidv4(),
    accountId,
    name,
    race,
    class: classId,
    level: 1,
    xp: 0,
    statsBase: base,
    skills: [...new Set([...CLASSES.find((c) => c.id === classId)!.startingSkills])],
    skillLevels: {},
    quests: [],
    inventory: {
      items: [],
      weight: 0,
      maxWeight: 1000,
      coin: 120,
    },
    combatStats: combatStats(base),
    position: { x: zone.spawnPoint.x, y: zone.spawnPoint.y, zone: START_ZONE },
    hunger: 70,
    createdAt: NOW(),
    updatedAt: NOW(),
    homunculi: [],
  };
  // Itens iniciais
  for (const defId of STARTING_ITEMS) {
    addItemInstance(character, defId, 1);
  }
  return character;
}

function addItemInstance(character: Character, definitionId: string, quantity: number) {
  const def = ITEM_BY_ID[definitionId];
  if (!def) return;
  const instance: ItemInstance = {
    id: uuidv4(),
    definitionId,
    quantity,
    equipped: false,
    createdAt: NOW(),
  };
  character.inventory.items.push(instance);
  if (def.slot && !def.stackable) {
    instance.equipped = true;
    instance.slot = def.slot;
    applyEquipmentStat(character, def, true);
  }
}

function applyEquipmentStat(character: Character, def: any, add: boolean) {
  const sign = add ? 1 : -1;
  if (def.id === "iron_sword") character.combatStats.attackPower += sign * 6;
  if (def.id === "oak_staff") character.combatStats.magicPower += sign * 6;
  if (def.id === "leather_armor") character.combatStats.defense += sign * 3;
  if (def.id === "iron_chainmail") character.combatStats.defense += sign * 6;
}

export async function saveCharacter(db: any, character: Character): Promise<void> {
  character.updatedAt = NOW();
  await db.run(
    `INSERT OR REPLACE INTO characters (id, account_id, name, race, class, level, xp, stats_base, position, hunger, coin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      character.id,
      character.accountId,
      character.name,
      character.race,
      character.class,
      character.level,
      character.xp,
      JSON.stringify(character.statsBase),
      JSON.stringify(character.position),
      character.hunger,
      character.inventory.coin,
      character.createdAt,
      character.updatedAt,
    ]
  );

  await db.run(`DELETE FROM inventory_items WHERE character_id = ?`, [character.id]);
  const ins = db.prepare(
    `INSERT INTO inventory_items (id, character_id, definition_id, quantity, equipped, slot, durability, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const now = NOW();
  for (const item of character.inventory.items) {
    await ins.run([
      item.id,
      character.id,
      item.definitionId,
      item.quantity,
      item.equipped ? 1 : 0,
      item.slot ?? null,
      item.durability ?? null,
      now,
    ]);
  }

  await db.run(`DELETE FROM character_skills WHERE character_id = ?`, [character.id]);
  const insS = db.prepare(
    `INSERT INTO character_skills (character_id, skill_id, level) VALUES (?, ?, ?)`
  );
  for (const skillId of character.skills) {
    await insS.run([character.id, skillId, character.skillLevels[skillId] ?? 1]);
  }

  await db.run(`DELETE FROM character_quests WHERE character_id = ?`, [character.id]);
  const insQ = db.prepare(
    `INSERT INTO character_quests (character_id, quest_id, status, objectives, claimed) VALUES (?, ?, ?, ?, ?)`
  );
  for (const q of character.quests) {
    await insQ.run([
      character.id,
      q.questId,
      q.status,
      JSON.stringify(q.objectives),
      0,
    ]);
  }
}

export async function loadCharacter(db: any, characterId: string): Promise<Character | null> {
  const row = await db.get(`SELECT * FROM characters WHERE id = ?`, [characterId]);
  if (!row) return null;
  const itemsRows: any[] = await db.all(`SELECT * FROM inventory_items WHERE character_id = ?`, [characterId]);
  const items: ItemInstance[] = itemsRows.map((r) => ({
    id: r.id,
    definitionId: r.definition_id,
    quantity: r.quantity,
    equipped: r.equipped === 1,
    slot: r.slot,
    durability: r.durability,
    createdAt: r.created_at,
  }));
  const skillsRows: any[] = await db.all(`SELECT skill_id, level FROM character_skills WHERE character_id = ?`, [characterId]);
  const skillLevels: Record<string, number> = {};
  const skills: string[] = [];
  for (const r of skillsRows) {
    skills.push(r.skill_id);
    skillLevels[r.skill_id] = r.level;
  }
  const questsRows: any[] = await db.all(`SELECT * FROM character_quests WHERE character_id = ?`, [characterId]);
  const quests = questsRows.map((r) => ({
    questId: r.quest_id,
    status: r.status,
    objectives: JSON.parse(r.objectives || "[]"),
  }));

  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    race: row.race as RaceId,
    class: row.class as ClassId,
    level: row.level,
    xp: row.xp,
    statsBase: JSON.parse(row.stats_base),
    skills,
    skillLevels,
    quests,
    inventory: {
      items,
      weight: 0,
      maxWeight: 1000,
      coin: row.coin,
    },
    combatStats: combatStats(JSON.parse(row.stats_base)),
    position: JSON.parse(row.position),
    hunger: row.hunger,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    homunculi: [],
  };
}

export async function loadCharactersByAccount(db: any, accountId: string): Promise<Character[]> {
  const rows: any[] = await db.all(`SELECT * FROM characters WHERE account_id = ? ORDER BY updated_at DESC`, [accountId]);
  const out: Character[] = [];
  for (const row of rows) {
    const char = await loadCharacter(db, row.id);
    if (char) out.push(char);
  }
  return out;
}

export function applyEquipmentStats(character: Character) {
  const base = combatStats(character.statsBase);
  Object.assign(character.combatStats, base);
  for (const item of character.inventory.items) {
    if (item.equipped) {
      const def = ITEM_BY_ID[item.definitionId];
      if (def) applyEquipmentStat(character, def, true);
    }
  }
}
