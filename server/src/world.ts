/**
 * Simulação do mundo vivo (fora da presença dos jogadores).
 * Executada por tick (WORLD_TICK_MS, padrão 10s). Atualiza:
 * - Produção e consumo dos NPCs econômicos.
 * - Estoque limitado e variação de preços baseada em oferta/demanda.
 * Não mantém milhares de processos ativos: apenas um intervalo por processo.
 */

import { getDb } from "./db.js";
import { ITEMS } from "@veyrath/shared";

interface NpcRow {
  npc_id: string;
  profession: string;
  coin: number;
  stock: string;
  last_produced_at: number;
  production: string;
}

const PRODUCTION_COST: Record<string, Record<string, number>> = {
  bread: { herb: 1, coin: 2 },
  stew: { herb: 2, bread: 1, coin: 5 },
};

const CONSUMPTION: Record<string, { item: string; rate: number }> = {
  agricultor: { item: "bread", rate: 1 },
  cozinheiro: { item: "bread", rate: 1 },
};

function parseJson(value: unknown, fallback: any): any {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

export async function worldTick(): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  const rows: NpcRow[] = (await db.all(`SELECT * FROM npcs`)) as NpcRow[];
  for (const npc of rows) {
    const stock: Record<string, number> = { ...parseJson(npc.stock, {}) };
    const production: Record<string, number> = {
      ...parseJson(npc.production, {}),
    };
    let coin = npc.coin;

    const ticksPassed = Math.floor((now - Number(npc.last_produced_at)) / 10000);
    if (ticksPassed < 1) continue;

    for (const [itemId, perTick] of Object.entries(production)) {
      const cost = PRODUCTION_COST[itemId];
      if (!cost) continue;
      let canProduce = Number(perTick) * ticksPassed;
      for (const [input, qtyPer] of Object.entries(cost)) {
        if (input === "coin") continue;
        const have = stock[input] || 0;
        const maxByInput = Math.floor(have / Number(qtyPer));
        canProduce = Math.min(canProduce, maxByInput);
      }
      if (canProduce <= 0) continue;
      for (const [input, qtyPer] of Object.entries(cost)) {
        if (input === "coin") {
          coin -= canProduce * Number(qtyPer);
          continue;
        }
        stock[input] = (stock[input] || 0) - canProduce * Number(qtyPer);
      }
      stock[itemId] = (stock[itemId] || 0) + canProduce;
      coin += canProduce * 1; // pequena renda com venda local
    }

    // Consumo de necessidades
    const need = CONSUMPTION[npc.profession];
    if (need) {
      const have = stock[need.item] || 0;
      const consume = Math.min(have, need.rate * ticksPassed);
      stock[need.item] = have - consume;
    }

    // Limite de estoque (não acumula infinito)
    for (const [itemId, qty] of Object.entries(stock)) {
      if (Number(qty) > 200) stock[itemId] = 200;
    }

    await db.run(
      `UPDATE npcs SET coin = ?, stock = ?, last_produced_at = ?, production = ? WHERE npc_id = ?`,
      [
        coin,
        JSON.stringify(stock),
        now,
        JSON.stringify(production),
        npc.npc_id,
      ]
    );
  }
}
