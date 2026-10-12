import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const catalogRoot = path.join(repositoryRoot, "docs/ui-reference");
const manifestPath = path.join(catalogRoot, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function stateKey(item) {
  return JSON.stringify([
    item.role,
    item.scope,
    item.domain,
    item.label,
    item.route,
    item.captureMode,
    item.viewportWidth,
    item.viewportHeight,
  ]);
}

const seenImages = new Set();
const darkStates = new Set();
const lightStates = new Set();
for (const item of manifest) {
  if (!item.image || !item.role || !item.domain || !item.theme) {
    throw new Error(
      "Every manifest entry needs an image, role, domain, and theme.",
    );
  }
  if (!new Set(["Admin", "Lead", "Officer", "Shared"]).has(item.role)) {
    throw new Error(`Unexpected role in catalog: ${item.role}`);
  }
  if (!new Set(["dark", "light"]).has(item.theme)) {
    throw new Error(`Unexpected theme in catalog: ${item.theme}`);
  }
  if (seenImages.has(item.image)) {
    throw new Error(`Duplicate screenshot path: ${item.image}`);
  }
  seenImages.add(item.image);
  await readFile(path.join(catalogRoot, item.image));
  (item.theme === "dark" ? darkStates : lightStates).add(stateKey(item));
}

const missingLight = [...darkStates].filter((key) => !lightStates.has(key));
const missingDark = [...lightStates].filter((key) => !darkStates.has(key));
if (missingLight.length || missingDark.length) {
  throw new Error(
    `Theme pairs are incomplete (${missingLight.length} missing light, ${missingDark.length} missing dark).`,
  );
}

const roles = ["Admin", "Lead", "Officer", "Shared"];
const domains = [...new Set(manifest.map((item) => item.domain))].sort();
const roleOptions = roles
  .map(
    (role) =>
      `<option value="${escapeHtml(role)}">${escapeHtml(role)}</option>`,
  )
  .join("");
const domainOptions = domains
  .map(
    (domain) =>
      `<option value="${escapeHtml(domain)}">${escapeHtml(domain)}</option>`,
  )
  .join("");

const sorted = [...manifest].sort((a, b) =>
  [a.role, a.scope ?? "", a.domain, a.label, a.theme, a.captureMode]
    .join("\0")
    .localeCompare(
      [b.role, b.scope ?? "", b.domain, b.label, b.theme, b.captureMode].join(
        "\0",
      ),
    ),
);
const groups = new Map();
for (const item of sorted) {
  const heading = [item.role, item.scope, item.domain]
    .filter(Boolean)
    .join(" · ");
  if (!groups.has(heading)) groups.set(heading, []);
  groups.get(heading).push(item);
}

const sections = [...groups]
  .map(([heading, items]) => {
    const cards = items
      .map((item) => {
        const search = [
          item.role,
          item.scope,
          item.domain,
          item.label,
          item.state,
          item.route,
          item.theme,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        const dimensions =
          item.captureMode === "full page"
            ? `${item.viewportWidth}px wide · full page (${item.imageHeight}px tall)`
            : `${item.viewportWidth} × ${item.viewportHeight} viewport`;
        return `
          <article class="card" data-role="${escapeHtml(item.role)}" data-domain="${escapeHtml(item.domain)}" data-theme="${escapeHtml(item.theme)}" data-search="${escapeHtml(search)}">
            <a class="image-link" href="${escapeHtml(item.image)}" target="_blank" rel="noreferrer">
              <img loading="lazy" src="${escapeHtml(item.image)}" alt="${escapeHtml(`${item.role} · ${item.label} · ${item.theme} theme`)}">
            </a>
            <div class="card-copy">
              <div class="badges"><span class="badge">${escapeHtml(item.theme)}</span>${item.scope ? `<span class="badge">${escapeHtml(item.scope)}</span>` : ""}</div>
              <h3>${escapeHtml(item.label)}</h3>
              <p>${escapeHtml(dimensions)}${item.route ? ` · <code>${escapeHtml(item.route)}</code>` : ""}</p>
              <a class="full-image" href="${escapeHtml(item.image)}" target="_blank" rel="noreferrer">Open full-size PNG</a>
            </div>
          </article>`;
      })
      .join("");
    return `<section class="group" data-group><h2>${escapeHtml(heading)}</h2><div class="cards">${cards}</div></section>`;
  })
  .join("\n");

const darkCount = manifest.filter((item) => item.theme === "dark").length;
const lightCount = manifest.filter((item) => item.theme === "light").length;
const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Cappy Hub UI catalog</title>
    <style>
      :root { color-scheme: light; font: 15px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #18181b; background: #fafafa; }
      * { box-sizing: border-box; }
      body { margin: 0; }
      header { padding: 28px max(24px, calc((100vw - 1440px) / 2)); background: #18181b; color: #fafafa; }
      header p { max-width: 900px; color: #d4d4d8; }
      main { max-width: 1440px; margin: 0 auto; padding: 24px; }
      .filters { display: grid; grid-template-columns: repeat(4, minmax(150px, 1fr)); gap: 12px; padding: 16px; border: 1px solid #d4d4d8; border-radius: 8px; background: #fff; }
      label { display: grid; gap: 5px; color: #3f3f46; font-size: 13px; font-weight: 600; }
      select, input { min-height: 40px; border: 1px solid #a1a1aa; border-radius: 5px; padding: 7px 9px; background: #fff; color: #18181b; font: inherit; font-weight: 400; }
      #count { margin: 16px 0; color: #52525b; }
      .group { margin: 30px 0; }
      .group h2 { padding-bottom: 8px; border-bottom: 1px solid #d4d4d8; font-size: 20px; }
      .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(310px, 1fr)); gap: 16px; }
      .card { overflow: hidden; border: 1px solid #d4d4d8; border-radius: 8px; background: #fff; }
      .image-link { display: block; padding: 8px; background: #18181b; }
      .card img { display: block; width: 100%; height: 210px; object-fit: contain; }
      .card-copy { padding: 12px; }
      .card h3 { margin: 8px 0 4px; font-size: 16px; }
      .card p { margin: 6px 0 10px; color: #52525b; font-size: 13px; overflow-wrap: anywhere; }
      .badges { display: flex; flex-wrap: wrap; gap: 6px; }
      .badge { border: 1px solid #d4d4d8; border-radius: 99px; padding: 1px 8px; color: #3f3f46; font-size: 11px; text-transform: capitalize; }
      .full-image { color: #27272a; font-size: 13px; text-decoration: underline; }
      code { overflow-wrap: anywhere; }
      [hidden] { display: none !important; }
      @media (max-width: 760px) { .filters { grid-template-columns: repeat(2, minmax(130px, 1fr)); } }
      @media (max-width: 460px) { .filters { grid-template-columns: 1fr; } main { padding: 16px; } }
      @media print { .filters { display: none; } }
    </style>
  </head>
  <body>
    <header>
      <h1>Cappy Hub visual catalog</h1>
      <p>${manifest.length} actual application screenshots: ${darkCount} dark and ${lightCount} light. The catalog covers the primary Admin, Lead, and Officer experiences. Every included dark state has a matching light capture. Lead captures include single-branch and multi-branch scopes.</p>
      <p>Captured from the local application with synthetic development accounts. Forms and confirmation dialogs were captured before submission; no workflow mutations were performed.</p>
    </header>
    <main>
      <div class="filters" aria-label="Screenshot filters">
        <label>Role<select id="role-filter"><option value="">All roles</option>${roleOptions}</select></label>
        <label>Domain<select id="domain-filter"><option value="">All domains</option>${domainOptions}</select></label>
        <label>Theme<select id="theme-filter"><option value="">Both themes</option><option value="dark">Dark</option><option value="light">Light</option></select></label>
        <label>Search<input id="search-filter" type="search" placeholder="Page, route, state…"></label>
      </div>
      <p id="count" aria-live="polite"></p>
      ${sections}
    </main>
    <script>
      const cards = [...document.querySelectorAll('.card')];
      const groups = [...document.querySelectorAll('[data-group]')];
      const filters = ['role', 'domain', 'theme'].map(key => document.getElementById(key + '-filter'));
      const search = document.getElementById('search-filter');
      const count = document.getElementById('count');
      function applyFilters() {
        let visible = 0;
        for (const card of cards) {
          const matches = filters.every(filter => !filter.value || card.dataset[filter.id.replace('-filter', '')] === filter.value)
            && (!search.value || card.dataset.search.includes(search.value.toLowerCase()));
          card.hidden = !matches;
          if (matches) visible++;
        }
        for (const group of groups) group.hidden = !group.querySelector('.card:not([hidden])');
        count.textContent = 'Showing ' + visible + ' of ' + cards.length + ' screenshots.';
      }
      for (const filter of [...filters, search]) filter.addEventListener('input', applyFilters);
      applyFilters();
    </script>
  </body>
</html>
`;

const roleTheme = new Map();
const domainRole = new Map();
for (const role of ["Admin", "Lead", "Officer"]) {
  for (const theme of ["dark", "light"]) roleTheme.set(`${role}|${theme}`, 0);
}
for (const item of manifest) {
  const roleThemeKey = `${item.role}|${item.theme}`;
  roleTheme.set(roleThemeKey, (roleTheme.get(roleThemeKey) ?? 0) + 1);
  if (!domainRole.has(item.domain)) domainRole.set(item.domain, new Map());
  const counts = domainRole.get(item.domain);
  const key = `${item.role}|${item.theme}`;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

const coverageRows = [...domainRole]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([domain, counts]) => {
    const values = ["Admin", "Lead", "Officer"]
      .map(
        (role) =>
          `${counts.get(`${role}|dark`) ?? 0} / ${counts.get(`${role}|light`) ?? 0}`,
      )
      .join(" | ");
    return `| ${domain} | ${values} |`;
  })
  .join("\n");

const widths = [...new Set(manifest.map((item) => item.viewportWidth))].sort(
  (a, b) => a - b,
);
const coverage = `# UI catalog coverage

This report is generated with node scripts/build-ui-reference.mjs from [manifest.json](manifest.json). The [HTML catalog](index.html) links each thumbnail to its full-size PNG.

## Summary

- Screenshots: **${manifest.length}** (${darkCount} dark, ${lightCount} light).
- Roles: **Admin, Lead, and Officer**, plus shared login/access states.
- Lead coverage includes both a single-branch Lead and a multi-branch Lead account. This reflects the app's branch-scoped permissions while keeping Lead as one primary role.
- Every included dark screenshot state has a corresponding light-theme capture at the same role, scope, domain, route, width, and capture mode.
- Desktop widths: **${widths.join(", ")} CSS px**; 1440px is the main review size.
- Data: existing synthetic local development records only. The local database was retained; no form was submitted and no records were changed.
- /events/types redirects to /events and is represented by Events rather than a separate screen.

## Captures by role and theme

Counts are dark / light.

| Domain | Admin | Lead | Officer |
| --- | ---: | ---: | ---: |
${coverageRows}

## Not captured

The following result states were not created because they require submitting mutations or the existing local synthetic data does not contain the prerequisite records:

- Successful create/edit/restore, signup/leave, task assignment/completion, warning decisions, and point/catalog changes after submission. Confirmation dialogs and forms were captured before submission.
- Event/Task recurring-series edit scopes. The retained local database has no Event or Task recurrence series.
- Waitlist/full-capacity states. The retained local data has no capacity-limited Events or waitlist entries.
- Archived Task restore. The retained local data has no archived Tasks.
- Server failure and generic error screens. No service failure was induced.

The detailed metadata for every screenshot is in [manifest.json](manifest.json). The report makes these unavailable or untested states explicit rather than substituting mock screenshots.
`;

await writeFile(
  path.join(catalogRoot, "index.html"),
  await prettier.format(html, { parser: "html" }),
);
await writeFile(
  path.join(catalogRoot, "coverage.md"),
  await prettier.format(coverage, { parser: "markdown" }),
);
console.log(
  `Built catalog for ${manifest.length} screenshots (${darkCount} dark, ${lightCount} light).`,
);
