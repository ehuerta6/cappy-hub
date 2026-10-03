# Maintainers

Cappy Hub is maintained by the **Coding Interview Club**. Maintainers review contributions, clarify expected behavior, and decide what is merged into `main`.

Keep the application and its documentation understandable so future CIC officers can continue maintaining it.

Before enabling production smoke verification, configure the non-secret `PRODUCTION_APP_URL` variable in GitHub's `production` environment and confirm Vercel system environment variables are enabled. See [Production deployment](database-development.md#production-deployment) for the ordered deployment steps and configuration, and [Production smoke verification](database-development.md#production-smoke-verification) for checks, timeouts, limitations, and failure troubleshooting. A failed smoke check requires inspection; it does not roll back migrations or deployment.
