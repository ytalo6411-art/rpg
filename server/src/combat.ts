/**
 * Combate autoritativo no servidor.
 * O cliente apenas envia intenção (qual habilidade, qual alvo); o servidor
 * calcula dano, efeitos, loot, XP e valida tudo. Nunca confia no cliente.
 */

import { MONSTER_BY_ID, SKILL_BY_ID, ITEMS, ITEM_BY_ID } from "@veyrath/shared";
import type { MonsterDefinition, SkillDefinition } from "@veyrath/shared";

export interface Combatant {
  id: string;
  type: "player" | "monster" | "homunculus";
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
  elementResistance: Record<string, number>; // 0..1
}

export interface HitResult {
  targetId: string;
  skillId: string;
  damage: number;
  healed: number;
  crit: boolean;
  missed: boolean;
  effect?: string;
  targetHpAfter: number;
  targetManaAfter: number;
  targetDead: boolean;
  xpGranted: number;
  loot: { itemId: string; quantity: number }[];
}

function roll(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function elementBonus(attacker: Combatant, skill: SkillDefinition): number {
  if (!skill.element || skill.element === "none") return 0;
  return attacker.stats.magicPower * 0.5;
}

export function resolveHit(
  attacker: Combatant,
  target: Combatant,
  skillId: string,
  now: number
): HitResult {
  const skill = SKILL_BY_ID[skillId];
  if (!skill) throw new Error(`Habilidade desconhecida: ${skillId}`);

  const missed = roll(1, 100) > 85 + (attacker.stats.speed - target.stats.speed) * 0.05;
  const crit = roll(1, 100) <= attacker.stats.critChance;

  let damage = 0;
  let healed = 0;
  let effect: string | undefined;

  if (skillId === "basic_attack") {
    damage = Math.max(1, attacker.stats.attackPower - target.stats.defense * 0.5);
  } else if (skillId === "shield_bash") {
    damage = Math.max(1, attacker.stats.attackPower * 0.8 - target.stats.defense * 0.4);
    effect = "atordoado";
  } else if (skillId === "defensive_stance") {
    // buff aplicado pelo chamador; sem dano
    effect = "postura_defensiva";
  } else if (skillId === "fire_bolt") {
    damage = Math.max(1, attacker.stats.magicPower * 1.2 + elementBonus(attacker, skill) - target.stats.defense * 0.3);
    effect = "queimando";
  } else if (skillId === "frost_nova") {
    damage = Math.max(1, attacker.stats.magicPower * 1.0 - target.stats.defense * 0.3);
    effect = "lento";
  } else if (skillId === "healing_touch") {
    healed = 60 + attacker.stats.magicPower * 0.4;
    effect = "curado";
  } else if (skillId === "entangle") {
    damage = Math.max(1, attacker.stats.magicPower * 0.6 - target.stats.defense * 0.3);
    effect = "imobilizado";
  } else if (skillId === "racial_healing_roots") {
    healed = 15 + attacker.stats.magicPower * 0.3;
    effect = "regeneracao";
  } else if (skillId === "racial_wild_charge") {
    damage = Math.max(1, attacker.stats.attackPower * 1.3 - target.stats.defense * 0.4);
    effect = "lento";
  } else if (skillId === "racial_sneaky_strike") {
    damage = Math.max(1, attacker.stats.attackPower * 1.5 - target.stats.defense * 0.4);
  } else if (skillId === "racial_shape_shift") {
    effect = "forma_alterada";
  } else if (skillId === "racial_tactical_adaptation") {
    effect = "adaptacao_tatica";
  } else {
    damage = Math.max(1, attacker.stats.attackPower * 0.8 - target.stats.defense * 0.4);
  }

  if (!missed && damage > 0) {
    if (crit) damage *= 1.6;
    // Resistência elemental simplificada
    if (skill.element && skill.element !== "none") {
      const res = target.elementResistance[skill.element] || 0;
      damage *= 1 - res;
    }
    damage = Math.max(0, Math.round(damage * 10) / 10);
  }

  if (!missed && healed > 0) {
    healed = Math.round(healed * 10) / 10;
  }

  let targetHpAfter = target.stats.hp - damage + healed;
  let targetDead = false;
  if (!missed && damage > 0 && targetHpAfter <= 0) {
    targetHpAfter = 0;
    targetDead = true;
  }
  target.stats.hp = Math.max(0, targetHpAfter);
  if (healed > 0) target.stats.hp = Math.min(target.stats.maxHp, target.stats.hp);

  // Mana do atacante
  const manaCost = skill.manaCost;
  attacker.stats.mana = Math.max(0, attacker.stats.mana - manaCost);

  let xpGranted = 0;
  let loot: { itemId: string; quantity: number }[] = [];
  if (targetDead && target.type === "monster") {
    const def = MONSTER_BY_ID[target.id as string];
    if (def) {
      xpGranted = def.xpReward;
      loot = generateLoot(def);
    }
  }

  return {
    targetId: target.id,
    skillId,
    damage: missed ? 0 : damage,
    healed,
    crit,
    missed,
    effect,
    targetHpAfter: target.stats.hp,
    targetManaAfter: target.stats.mana,
    targetDead,
    xpGranted,
    loot,
  };
}

function generateLoot(def: MonsterDefinition): { itemId: string; quantity: number }[] {
  const loot: { itemId: string; quantity: number }[] = [];
  for (const drop of def.drops) {
    if (Math.random() < drop.chance) {
      loot.push({ itemId: drop.itemId, quantity: roll(drop.min, drop.max) });
    }
  }
  // Cobre sempre
  loot.push({ itemId: "coin", quantity: roll(1, Math.max(1, Math.floor(def.coinReward / 2))) });
  return loot;
}

export function computeNextHp(combatant: Combatant, amount: number): { hpAfter: number; dead: boolean } {
  combatant.stats.hp = Math.max(0, Math.min(combatant.stats.maxHp, combatant.stats.hp + amount));
  return { hpAfter: combatant.stats.hp, dead: combatant.stats.hp <= 0 };
}
