/**
 * BootScene: gera placeholders de pixel art proceduralmente (canvas)
 * e carrega áudio procedural. Nenhum asset externo é necessário.
 * Todos os placeholders são originais e identificados como tal.
 */

import Phaser from "phaser";

const PALLETE = {
  grass: "#5a8a3a",
  grassDark: "#4a7030",
  dirt: "#7a5a3a",
  water: "#3a6ea5",
  waterDark: "#2a5a85",
  tree: "#3d6a3d",
  treeTrunk: "#5d4037",
  leaf: "#6ab04c",
  crystal: "#67e8f9",
  crystalDark: "#22c3e0",
  stone: "#8a8a8a",
  stoneDark: "#6a6a6a",
  wood: "#c8a260",
  roof: "#7a3a3a",
  wall: "#e8d8b8",
  slime: "#8ecae6",
  slimeCrystal: "#67e8f9",
  goblin: "#7cb342",
  wolf: "#5d4037",
  mushroom: "#9c27b0",
  guardian: "#2e7d32",
  human: "#f4a261",
  slimeRace: "#b5e48c",
  goblinRace: "#7cb342",
  dryad: "#4caf50",
  feral: "#e64a19",
  ui: "#2b2b40",
  uiLight: "#e0e0e0",
  gold: "#f4d03f",
};

function canvas(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  draw(ctx);
  return c;
}

function rect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string
) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function tileGrass(ctx: CanvasRenderingContext2D, w: number, h: number) {
  rect(ctx, 0, 0, w, h, PALLETE.grass);
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = PALLETE.grassDark;
    ctx.fillRect(
      Math.floor(Math.sin(i) * 10 + w / 2),
      Math.floor(Math.cos(i) * 10 + h / 2),
      2,
      2
    );
  }
}

export class BootScene extends Phaser.Scene {
  preload() {
    const load = this.load;

    // --- Texturas de tiles/cenário (procedurais) ---
    const textures: [string, HTMLCanvasElement][] = [
      ["tex_grass", canvas(64, 64, (c) => tileGrass(c, 64, 64))],
      [
        "tex_dirt",
        canvas(64, 64, (c) => {
          rect(c, 0, 0, 64, 64, PALLETE.dirt);
          for (let i = 0; i < 8; i++)
            c.fillRect(Math.random() * 64, Math.random() * 64, 1, 1);
        }),
      ],
      [
        "tex_water",
        canvas(64, 64, (c) => {
          rect(c, 0, 0, 64, 64, PALLETE.water);
          c.fillStyle = PALLETE.waterDark;
          for (let y = 0; y < 64; y += 8) c.fillRect(0, y, 64, 2);
        }),
      ],
      [
        "tex_tree",
        canvas(64, 64, (c) => {
          rect(c, 28, 30, 8, 34, PALLETE.treeTrunk);
          rect(c, 10, 10, 44, 40, PALLETE.tree);
          rect(c, 18, 4, 28, 22, PALLETE.leaf);
        }),
      ],
      [
        "tex_crystal",
        canvas(32, 32, (c) => {
          rect(c, 12, 0, 8, 32, PALLETE.crystalDark);
          rect(c, 14, 4, 4, 24, PALLETE.crystal);
        }),
      ],
      [
        "tex_stone",
        canvas(64, 64, (c) => {
          rect(c, 0, 0, 64, 64, PALLETE.stone);
          c.fillStyle = PALLETE.stoneDark;
          for (let i = 0; i < 10; i++)
            c.fillRect(Math.random() * 64, Math.random() * 64, 2, 2);
        }),
      ],
      [
        "tex_building",
        canvas(96, 96, (c) => {
          rect(c, 0, 0, 96, 96, PALLETE.wall);
          rect(c, 0, 0, 96, 24, PALLETE.roof);
          rect(c, 34, 40, 28, 40, PALLETE.roof); // porta
          rect(c, 16, 20, 14, 14, PALLETE.wall); // janela
          rect(c, 66, 20, 14, 14, PALLETE.wall);
        }),
      ],
      [
        "tex_ancient_tree",
        canvas(128, 128, (c) => {
          rect(c, 56, 40, 16, 88, PALLETE.treeTrunk);
          rect(c, 24, 10, 80, 70, PALLETE.tree);
          rect(c, 36, 4, 56, 30, PALLETE.leaf);
          // raízes mágicas
          c.fillStyle = PALLETE.crystal;
          c.fillRect(20, 110, 20, 6);
          c.fillRect(88, 110, 20, 6);
          c.fillRect(54, 96, 8, 20);
        }),
      ],
      [
        "tex_coin",
        canvas(24, 24, (c) => {
          c.fillStyle = PALLETE.gold;
          c.beginPath();
          c.arc(12, 12, 10, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = "#b8860b";
          c.fillRect(10, 5, 4, 14);
        }),
      ],
    ];

    for (const [key, c] of textures) {
      this.textures.addCanvas(key, c);
    }

    // --- Sprites de raças (procedurais, identificados como placeholders) ---
    const raceColors: Record<string, string> = {
      human: PALLETE.human,
      slime: PALLETE.slimeRace,
      goblin: PALLETE.goblinRace,
      dryad: PALLETE.dryad,
      feral: PALLETE.feral,
    };
    for (const [race, color] of Object.entries(raceColors)) {
      const c = canvas(32, 48, (ctx) => {
        // corpo
        rect(ctx, 10, 16, 12, 24, color);
        rect(ctx, 10, 12, 12, 6, "#d4a373"); // cabeça/face base
        rect(ctx, 12, 10, 8, 4, color); // cabelo/topo
        // olhos
        rect(ctx, 12, 14, 2, 2, "#111");
        rect(ctx, 18, 14, 2, 2, "#111");
        // pernas
        rect(ctx, 11, 40, 4, 8, "#444");
        rect(ctx, 17, 40, 4, 8, "#444");
      });
      this.textures.addCanvas(`sprite_${race}`, c);
    }

    // --- Monstros ---
    const monsterColors: Record<string, string> = {
      dew_slime: PALLETE.slime,
      crystal_slime: PALLETE.slimeCrystal,
      goblin_scavenger: PALLETE.goblin,
      brumaflor_wolf: PALLETE.wolf,
      jumping_mushroom: PALLETE.mushroom,
      root_guardian: PALLETE.guardian,
    };
    for (const [id, color] of Object.entries(monsterColors)) {
      const size = id === "root_guardian" ? 40 : 28;
      const c = canvas(size, size, (ctx) => {
        rect(ctx, 2, 2, size - 4, size - 4, color);
        ctx.fillStyle = "#111";
        ctx.fillRect(6, 6, 3, 3);
        ctx.fillRect(size - 9, 6, 3, 3);
      });
      this.textures.addCanvas(`sprite_${id}`, c);
    }

    // --- UI ---
    const c = canvas(16, 16, (c) => {
      rect(c, 0, 0, 16, 16, PALLETE.ui);
      c.strokeStyle = PALLETE.uiLight;
      c.strokeRect(0, 0, 15, 15);
    });
    this.textures.addCanvas("tex_ui_panel", c);

    this.scene.start("TitleScene");
  }
}
