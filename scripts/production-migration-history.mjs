export function parseMigrationList(output) {
  const listedLocal = new Set();
  const remoteMigrations = new Set();
  const ansiStrippedOutput = output.replace(/\u001b\[[0-9;]*m/g, "");

  for (const line of ansiStrippedOutput.split(/\r?\n/)) {
    const trimmedLine = line.trim();
    if (!trimmedLine || !/^[│|].*[│|]$/.test(trimmedLine)) continue;

    const columns = trimmedLine.split(/[│|]/);
    if (columns.length < 4) {
      throw new Error(
        "Supabase migration list output contained an unrecognized row.",
      );
    }

    const localVersion = columns[1].trim();
    const remoteVersion = columns[2].trim();
    if (localVersion === "LOCAL" && remoteVersion === "REMOTE") continue;
    if (!localVersion && !remoteVersion) continue;
    if (
      /^[+\-=─━┼╋╬╪╫┬┴├┤┌┐└┘╭╮╰╯]+$/.test(localVersion) &&
      /^[+\-=─━┼╋╬╪╫┬┴├┤┌┐└┘╭╮╰╯]+$/.test(remoteVersion)
    ) {
      continue;
    }
    if (
      (localVersion && !/^\d{14}$/.test(localVersion)) ||
      (remoteVersion && !/^\d{14}$/.test(remoteVersion))
    ) {
      throw new Error(
        "Supabase migration list output contained an unrecognized row.",
      );
    }

    if (localVersion) listedLocal.add(localVersion);
    if (remoteVersion) remoteMigrations.add(remoteVersion);
  }

  return { listedLocal, remoteMigrations };
}

export function validateMigrationHistory(
  localMigrations,
  listedLocal,
  remoteMigrations,
  requireAligned = false,
) {
  const unexpectedLocal = [...listedLocal].filter(
    (version) => !localMigrations.includes(version),
  );
  const unlistedLocal = localMigrations.filter(
    (version) => !listedLocal.has(version),
  );
  if (unexpectedLocal.length || unlistedLocal.length) {
    throw new Error(
      [
        "Supabase migration list did not match supabase/migrations/.",
        unexpectedLocal.length &&
          `Unexpected local versions: ${unexpectedLocal.join(", ")}`,
        unlistedLocal.length &&
          `Unlisted local versions: ${unlistedLocal.join(", ")}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  const sortedRemoteMigrations = [...remoteMigrations].sort();
  const remoteOnly = sortedRemoteMigrations.filter(
    (version) => !localMigrations.includes(version),
  );
  const missingHistory = sortedRemoteMigrations.some((version, index) => {
    const expected = localMigrations[index];
    return version !== expected;
  });
  if (remoteOnly.length || missingHistory) {
    throw new Error(
      [
        "Production migration history has drifted from supabase/migrations/.",
        remoteOnly.length &&
          `Production-only versions: ${remoteOnly.join(", ")}`,
        missingHistory &&
          "Production history is not a prefix of the local migration history.",
        "Stop and reconcile with a maintainer; do not repair migration history automatically.",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  if (requireAligned && remoteMigrations.size !== localMigrations.length) {
    throw new Error(
      "Production migration history is not aligned after db push. Stop before deploying the application.",
    );
  }
}
