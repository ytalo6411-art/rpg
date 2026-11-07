/* Raças jogáveis — definições de conteúdo */
import type { Race } from "../types.js";

export const RACES: Race[] = [
  {
    id: "human",
    name: "Humano",
    description: "Versátil e adaptável. Aprende habilidades mais rápido e se sai bem em qualquer profissão.",
    activeSkill: "Adaptação Tática",
    passive: "Aprendizado Versátil (+10% de XP em todas as atividades)",
    color: "#f4a261",
    stats: { str: 10, dex: 10, int: 10, con: 10 },
  },
  {
    id: "slime",
    name: "Slime",
    description: "Gelatinoso e mutável. Absorve efeitos elementais e atravessa espaços estreitos.",
    activeSkill: "Mudança de Forma",
    passive: "Corpo Gelatinoso (reduz dano de impacto em 15%)",
    color: "#b5e48c",
    stats: { str: 8, dex: 12, int: 10, con: 12 },
  },
  {
    id: "goblin",
    name: "Goblin",
    description: "Criativo e ágil. Especialista em armadilhas, dispositivos e golpes rápidos.",
    activeSkill: "Golpe Cúmplice",
    passive: "Mãos Ágeis (+20% de velocidade de crafting)",
    color: "#7cb342",
    stats: { str: 9, dex: 13, int: 11, con: 7 },
  },
  {
    id: "dryad",
    name: "Dríade",
    description: "Ligada à natureza. Cura, raízes, regeneração e controle de terreno.",
    activeSkill: "Raízes Curativas",
    passive: "Toque da Floresta (regenera HP lentamente em áreas verdes)",
    color: "#4caf50",
    stats: { str: 7, dex: 10, int: 13, con: 10 },
  },
  {
    id: "feral",
    name: "Feral",
    description: "Povo animal de sentidos aguçados. Caçador nato com estilo de combate próprio.",
    activeSkill: "Investida Selvagem",
    passive: "Sentidos Aguçados (+15% de percepção e chance crítica)",
    color: "#e64a19",
    stats: { str: 11, dex: 12, int: 8, con: 9 },
  },
];

export const RACE_BY_ID: Record<string, Race> = Object.fromEntries(
  RACES.map((r) => [r.id, r])
);
export type { Race };
