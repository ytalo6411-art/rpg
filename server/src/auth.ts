/**
 * Autenticação de contas.
 * - Cadastro e login com username + senha (bcrypt).
 * - Tokens de sessão simples (aleatórios, armazenados em memória).
 * Modo de desenvolvimento local claramente identificado.
 */

import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "./db.js";

const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 10);

// Sessões ativas em memória: token -> { accountId, characterId?, updatedAt }
export const sessions = new Map<string, { accountId: string; characterId?: string; updatedAt: number }>();

// Limpeza de sessões antigas a cada 10 min
setInterval(() => {
  const now = Date.now();
  const ttl = 30 * 60 * 1000;
  for (const [token, s] of sessions) {
    if (now - s.updatedAt > ttl) sessions.delete(token);
  }
}, 10 * 60 * 1000).unref();

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface AuthResult {
  ok: boolean;
  accountId?: string;
  token?: string;
  error?: string;
}

export async function registerAccount(
  username: string,
  password: string
): Promise<AuthResult> {
  const db = await getDb();
  const existing = await db.get(`SELECT id FROM accounts WHERE username = ?`, [
    username,
  ]);
  if (existing) {
    return { ok: false, error: "Usuario_ja_existe" };
  }
  const id = uuidv4();
  const passwordHash = await hashPassword(password);
  const now = Date.now();
  await db.run(
    `INSERT INTO accounts (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)`,
    [id, username, passwordHash, now]
  );
  const token = uuidv4();
  sessions.set(token, { accountId: id, updatedAt: now });
  return { ok: true, accountId: id, token };
}

export async function loginAccount(
  username: string,
  password: string
): Promise<AuthResult> {
  const db = await getDb();
  const account = await db.get(
    `SELECT id, username, password_hash FROM accounts WHERE username = ?`,
    [username]
  );
  if (!account) {
    return { ok: false, error: "Credenciais_invalidas" };
  }
  const ok = await verifyPassword(password, (account as any).password_hash);
  if (!ok) {
    return { ok: false, error: "Credenciais_invalidas" };
  }
  const now = Date.now();
  await db.run(`UPDATE accounts SET last_login = ? WHERE id = ?`, [
    now,
    (account as any).id,
  ]);
  const token = uuidv4();
  sessions.set(token, { accountId: (account as any).id as string, updatedAt: now });
  return { ok: true, accountId: (account as any).id as string, token };
}

export function getSession(token: string) {
  const s = sessions.get(token);
  if (!s) return null;
  s.updatedAt = Date.now();
  return s;
}

export function setCharacterInSession(token: string, characterId: string) {
  const s = sessions.get(token);
  if (s) s.characterId = characterId;
}

export function requireAuth(token: string): { ok: boolean; accountId?: string; error?: string } {
  const s = getSession(token);
  if (!s) return { ok: false, error: "Nao_autenticado" };
  return { ok: true, accountId: s.accountId };
}
