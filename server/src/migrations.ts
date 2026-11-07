/**
 * Migrações do banco de dados.
 * Cada migração recebe a abstração Db (SQLite local ou PostgreSQL) e usa
 * apenas placeholders `?` — a camada de banco adapta para PostgreSQL.
 */

export type Migration = {
  id: string;
  up(db: any): void | Promise<void>;
  down(db: any): void | Promise<void>;
};

export const MIGRATIONS: Migration[] = [
  {
    id: "001_initial_schema",
    async up(db) {
      db.run(
        `CREATE TABLE IF NOT EXISTS accounts (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          last_login INTEGER
        )`
      );
      db.run(
        `CREATE TABLE IF NOT EXISTS characters (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL,
          name TEXT NOT NULL,
          race TEXT NOT NULL,
          class TEXT NOT NULL,
          level INTEGER NOT NULL DEFAULT 1,
          xp INTEGER NOT NULL DEFAULT 0,
          stats_base TEXT NOT NULL,
          position TEXT NOT NULL,
          hunger INTEGER NOT NULL DEFAULT 70,
          coin INTEGER NOT NULL DEFAULT 100,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (account_id) REFERENCES accounts(id)
        )`
      );
      db.run(
        `CREATE TABLE IF NOT EXISTS inventory_items (
          id TEXT PRIMARY KEY,
          character_id TEXT NOT NULL,
          definition_id TEXT NOT NULL,
          quantity INTEGER NOT NULL DEFAULT 1,
          equipped INTEGER NOT NULL DEFAULT 0,
          slot TEXT,
          durability INTEGER,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
        )`
      );
      db.run(
        `CREATE TABLE IF NOT EXISTS character_skills (
          character_id TEXT NOT NULL,
          skill_id TEXT NOT NULL,
          level INTEGER NOT NULL DEFAULT 1,
          PRIMARY KEY (character_id, skill_id),
          FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
        )`
      );
      db.run(
        `CREATE TABLE IF NOT EXISTS character_quests (
          character_id TEXT NOT NULL,
          quest_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'in_progress',
          objectives TEXT NOT NULL DEFAULT '[]',
          claimed INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (character_id, quest_id),
          FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
        )`
      );
      db.run(
        `CREATE TABLE IF NOT EXISTS homunculi (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          name TEXT NOT NULL,
          class_id TEXT NOT NULL,
          level INTEGER NOT NULL DEFAULT 1,
          xp INTEGER NOT NULL DEFAULT 0,
          position TEXT NOT NULL,
          hunger INTEGER NOT NULL DEFAULT 70,
          combat_stats TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          dead INTEGER NOT NULL DEFAULT 0,
          dead_at INTEGER,
          FOREIGN KEY (owner_id) REFERENCES characters(id) ON DELETE CASCADE
        )`
      );
      db.run(
        `CREATE TABLE IF NOT EXISTS market_orders (
          id TEXT PRIMARY KEY,
          seller_id TEXT,
          buyer_id TEXT,
          item_definition_id TEXT NOT NULL,
          quantity INTEGER NOT NULL,
          price_per_unit INTEGER NOT NULL,
          side TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          fulfilled INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY (seller_id) REFERENCES characters(id),
          FOREIGN KEY (buyer_id) REFERENCES characters(id)
        )`
      );
      db.run(
        `CREATE TABLE IF NOT EXISTS npcs (
          npc_id TEXT PRIMARY KEY,
          profession TEXT NOT NULL,
          coin INTEGER NOT NULL DEFAULT 0,
          stock TEXT NOT NULL DEFAULT '{}',
          last_produced_at INTEGER NOT NULL,
          production TEXT NOT NULL DEFAULT '{}'
        )`
      );
      db.run(
        `CREATE TABLE IF NOT EXISTS world_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )`
      );
      db.run(`CREATE INDEX IF NOT EXISTS idx_characters_account ON characters(account_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_items_character ON inventory_items(character_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_market_side ON market_orders(side, fulfilled, item_definition_id)`);
    },
    async down(db) {
      db.run(`DROP TABLE IF EXISTS market_orders`);
      db.run(`DROP TABLE IF EXISTS homunculi`);
      db.run(`DROP TABLE IF EXISTS character_quests`);
      db.run(`DROP TABLE IF EXISTS character_skills`);
      db.run(`DROP TABLE IF EXISTS inventory_items`);
      db.run(`DROP TABLE IF EXISTS characters`);
      db.run(`DROP TABLE IF EXISTS accounts`);
      db.run(`DROP TABLE IF EXISTS npcs`);
      db.run(`DROP TABLE IF EXISTS world_state`);
    },
  },
  {
    id: "002_seed_content",
    async up(db) {
      const now = Date.now();
      // Semente de NPCs econômicos de Lumenfall (não produz infinito).
      const npcs = [
        { id: "npc_farmer_1", profession: "agricultor", coin: 300, stock: {}, production: { bread: 2 } },
        { id: "npc_cook_1", profession: "cozinheiro", coin: 250, stock: { bread: 10, stew: 5 }, production: {} },
        { id: "npc_blacksmith_1", profession: "ferreiro", coin: 500, stock: { iron_sword: 1, leather_armor: 2 }, production: {} },
        { id: "npc_alchemist_1", profession: "alquimista", coin: 200, stock: { herb: 20 }, production: {} },
        { id: "npc_merchant_1", profession: "comerciante", coin: 1000, stock: { apple: 30, wood: 50, iron_ore: 20 }, production: {} },
        { id: "npc_guard_elena", profession: "guarda", coin: 100, stock: {}, production: {} },
        { id: "npc_guild_master", profession: "guilda_de_aventureiros", coin: 0, stock: {}, production: {} },
      ];
      for (const npc of npcs) {
        db.run(
          `INSERT OR IGNORE INTO npcs (npc_id, profession, coin, stock, last_produced_at, production) VALUES (?, ?, ?, ?, ?, ?)`,
          [npc.id, npc.profession, npc.coin, JSON.stringify(npc.stock), now, JSON.stringify(npc.production)]
        );
      }
    },
    async down(db) {
      db.run(`DELETE FROM npcs`);
    },
  },
];
