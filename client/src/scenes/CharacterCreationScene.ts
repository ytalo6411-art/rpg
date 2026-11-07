/**
 * Criação de personagem: nome, raça (5), classe (4), preview do sprite.
 * Envia ao servidor via HTTP; ao sucesso inicia a GameScene.
 */

import Phaser from "phaser";
import { RACES, CLASSES } from "@veyrath/shared";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

export class CharacterCreationScene extends Phaser.Scene {
  private token = "";
  private accountId = "";
  private selectedRace = "human";
  private selectedClass = "warrior";
  private nameText!: Phaser.GameObjects.Text;
  private raceButtons: Phaser.GameObjects.Text[] = [];
  private classButtons: Phaser.GameObjects.Text[] = [];
  private preview!: Phaser.GameObjects.Image;
  private previewFrame!: Phaser.GameObjects.Graphics;
  private nameInput!: HTMLInputElement;

  constructor() {
    super("CharacterCreationScene");
  }

  init(data: { token: string; accountId: string }) {
    this.token = data.token;
    this.accountId = data.accountId;
  }

  create() {
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;

    this.add.text(centerX, 60, "Criar Personagem", {
      fontSize: "40px", color: "#f4d03f", stroke: "#2e7d32", strokeThickness: 4,
    }).setOrigin(0.5);

    // Nome (input HTML sobre o canvas)
    this.createNameInput();

    // Raças
    this.add.text(120, 130, "Raça", { fontSize: "20px", color: "#8ecae6" });
    const raceY = 170;
    RACES.forEach((race, i) => {
      const btn = this.add.text(120 + i * 100, raceY, race.name, {
        fontSize: "16px", color: "#e0e0e0", backgroundColor: "#1a4a2a",
        padding: { x: 10, y: 6 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      btn.on("pointerdown", () => this.selectRace(race.id, btn));
      this.raceButtons.push(btn);
      // ícone da raça
      this.add.image(120 + i * 100, raceY - 34, `sprite_${race.id}`).setScale(1.4);
    });
    this.selectRace("human", this.raceButtons[0]);

    // Classes
    this.add.text(120, 300, "Classe", { fontSize: "20px", color: "#8ecae6" });
    const classY = 340;
    CLASSES.forEach((cls, i) => {
      const btn = this.add.text(120 + i * 100, classY, cls.name, {
        fontSize: "16px", color: "#e0e0e0", backgroundColor: "#1a4a2a",
        padding: { x: 10, y: 6 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      btn.on("pointerdown", () => this.selectClass(cls.id, btn));
      this.classButtons.push(btn);
    });
    this.selectClass("warrior", this.classButtons[0]);

    // Descrição
    this.nameText = this.add.text(centerX, 470, "", {
      fontSize: "15px", color: "#b5e48c",
    }).setOrigin(0.5);

    // Preview
    this.previewFrame = this.add.graphics();
    this.preview = this.add.image(centerX + 220, 280, `sprite_${this.selectedRace}`).setScale(2);
    this.updatePreview();

    // Botão criar
    const createBtn = this.add.text(centerX, 560, "Criar e entrar no mundo", {
      fontSize: "22px", color: "#ffffff", backgroundColor: "#2e7d32",
      padding: { x: 24, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    createBtn.on("pointerdown", () => this.createCharacter());

    // Voltar
    const backBtn = this.add.text(centerX, 610, "Voltar", {
      fontSize: "16px", color: "#888",
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    backBtn.on("pointerdown", () => this.scene.start("TitleScene"));
  }

  private createNameInput() {
    const old = document.getElementById("veyrath-char-name");
    if (old) old.remove();
    const input = document.createElement("input");
    input.id = "veyrath-char-name";
    input.type = "text";
    input.maxLength = 20;
    input.value = "Aventureiro";
    Object.assign(input.style, {
      position: "absolute", left: "50%", top: "142px",
      transform: "translateX(-50%)",
      width: "260px", padding: "8px", fontSize: "16px",
      fontFamily: '"Courier New", monospace',
      background: "#0f0f1a", color: "#fff", border: "2px solid #4caf50",
      borderRadius: "4px", zIndex: "40",
    });
    document.getElementById("game")!.parentElement!.appendChild(input);
    this.nameInput = input;
  }

  private selectRace(race: string, btn: Phaser.GameObjects.Text) {
    this.selectedRace = race;
    this.raceButtons.forEach((b) => b.setBackgroundColor("#1a4a2a"));
    btn.setBackgroundColor("#4caf50");
    this.preview.setTexture(`sprite_${race}`);
    this.updatePreview();
  }

  private selectClass(cls: string, btn: Phaser.GameObjects.Text) {
    this.selectedClass = cls;
    this.classButtons.forEach((b) => b.setBackgroundColor("#1a4a2a"));
    btn.setBackgroundColor("#2e7d32");
    this.updatePreview();
  }

  private updatePreview() {
    const race = RACES.find((r) => r.id === this.selectedRace)!;
    const cls = CLASSES.find((c) => c.id === this.selectedClass)!;
    this.nameText.text = `${race.name} — ${cls.name}\n${cls.description}`;
    const tintMap: Record<string, number> = {
      human: 0xf4a261, slime: 0xb5e48c, goblin: 0x7cb342, dryad: 0x4caf50, feral: 0xe64a19,
    };
    this.preview.setTint(tintMap[this.selectedRace] ?? 0xffffff);
    this.previewFrame.clear();
    this.previewFrame.lineStyle(4, tintMap[this.selectedRace] ?? 0xffffff);
    this.previewFrame.strokeRect(this.preview.x - 40, this.preview.y - 60, 80, 120);
  }

  private async createCharacter() {
    const name = this.nameInput.value.trim();
    if (!name) {
      alert("Digite um nome");
      return;
    }
    try {
      const res = await fetch(`${API}/characters`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({ name, race: this.selectedRace, classId: this.selectedClass }),
      });
      const json = await res.json();
      if (!json.ok) {
        alert(json.error || "Erro ao criar personagem");
        return;
      }
      localStorage.setItem("veyrath_character", JSON.stringify(json.character));
      this.scene.start("GameScene", {
        token: this.token,
        characterId: json.character.id,
      });
    } catch (e) {
      alert("Falha de conexão com o servidor");
    }
  }
}
