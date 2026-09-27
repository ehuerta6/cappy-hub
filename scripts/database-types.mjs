import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { format, resolveConfig } from "prettier";

const path = "lib/database.types.ts";
const generated = execFileSync(
  "node_modules/.bin/supabase",
  ["gen", "types", "typescript", "--local", "--schema", "public"],
  { encoding: "utf8" },
);
const formatted = await format(generated, {
  ...(await resolveConfig(path)),
  filepath: path,
});
if (process.argv.includes("--check")) {
  if (readFileSync(path, "utf8") !== formatted) {
    throw new Error(
      "Database types differ from local migrations. Run npm run db:types.",
    );
  }
  console.log("Database types match the migrated local schema.");
} else {
  // Write only after successful generation: errors cannot truncate checked-in types.
  writeFileSync(path, formatted);
}
