/**
 * Executa migrações pendentes.
 * Uso: npx tsx src/migrate.ts
 */
import { getDb, closeDb } from "./db.js";
import { MIGRATIONS } from "./migrations.js";

async function main() {
  const db = await getDb();
  await db.run(`CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY)`);

  const appliedRows: { id: string }[] = (await db.all(`SELECT id FROM schema_migrations`)) as { id: string }[];
  const applied = new Set(appliedRows.map((r) => r.id as string));

  let pending = 0;
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    console.log(`Aplicando migração ${migration.id}...`);
    await migration.up(db);
    await db.run(`INSERT INTO schema_migrations (id) VALUES (?)`, [migration.id]);
    pending++;
  }

  if (pending === 0) {
    console.log("Nenhuma migração pendente.");
  } else {
    console.log(`${pending} migração(ões) aplicada(s).`);
  }

  await closeDb();
}

main().catch((err) => {
  console.error("Erro ao migrar:", err);
  process.exit(1);
});
