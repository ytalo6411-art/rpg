/* Missões iniciais — definições de conteúdo */
import type { QuestDefinition } from "../types.js";

export const QUESTS: QuestDefinition[] = [
  {
    id: "q_first_steps",
    title: "Primeiros Passos",
    description: "Derrote 3 Slimes de Orvalho nas Pradarias de Brumaflor e volte ao ponto de partida.",
    giverNpcId: "npc_guard_elena",
    regionId: "meadows",
    minLevel: 1,
    objectives: [{ id: "q_first_steps_kill", type: "kill", targetId: "dew_slime", amount: 3, current: 0 }],
    rewards: { xp: 150, coin: 50, itemIds: ["bread"] },
    cooperative: false,
    minPlayers: 1,
    maxPlayers: 1,
  },
  {
    id: "q_herb_gatherer",
    title: "Ervas para a Clínica",
    description: "Colete 5 Ervas Medicinais no Bosque dos Sussurros para o alquimista.",
    giverNpcId: "npc_alchemist",
    regionId: "whisper_woods",
    minLevel: 3,
    objectives: [{ id: "q_herb_collect", type: "collect", targetId: "herb", amount: 5, current: 0 }],
    rewards: { xp: 200, coin: 80, itemIds: ["stew"] },
    cooperative: false,
    minPlayers: 1,
    maxPlayers: 1,
  },
  {
    id: "q_root_threat",
    title: "Ameaça das Raízes",
    description: "O Guardião de Raízes está atacando caravaneiros. Forme um grupo e elimine a ameaça.",
    giverNpcId: "npc_guild_master",
    regionId: "whisper_woods",
    minLevel: 6,
    objectives: [{ id: "q_root_kill", type: "kill", targetId: "root_guardian", amount: 1, current: 0 }],
    rewards: { xp: 500, coin: 200, itemIds: ["iron_chainmail"] },
    cooperative: true,
    minPlayers: 2,
    maxPlayers: 5,
  },
];

export const QUEST_BY_ID: Record<string, QuestDefinition> = Object.fromEntries(
  QUESTS.map((q) => [q.id, q])
);
export type { QuestDefinition };
