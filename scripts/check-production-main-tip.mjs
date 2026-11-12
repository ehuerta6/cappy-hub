import { appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function isCurrentMainCommit(expectedSha, currentSha) {
  if (!/^[a-f0-9]{40}$/.test(expectedSha ?? "")) {
    throw new Error("EXPECTED_DEPLOYMENT_SHA must be a full Git commit SHA.");
  }
  if (!/^[a-f0-9]{40}$/.test(currentSha ?? "")) {
    throw new Error("Could not resolve a valid current main commit SHA.");
  }
  return expectedSha === currentSha;
}

export function currentMainSha() {
  const result = spawnSync("git", ["ls-remote", "origin", "refs/heads/main"], {
    encoding: "utf8",
  });
  if (result.error || result.status !== 0) {
    throw new Error("Could not resolve the current main commit.");
  }
  return result.stdout.trim().split(/\s+/)[0];
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const expectedSha = process.env.EXPECTED_DEPLOYMENT_SHA;
    const currentSha = currentMainSha();
    const isCurrent = isCurrentMainCommit(expectedSha, currentSha);
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        `is_current=${isCurrent}\n`,
        "utf8",
      );
    }
    if (isCurrent) {
      console.log(`Successful CI commit ${expectedSha} is still current main.`);
    } else {
      console.log(
        `Skipping stale production run for ${expectedSha}; main is now ${currentSha}.`,
      );
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
