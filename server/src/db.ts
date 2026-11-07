/**
 * Camada de persistência.
 *
 * Modo local (VEYRATH_MODE=local): SQLite via better-sqlite3, arquivo em
 * server/data/veyrath.db. Ideal para desenvolvimento e testes sem serviços
 * externos.
 *
 * Modo produção (VEYRATH_MODE=producao + DATABASE_URL): PostgreSQL via pg.
 *
 * O esquema é idêntico nos dois modos; apenas a execução de SQL difere.
 */

import { Pool } from "pg";
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MODE = process.env.VEYRATH_MODE || "local";
const DATABASE_URL = process.env.DATABASE_URL;

export function isLocalMode(): boolean {
  return MODE !== "producao" && !DATABASE_URL;
}

interface Db {
  run(sql: string, params?: unknown[] | undefined): Promise<unknown>;
  all(sql: string, params?: unknown[] | undefined): Promise<unknown[]>;
  get(sql: string, params?: unknown[] | undefined): Promise<unknown | undefined>;
  prepare(sql: string): {
    run: (params?: unknown[] | undefined) => Promise<unknown>;
    all: (params?: unknown[] | undefined) => Promise<unknown[]>;
    get: (params?: unknown[] | undefined) => Promise<unknown | undefined>;
  };
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

class SqliteDb implements Db {
  private db: Database.Database;
  constructor(file: string) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new Database(file);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
  }
  async run(sql: string, params: unknown[] = []): Promise<unknown> {
    const info = this.db.prepare(sql).run(...params);
    return info;
  }
  async all(sql: string, params: unknown[] = []): Promise<unknown[]> {
    return this.db.prepare(sql).all(...params);
  }
  async get(sql: string, params: unknown[] = []): Promise<unknown | undefined> {
    return this.db.prepare(sql).get(...params);
  }
  prepare(sql: string) {
    const stmt = this.db.prepare(sql);
    return {
      run: async (params: unknown[] = []) => stmt.run(...params),
      all: async (params: unknown[] = []) => stmt.all(...params),
      get: async (params: unknown[] = []) => stmt.get(...params),
    };
  }
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.db.transaction(fn)();
  }
  async close(): Promise<void> {
    this.db.close();
  }
}

function toPgPlaceholders(sql: string): string {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

class PgDb implements Db {
  private pool: Pool;
  constructor(url: string) {
    this.pool = new Pool({ connectionString: url });
  }
  async run(sql: string, params: unknown[] = []): Promise<unknown> {
    const res = await this.pool.query(toPgPlaceholders(sql), params);
    return res;
  }
  async all(sql: string, params: unknown[] = []): Promise<unknown[]> {
    const res = await this.pool.query(toPgPlaceholders(sql), params);
    return res.rows;
  }
  async get(sql: string, params: unknown[] = []): Promise<unknown | undefined> {
    const res = await this.pool.query(toPgPlaceholders(sql), params);
    return res.rows[0];
  }
  prepare(sql: string) {
    const pgSql = toPgPlaceholders(sql);
    return {
      run: async (params: unknown[] = []): Promise<unknown> => {
        const res = await this.pool.query(pgSql, params);
        return res;
      },
      all: async (params: unknown[] = []): Promise<unknown[]> => {
        const res = await this.pool.query(pgSql, params);
        return res.rows;
      },
      get: async (params: unknown[] = []): Promise<unknown | undefined> => {
        const res = await this.pool.query(pgSql, params);
        return res.rows[0];
      },
    };
  }
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn();
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  async close(): Promise<void> {
    await this.pool.end();
  }
}

let instance: Db | null = null;

export async function getDb(): Promise<Db> {
  if (instance) return instance;
  if (isLocalMode()) {
    const file = path.join(__dirname, "..", "data", "veyrath.db");
    instance = new SqliteDb(file);
    console.log("[VEYRATH] Banco local: SQLite em", file);
  } else {
    if (!DATABASE_URL) throw new Error("DATABASE_URL não configurada para modo producao");
    instance = new PgDb(DATABASE_URL);
    console.log("[VEYRATH] Banco: PostgreSQL (DATABASE_URL)");
  }
  return instance as Db;
}

export async function closeDb(): Promise<void> {
  if (instance) {
    await (instance as any).close?.();
    instance = null;
  }
}
