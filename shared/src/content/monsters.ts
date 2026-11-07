/* Monstros iniciais — definições de conteúdo */
import type { ZoneId } from "../types.js";

export interface MonsterDefinition {
  id: string;
  name: string;
  family: "slime" | "goblin" | "beast" | "fungus" | "guardian";
  zone: ZoneId;
  level: number;
  combatStats: {
    maxHp: number;
    attackPower: number;
    defense: number;
    speed: number;
  };
  perceptionRadius: number;
  chaseRadius: number;
  behavior: "passive" | "aggressive" | "territorial" | "fleeing";
  respawnSec: number;
  xpReward: number;
  coinReward: number;
  drops: { itemId: string; chance: number; min: number; max: number }[];
  abilities: string[];
  size: number; // raio do sprite, em pixels
  color: string;
}

export const MONSTERS: MonsterDefinition[] = [
  {
    id: "dew_slime",
    name: "Slime de Orvalho",
    family: "slime",
    zone: "meadows",
    level: 1,
    combatStats: { maxHp: 45, attackPower: 6, defense: 2, speed: 45 },
    perceptionRadius: 160,
    chaseRadius: 260,
    behavior: "passive",
    respawnSec: 25,
    xpReward: 12,
    coinReward: 3,
    drops: [{ itemId: "apple", chance: 0.15, min: 1, max: 2 }],
    abilities: ["basic_attack"],
    size: 18,
    color: "#8ecae6",
  },
  {
    id: "crystal_slime",
    name: "Slime de Cristal",
    family: "slime",
    zone: "varkhenn_mines",
    level: 6,
    combatStats: { maxHp: 120, attackPower: 14, defense: 12, speed: 35 },
    perceptionRadius: 180,
    chaseRadius: 240,
    behavior: "territorial",
    respawnSec: 40,
    xpReward: 45,
    coinReward: 12,
    drops: [{ itemId: "crystal_shard", chance: 0.35, min: 1, max: 2 }],
    abilities: ["basic_attack"],
    size: 20,
    color: "#67e8f9",
  },
  {
    id: "goblin_scavenger",
    name: "Goblin Catador",
    family: "goblin",
    zone: "meadows",
    level: 2,
    combatStats: { maxHp: 55, attackPower: 9, defense: 3, speed: 65 },
    perceptionRadius: 220,
    chaseRadius: 340,
    behavior: "fleeing",
    respawnSec: 30,
    xpReward: 18,
    coinReward: 5,
    drops: [{ itemId: "iron_ore", chance: 0.2, min: 1, max: 1 }],
    abilities: ["basic_attack"],
    size: 16,
    color: "#7cb342",
  },
  {
    id: "brumaflor_wolf",
    name: "Lobo de Brumaflor",
    family: "beast",
    zone: "meadows",
    level: 3,
    combatStats: { maxHp: 70, attackPower: 12, defense: 4, speed: 80 },
    perceptionRadius: 260,
    chaseRadius: 420,
    behavior: "aggressive",
    respawnSec: 35,
    xpReward: 25,
    coinReward: 7,
    drops: [],
    abilities: ["basic_attack"],
    size: 19,
    color: "#5d4037",
  },
  {
    id: "jumping_mushroom",
    name: "Cogumelo Saltador",
    family: "fungus",
    zone: "whisper_woods",
    level: 4,
    combatStats: { maxHp: 60, attackPower: 10, defense: 5, speed: 40 },
    perceptionRadius: 200,
    chaseRadius: 300,
    behavior: "aggressive",
    respawnSec: 30,
    xpReward: 30,
    coinReward: 6,
    drops: [{ itemId: "herb", chance: 0.25, min: 1, max: 2 }],
    abilities: ["basic_attack"],
    size: 17,
    color: "#9c27b0",
  },
  {
    id: "root_guardian",
    name: "Guardião de Raízes",
    family: "guardian",
    zone: "whisper_woods",
    level: 8,
    combatStats: { maxHp: 220, attackPower: 22, defense: 10, speed: 30 },
    perceptionRadius: 300,
    chaseRadius: 400,
    behavior: "territorial",
    respawnSec: 90,
    xpReward: 120,
    coinReward: 30,
    drops: [{ itemId: "herb", chance: 0.5, min: 1, max: 3 }],
    abilities: ["basic_attack"],
    size: 28,
    color: "#2e7d32",
  },
];

export const MONSTER_BY_ID: Record<string, MonsterDefinition> = Object.fromEntries(
  MONSTERS.map((m) => [m.id, m])
);
