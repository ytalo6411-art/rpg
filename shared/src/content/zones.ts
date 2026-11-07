/* Zonas do mundo — definições de conteúdo */
import type { ZoneDefinition } from "../types.js";

export const ZONES: ZoneDefinition[] = [
  {
    id: "lumenfall",
    name: "Lumenfall",
    type: "city",
    minLevel: 0,
    spawnPoint: { x: 400, y: 400 },
    bounds: { x: 0, y: 0, w: 1400, h: 1000 },
    music: "lumenfall",
  },
  {
    id: "meadows",
    name: "Pradarias de Brumaflor",
    type: "field",
    minLevel: 1,
    spawnPoint: { x: 500, y: 400 },
    bounds: { x: 0, y: 0, w: 1600, h: 1200 },
    music: "meadows",
  },
  {
    id: "whisper_woods",
    name: "Bosque dos Sussurros",
    type: "field",
    minLevel: 4,
    spawnPoint: { x: 300, y: 300 },
    bounds: { x: 0, y: 0, w: 1600, h: 1200 },
    music: "woods",
  },
  {
    id: "varkhenn_mines",
    name: "Minas de Varkhenn",
    type: "field",
    minLevel: 6,
    spawnPoint: { x: 400, y: 400 },
    bounds: { x: 0, y: 0, w: 1400, h: 1000 },
    music: "mines",
  },
  {
    id: "dungeon_sunken_roots",
    name: "Raízes Afundadas",
    type: "dungeon",
    minLevel: 6,
    spawnPoint: { x: 400, y: 400 },
    bounds: { x: 0, y: 0, w: 1200, h: 900 },
    music: "dungeon",
  },
];

export const ZONE_BY_ID: Record<string, ZoneDefinition> = Object.fromEntries(
  ZONES.map((z) => [z.id, z])
);

export const START_ZONE = "lumenfall";
export type { ZoneDefinition };
