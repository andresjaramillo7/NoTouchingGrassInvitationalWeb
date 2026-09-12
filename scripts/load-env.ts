import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Minimal .env loader for the local scripts.
 *
 * Next loads .env.local automatically; a plain `node`/`tsx` process does not.
 * Rather than add a dependency for six lines, this reads the same files Next
 * would, and never overwrites a variable the shell already set.
 *
 * Values are read into process.env and are never printed.
 */
const FILES = [".env.local", ".env"];

export function loadEnv(cwd: string = process.cwd()): void {
  for (const file of FILES) {
    const path = resolve(cwd, file);
    if (!existsSync(path)) continue;

    for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line === "" || line.startsWith("#")) continue;

      const separator = line.indexOf("=");
      if (separator === -1) continue;

      const key = line.slice(0, separator).trim();
      if (key === "" || process.env[key] !== undefined) continue;

      let value = line.slice(separator + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    }
  }
}
