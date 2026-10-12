# Cappy Hub visual catalog

Open [`index.html`](index.html) in a browser to browse, filter, and open the full-size screenshots. [`coverage.md`](coverage.md) summarizes role, domain, and theme coverage, and lists states that could not be captured safely or were unavailable in the retained local data. [`manifest.json`](manifest.json) is the source of truth for the catalog entries.

This catalog covers the three primary UI roles: Admin, Lead, and Officer. Lead views include both single-branch and multi-branch synthetic accounts because their permitted Event and Task scope depends on branch membership. Shared login and access-denied states are included separately. President and other secondary roles are outside this catalog's scope.

The Admin Officer warning screenshots labeled **Earlier Create Warning form** show the pre-dialog layout. The current on-demand Create warning dialog, Task assignment dialog, and Event create form are also captured in the Issue #206 final audit states. The Wave 3 Task form and Event roster captures use the already-running local Supabase stack and its retained synthetic data; no reset or mutating form submission was run.

Every included dark screenshot state has a matching light screenshot for the same role, scope, route, viewport width, and capture mode. The catalog covers 1024, 1280, 1440, and 1920 CSS pixel widths; 1440px is the primary review size. The application is desktop-only.

## Update the catalog

1. Read the current product and visual requirements in `docs/product/design-doc.md` and `docs/design.md`.
2. Use synthetic accounts from [`docs/local-development.md`](../local-development.md). Start or reuse the local Supabase stack with `npm run local:start`; do not use `npm run local:reset` for catalog capture unless resetting the local database has been explicitly authorized.
3. Run the local application and capture actual browser screenshots for each affected role and theme. Include relevant changed pages, permission-dependent views, and meaningful states. Do not submit workflows against the retained local database; capture forms and confirmation dialogs before submission.
4. Save full-resolution PNGs under the corresponding role and domain folders. Use filenames that identify the page/state, viewport width, and theme.
5. Add or update entries in `manifest.json`, keeping role, branch scope where applicable, domain, route, theme, viewport, state, and image path accurate.
6. Run `node scripts/build-ui-reference.mjs` to validate image links and dark/light pairs, then regenerate `index.html` and `coverage.md`.
7. In the Pull Request template, confirm that the catalog was updated or that the PR has no rendered UI changes.

All screenshots come from the local application with synthetic development data. The retained local database was not reset; the form and dialog captures were not submitted, and no domain records were changed. Some result states remain untested or unavailable; see `coverage.md` for the precise gaps.
