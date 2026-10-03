import { readFileSync } from "node:fs";
import { defineConfig } from "@playwright/test";

function readLocalSetting(name: string) {
  const envFile = readFileSync(`${process.cwd()}/.env.local`, "utf8");
  const line = envFile
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(`${name}=`));
  if (!line) {
    throw new Error(
      `Missing ${name} in .env.local. Run npm run local:reset before browser smoke tests.`,
    );
  }
  return line
    .slice(name.length + 1)
    .replace(
      /^(?:"(.*)"|'(.*)')$/,
      (_match, doubleQuoted, singleQuoted) => doubleQuoted ?? singleQuoted,
    );
}

const supabaseUrl = readLocalSetting("NEXT_PUBLIC_SUPABASE_URL");
const publishableKey = readLocalSetting("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const supabaseOrigin = new URL(supabaseUrl);
const inheritedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const inheritedKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (
  supabaseOrigin.protocol !== "http:" ||
  !["localhost", "127.0.0.1"].includes(supabaseOrigin.hostname)
) {
  throw new Error(
    "Browser smoke tests require the local Supabase URL from npm run local:reset.",
  );
}
if (
  (inheritedUrl && inheritedUrl !== supabaseUrl) ||
  (inheritedKey && inheritedKey !== publishableKey)
) {
  throw new Error(
    "Browser smoke tests refuse mismatched Supabase environment overrides. Unset them and rebuild after npm run local:reset.",
  );
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: "test-results",
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    browserName: "chromium",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      NEXT_TELEMETRY_DISABLED: "1",
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    },
  },
});
