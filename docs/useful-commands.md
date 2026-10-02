# Useful Commands

```bash
# Full local app environment
npm run local:start
npm run local:setup
npm run local:reset
npm run local:stop
npm run dev

# Formatting
npm run format
npm run format:check

# Code quality
npm run lint
npm run typecheck

# Tests and production build
npm test
npm run build

# Database-only test stack
npm run db:start
npm run db:reset
npm run test:db:upgrade
npm run test:local-seed

# Generated database types
npm run db:types
npm run db:types:check
```

For the production migration sequence (`migration list`, `link`, dry run, then push), follow [Manual production database update](database-development.md#manual-production-database-update). Do not use those production commands before the approved PR is merged to `main`.
