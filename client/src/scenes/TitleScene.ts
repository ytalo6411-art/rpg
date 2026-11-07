/**
 * Tela inicial: autenticação (cadastro/login) via API HTTP do servidor.
 * Em modo de desenvolvimento local, também permite entrar direto com uma
 * conta de teste preenchida.
 */

import Phaser from "phaser";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

export class TitleScene extends Phaser.Scene {
  private title!: Phaser.GameObjects.Text;
  private container!: Phaser.GameObjects.Container;

  constructor() {
    super("TitleScene");
  }

  create() {
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;
    this.add.text(centerX, 120, "VEYRATH", {
      fontFamily: '"Courier New", monospace',
      fontSize: "64px",
      color: "#f4d03f",
      stroke: "#2e7d32",
      strokeThickness: 6,
    }).setOrigin(0.5);

    this.add.text(centerX, 190, "MMORPG de fantasia, aventura e economia viva", {
      fontFamily: '"Courier New", monospace',
      fontSize: "18px",
      color: "#e0e0e0",
    }).setOrigin(0.5);

    this.add.text(centerX, 225, "Primeira fatia vertical — v0.1", {
      fontFamily: '"Courier New", monospace',
      fontSize: "14px",
      color: "#8ecae6",
    }).setOrigin(0.5);

    this.container = this.add.container(centerX, centerY + 60);

    const btnEnter = this.add.text(0, 0, "Entrar no mundo", {
      fontSize: "24px",
      color: "#ffffff",
      backgroundColor: "#2e7d32",
      padding: { x: 24, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    btnEnter.on("pointerdown", () => this.showAuth());

    const btnDev = this.add.text(0, 60, "Modo local (desenvolvimento)", {
      fontSize: "18px",
      color: "#b5e48c",
      backgroundColor: "#1a4a2a",
      padding: { x: 24, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    btnDev.on("pointerdown", async () => {
      await this.authOrDev("veyrath_dev", "veyrath_dev");
    });

    this.container.add([btnEnter, btnDev]);

    // Aviso de modo local
    this.add.text(centerX, this.scale.height - 40, "Modo de desenvolvimento local — SQLite, sem serviços externos", {
      fontSize: "12px",
      color: "#888",
    }).setOrigin(0.5);

    // Formulário HTML (overlay)
    this.createAuthForm();
  }

  private createAuthForm() {
    // Remove formulário anterior se houver
    const old = document.getElementById("veyrath-auth");
    if (old) old.remove();

    const form = document.createElement("div");
    form.id = "veyrath-auth";
    Object.assign(form.style, {
      position: "absolute",
      top: "50%", left: "50%",
      transform: "translate(-50%, -50%)",
      display: "none",
      background: "#1a1a2e",
      border: "2px solid #4caf50",
      borderRadius: "8px",
      padding: "24px",
      zIndex: "50",
      color: "#e0e0e0",
      fontFamily: '"Courier New", monospace',
      width: "320px",
      boxShadow: "0 0 24px rgba(0,0,0,0.8)",
    });
    form.innerHTML = `
      <h2 style="margin:0 0 16px; color:#f4d03f; text-align:center">Conta VEYRATH</h2>
      <div style="display:flex; gap:8px; margin-bottom:12px">
        <button id="veyrath-auth-login" style="flex:1; padding:6px; background:#2e7d32; color:#fff; border:none; border-radius:4px; cursor:pointer">Entrar</button>
        <button id="veyrath-auth-register" style="flex:1; padding:6px; background:#1a4a2a; color:#b5e48c; border:none; border-radius:4px; cursor:pointer">Criar conta</button>
      </div>
      <div style="margin-bottom:10px"><label style="display:block; font-size:12px; color:#8ecae6">Usuário</label><input id="veyrath-auth-user" type="text" style="width:100%; padding:6px; background:#0f0f1a; border:1px solid #333; color:#fff; border-radius:4px" /></div>
      <div style="margin-bottom:16px"><label style="display:block; font-size:12px; color:#8ecae6">Senha</label><input id="veyrath-auth-pass" type="password" style="width:100%; padding:6px; background:#0f0f1a; border:1px solid #333; color:#fff; border-radius:4px" /></div>
      <div id="veyrath-auth-msg" style="color:#ff6b6b; font-size:12px; margin-bottom:10px; min-height:16px"></div>
      <div style="text-align:center"><button id="veyrath-auth-close" style="padding:6px 16px; background:#444; color:#fff; border:none; border-radius:4px; cursor:pointer">Fechar</button></div>
    `;
    document.getElementById("game")!.parentElement!.appendChild(form);

    const mode = (document.getElementById("veyrath-auth-user") as HTMLInputElement);
    (document.getElementById("veyrath-auth-login") as HTMLButtonElement).onclick = async () => {
      const u = (document.getElementById("veyrath-auth-user") as HTMLInputElement).value;
      const p = (document.getElementById("veyrath-auth-pass") as HTMLInputElement).value;
      await this.doAuth("login", u, p);
    };
    (document.getElementById("veyrath-auth-register") as HTMLButtonElement).onclick = async () => {
      const u = (document.getElementById("veyrath-auth-user") as HTMLInputElement).value;
      const p = (document.getElementById("veyrath-auth-pass") as HTMLInputElement).value;
      await this.doAuth("register", u, p);
    };
    (document.getElementById("veyrath-auth-close") as HTMLButtonElement).onclick = () => {
      form.style.display = "none";
    };
  }

  private showAuth() {
    const form = document.getElementById("veyrath-auth");
    if (form) form.style.display = "block";
  }

  private async doAuth(action: "login" | "register", user: string, pass: string) {
    const msg = document.getElementById("veyrath-auth-msg")!;
    if (!user || !pass) { msg.textContent = "Preencha usuário e senha"; return; }
    try {
      const res = await fetch(`${API}/auth/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user, password: pass }),
      });
      const json = await res.json();
      if (!json.ok) { msg.textContent = json.error || "Erro"; return; }
      // Guarda token e avança para seleção de personagem
      localStorage.setItem("veyrath_token", json.token);
      localStorage.setItem("veyrath_account", json.accountId);
      msg.textContent = "";
      (document.getElementById("veyrath-auth") as HTMLElement).style.display = "none";
      this.scene.start("CharacterCreationScene", { token: json.token, accountId: json.accountId });
    } catch (e) {
      msg.textContent = "Falha de conexão com o servidor";
    }
  }

  private async authOrDev(user: string, pass: string) {
    try {
      let res = await fetch(`${API}/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user, password: pass }),
      });
      if (!res.ok) {
        res = await fetch(`${API}/auth/register`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: user, password: pass }),
        });
      }
      const json = await res.json();
      if (json.ok) {
        localStorage.setItem("veyrath_token", json.token);
        localStorage.setItem("veyrath_account", json.accountId);
        this.scene.start("CharacterCreationScene", { token: json.token, accountId: json.accountId });
      }
    } catch (e) {
      console.error("Dev auth falhou", e);
    }
  }
}
