/**
 * Cliente de rede WebSocket para o servidor VEYRATH.
 * Envelope de mensagem: { type: string, ...payload }
 */

export type NetMessage = { type: string; [key: string]: any };

export class NetClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, ((msg: NetMessage) => void)[]>();
  private connected = false;
  private reconnectTimer: any = null;
  private token = "";

  constructor(private url: string) {}

  connect(token: string) {
    this.token = token;
    this.ws = new WebSocket(this.url);
    this.ws.binaryType = "arraybuffer";
    this.ws.onopen = () => {
      this.connected = true;
      this.send({ type: "auth.token", token });
    };
    this.ws.onmessage = (ev) => {
      try {
        const msg: NetMessage = JSON.parse(ev.data.toString());
        const hs = this.handlers.get(msg.type);
        if (hs) hs.forEach((h) => h(msg));
      } catch (e) {
        console.error("Mensagem inválida", ev.data);
      }
    };
    this.ws.onclose = () => {
      this.connected = false;
      this.ws = null;
      this.reconnectTimer = setTimeout(() => this.connect(this.token), 3000);
    };
    this.ws.onerror = (e) => console.error("WS error", e);
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) { this.ws.close(); this.ws = null; }
    this.connected = false;
  }

  on(type: string, handler: (msg: NetMessage) => void) {
    const hs = this.handlers.get(type) ?? [];
    hs.push(handler);
    this.handlers.set(type, hs);
  }

  off(type: string, handler: (msg: NetMessage) => void) {
    const hs = this.handlers.get(type);
    if (!hs) return;
    const i = hs.indexOf(handler);
    if (i >= 0) hs.splice(i, 1);
  }

  send(msg: NetMessage) {
    if (this.ws && this.connected) this.ws.send(JSON.stringify(msg));
  }

  isConnected() {
    return this.connected;
  }
}
