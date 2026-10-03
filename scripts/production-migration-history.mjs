export function parseMigrationList(output) {
  const listedLocal = new Set();
  const remoteMigrations = new Set();
  const ansiStrippedOutput = output.replace(/\u001b\[[0-9;]*m/g, "");

  for (const line of ansiStrippedOutput.split(/\r?\n/)) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    const columns = trimmedLine.split(/[│|]/).map((column) => column.trim());
    if (columns.length === 1) continue;
    if (columns.every((column) => /^[+\-=─━┼╋╬╪╫┬┴├┤]+$/.test(column))) {
      continue;
    }
    if (columns.length !== 3) {
      throw new Error(
        "Supabase migration list output contained an unrecognized row.",
      );
    }

    if (
      columns[0].toUpperCase() === "LOCAL" &&
      columns[1].toUpperCase() === "REMOTE"
    ) {
      continue;
    }

    // The CLI's text renderer may wrap cells in Markdown code spans.
    // Only LOCAL and REMOTE are migration versions; TIME is informational.
    const normalizeVersion = (column) =>
      column.replace(/^`(.*)`$/, "$1").trim();
    const localVersion = normalizeVersion(columns[0]);
    const remoteVersion = normalizeVersion(columns[1]);
    if (
      (!localVersion && !remoteVersion) ||
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
