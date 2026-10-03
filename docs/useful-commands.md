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

Production migrations and application deployment run automatically after a successful CI run for `main`. See [Production deployment](database-development.md#production-deployment) for its required GitHub and Vercel configuration and failure behavior. Do not run production migration commands manually.
