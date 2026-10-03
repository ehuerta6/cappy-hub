import { pathToFileURL } from "node:url";

export const TIMEOUT_MS = 10 * 60 * 1000;
export const RETRY_INTERVAL_MS = 10 * 1000;
export const REQUEST_TIMEOUT_MS = 10 * 1000;

export function productionLoginUrl(value) {
  const message =
    "PRODUCTION_APP_URL must be a canonical HTTPS origin (https://<production-domain>), without credentials, path, query, or fragment.";
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(message);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(message);
  }
  return new URL("/login", url).href;
}

export function interpretResponse(status, headers, body, expectedRevision) {
  // Ignore serialized React payloads and scripts; check the rendered surface.
  const html = body.replace(
    /<script\b[^>]*>[\s\S]*?<\/script\s*>|<!--[\s\S]*?-->/gi,
    "",
  );
  const contentFound =
    /<h1\b[^>]*>\s*Cappy Hub\s*<\/h1>/i.test(html) &&
    /<p\b[^>]*>\s*Coding Interview Club administration\s*<\/p>/i.test(html) &&
    /<button\b[^>]*>\s*Continue with Google\s*<\/button>/i.test(html);
  const revisionMatches =
    headers.get("x-cappy-hub-revision") === expectedRevision;
  const isHtml = /^text\/html(?:;|$)/i.test(headers.get("content-type") ?? "");
  return {
    contentFound,
    revisionMatches,
    isHtml,
    ok: status === 200 && isHtml && contentFound && revisionMatches,
  };
}

export async function verifyProductionDeployment(
  appUrl,
  expectedRevision,
  { fetchImpl = fetch, log = console.log } = {},
) {
  const url = productionLoginUrl(appUrl);
  if (!/^[a-f0-9]{40}$/.test(expectedRevision ?? "")) {
    throw new Error("EXPECTED_DEPLOYMENT_SHA must be a full Git commit SHA.");
  }
  const deadline = performance.now() + TIMEOUT_MS;
  let attempt = 0;
  let lastResult = "No response received.";
  log(
    `Checking ${url} for commit ${expectedRevision}; timeout=${TIMEOUT_MS / 1000}s, retry interval=${RETRY_INTERVAL_MS / 1000}s, request timeout=${REQUEST_TIMEOUT_MS / 1000}s.`,
  );

  while (performance.now() < deadline) {
    attempt += 1;
    let status = "unavailable";
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      Math.min(REQUEST_TIMEOUT_MS, deadline - performance.now()),
    );
    try {
      // No cookies, auth, redirects, or production writes. Bound body reads too.
      const response = await fetchImpl(url, {
        method: "GET",
        redirect: "manual",
        headers: { Accept: "text/html", "Cache-Control": "no-cache" },
        signal: controller.signal,
      });
      status = String(response.status);
      const result = interpretResponse(
        response.status,
        response.headers,
        await response.text(),
        expectedRevision,
      );
      lastResult = `HTTP=${status}, expected content=${result.contentFound}, HTML=${result.isHtml}, expected revision=${result.revisionMatches}`;
      log(`${url} attempt ${attempt}: ${lastResult}.`);
      if (result.ok && performance.now() < deadline) {
        log("Production deployment smoke verification passed.");
        return;
      }
    } catch {
      // Raw network errors can contain URLs or headers; never print them.
      lastResult = `HTTP=${status}, expected content=false, expected revision=false, ${controller.signal.aborted ? "request timed out" : "request or response body failed"}`;
      log(`${url} attempt ${attempt}: ${lastResult}.`);
    } finally {
      clearTimeout(timer);
    }
    const remaining = deadline - performance.now();
    if (remaining > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(RETRY_INTERVAL_MS, remaining)),
      );
    }
  }

  throw new Error(
    `Production deployment smoke verification timed out after ${TIMEOUT_MS / 1000}s checking ${url} (${attempt} attempts). Last result: ${lastResult}. Inspect Vercel deployment/build/runtime logs and production URL configuration.`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await verifyProductionDeployment(
      process.env.PRODUCTION_APP_URL,
      process.env.EXPECTED_DEPLOYMENT_SHA,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
