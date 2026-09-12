import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { getSql, hasDatabaseUrl } from "@/lib/db/sql";
import { loadEnv } from "@/scripts/load-env";

/**
 * Applies the SQL in migrations/, in filename order.
 *
 * Every statement is idempotent (`IF NOT EXISTS`), so this is safe to re-run
 * and needs no migrations ledger table. Neon's HTTP driver takes one statement
 * per request, so the file is split on semicolons after comments are stripped.
 *
 *   npm run db:migrate
 *
 * Nothing here reads DATABASE_URL at import time — the modules resolve it
 * lazily, after loadEnv() has run.
 */
function statementsIn(path: string): string[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement !== "");
}

async function main(): Promise<void> {
  loadEnv();

  if (!hasDatabaseUrl()) {
    console.error("DATABASE_URL is not set. Add it to .env.local (server-side only).");
    process.exitCode = 1;
    return;
  }

  const sql = getSql();
  if (!sql) return;

  const dir = resolve(process.cwd(), "migrations");
  const files = readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const statements = statementsIn(resolve(dir, file));
    for (const statement of statements) {
      await sql.query(statement);
    }
    console.log(`applied ${file} (${statements.length} statements)`);
  }

  console.log("migrations complete");
}

main().catch((error: unknown) => {
  // Message only: a connection string must never reach a log line.
  console.error("migration failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
