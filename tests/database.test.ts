import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { it } from "vitest";

it("enforces the MVP invariants in local PostgreSQL (pgTAP)", () => {
  // Run real SQL assertions. A missing database or failed assertion fails npm test.
  execFileSync("node_modules/.bin/supabase", ["test", "db", "--local"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    stdio: "inherit",
    timeout: 120_000,
  });
}, 130_000);
