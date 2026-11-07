/* Classes iniciais — definições de conteúdo */
import type { Class } from "../types.js";

export const CLASSES: Class[] = [
  {
    id: "warrior",
    name: "Guerreiro",
    description: "Defesa, combate corpo a corpo, proteção de aliados e controle de inimigos.",
    role: "Tanque / Dano físico",
    stats: { str: 14, dex: 9, int: 6, con: 13 },
    startingSkills: ["basic_attack", "shield_bash", "defensive_stance"],
  },
  {
    id: "mage",
    name: "Feiticeiro",
    description: "Magias elementais, projéteis, áreas de dano e combinações elementais.",
    role: "Dano mágico à distância",
    stats: { str: 6, dex: 9, int: 15, con: 8 },
    startingSkills: ["basic_attack", "fire_bolt", "frost_nova"],
  },
  {
    id: "summoner",
    name: "Invocador",
    description: "Invocações temporárias, companheiros mágicos e comandos táticos.",
    role: "Invocações / Suporte",
    stats: { str: 7, dex: 10, int: 14, con: 9 },
    startingSkills: ["basic_attack", "summon_imp", "command_attack"],
  },
  {
    id: "ranger",
    name: "Guardião da Natureza",
    description: "Cura, raízes, controle de terreno, proteção e recuperação.",
    role: "Curador / Controle",
    stats: { str: 8, dex: 11, int: 13, con: 10 },
    startingSkills: ["basic_attack", "healing_touch", "entangle"],
  },
];

export const CLASS_BY_ID: Record<string, Class> = Object.fromEntries(
  CLASSES.map((c) => [c.id, c])
);
export type { Class };
