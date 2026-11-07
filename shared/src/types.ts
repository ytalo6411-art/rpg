/**
 * Tipos de domínio compartilhados entre cliente e servidor.
 * Identificadores estáveis para itens, criaturas, missões e habilidades.
 */

export type EntityId = string;
export type AccountId = string;
export type CharacterId = string;
export type ItemInstanceId = string;

/* ---------- Raças e classes ---------- */

export const RACE_IDS = [
  "human",
  "slime",
  "goblin",
  "dryad",
  "feral",
] as const;
export type RaceId = (typeof RACE_IDS)[number];

export const CLASS_IDS = ["warrior", "mage", "summoner", "ranger"] as const;
export type ClassId = (typeof CLASS_IDS)[number];

export interface Race {
  id: RaceId;
  name: string;
  description: string;
  activeSkill: string;
  passive: string;
  color: string; // cor identificativa da UI/silhueta
  stats: { str: number; dex: number; int: number; con: number };
}

export interface Class {
  id: ClassId;
  name: string;
  description: string;
  role: string;
  stats: { str: number; dex: number; int: number; con: number };
  startingSkills: string[];
}

/* ---------- Atributos e stats ---------- */

export interface StatsBase {
  str: number;
  dex: number;
  int: number;
  con: number;
}

export interface CombatStats {
  maxHp: number;
  hp: number;
  maxMana: number;
  mana: number;
  attackPower: number;
  magicPower: number;
  defense: number;
  speed: number;
  critChance: number;
}

/* ---------- Itens ---------- */

export type ItemType =
  | "weapon"
  | "armor"
  | "consumable"
  | "material"
  | "quest"
  | "homunculus_core"
  | "tool";

export interface ItemDefinition {
  id: string;
  type: ItemType;
  name: string;
  description: string;
  icon: string;
  stackable: boolean;
  maxStack: number;
  sellPrice: number;
  buyPrice?: number;
  levelRequired: number;
  raceRestriction?: RaceId;
  classRestriction?: ClassId;
  slot?: "weapon" | "chest" | "head" | "hands" | "feet" | "accessory";
  consumableEffect?: {
    type: "heal" | "hunger" | "buff";
    value: number;
    hunger?: number;
    durationSec?: number;
    buffStat?: string;
    buffValue?: number;
  };
}

export interface ItemInstance {
  id: ItemInstanceId;
  definitionId: string;
  quantity: number;
  equipped: boolean;
  slot?: string;
  durability?: number;
  createdAt: number;
}

/* ---------- Inventário e equipamentos ---------- */

export interface Inventory {
  items: ItemInstance[];
  weight: number;
  maxWeight: number;
  coin: number;
}

/* ---------- Habilidades ---------- */

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  classId?: ClassId; // undefined = racial/generica
  raceId?: RaceId;
  type: "active" | "passive";
  cooldownSec: number;
  manaCost: number;
  range: number;
  areaRadius?: number;
  element?: "fire" | "water" | "earth" | "air" | "none";
  effect: string;
}

/* ---------- Missões ---------- */

export type QuestStatus = "available" | "in_progress" | "completed" | "claimed";

export interface QuestObjective {
  id: string;
  type: "kill" | "collect" | "reach" | "talk" | "craft";
  targetId: string;
  amount: number;
  current: number;
}

export interface QuestDefinition {
  id: string;
  title: string;
  description: string;
  giverNpcId?: string;
  regionId: string;
  minLevel: number;
  objectives: QuestObjective[];
  rewards: {
    xp: number;
    coin: number;
    itemIds?: string[];
  };
  cooperative: boolean;
  minPlayers: number;
  maxPlayers: number;
}

export interface QuestState {
  questId: string;
  status: QuestStatus;
  objectives: { objectiveId: string; current: number }[];
}

/* ---------- Personagem ---------- */

export interface Character {
  id: CharacterId;
  accountId: AccountId;
  name: string;
  race: RaceId;
  class: ClassId;
  level: number;
  xp: number;
  statsBase: StatsBase;
  skills: string[]; // ids de habilidades desbloqueadas
  skillLevels: Record<string, number>;
  quests: QuestState[];
  inventory: Inventory;
  combatStats: CombatStats;
  position: { x: number; y: number; zone: string };
  hunger: number; // 0..100
  createdAt: number;
  updatedAt: number;
  homunculi: CharacterId[]; // ids de homúnculos próprios
}

/* ---------- Homúnculos ---------- */

export interface HomunculusClass {
  id: string;
  name: string;
  role: string;
}

export interface Homunculus {
  id: CharacterId;
  ownerId: CharacterId;
  name: string;
  classId: string;
  level: number;
  xp: number;
  combatStats: CombatStats;
  position: { x: number; y: number; zone: string };
  hunger: number;
  createdAt: number;
  updatedAt: number;
  dead: boolean;
  deadAt?: number;
}

/* ---------- Mundo / zonas ---------- */

export type ZoneId =
  | "lumenfall"
  | "meadows"
  | "whisper_woods"
  | "varkhenn_mines"
  | "dungeon_sunken_roots";

export interface ZoneDefinition {
  id: ZoneId;
  name: string;
  type: "city" | "field" | "dungeon";
  minLevel: number;
  spawnPoint: { x: number; y: number };
  bounds: { x: number; y: number; w: number; h: number };
  music: string;
}

/* ---------- Economia ---------- */

export type OrderSide = "buy" | "sell";

export interface MarketOrder {
  id: string;
  sellerId?: CharacterId;
  buyerId?: CharacterId;
  itemDefinitionId: string;
  quantity: number;
  pricePerUnit: number;
  side: OrderSide;
  createdAt: number;
  expiresAt: number;
  fulfilled: boolean;
}

export interface NpcEconomyRecord {
  npcId: string;
  profession: string;
  coin: number;
  stock: Record<string, number>; // itemId -> quantidade
  lastProducedAt: number;
  productionRatePerTick: Record<string, number>;
}

/* ---------- Protocolo de rede (visão resumida) ---------- */

export interface ServerMessage {
  type: string;
  [key: string]: unknown;
}

export interface ClientMessage {
  type: string;
  [key: string]: unknown;
}
