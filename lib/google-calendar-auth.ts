import "server-only";

import { getVercelOidcToken } from "@vercel/oidc";
import { ExternalAccountClient, GoogleAuth } from "google-auth-library";

const calendarScope = "https://www.googleapis.com/auth/calendar.events";

export async function googleCalendarAccessToken(): Promise<string> {
  if (process.env.VERCEL === "1") {
    const projectNumber = required("GCP_PROJECT_NUMBER");
    const poolId = required("GCP_WORKLOAD_IDENTITY_POOL_ID");
    const providerId = required("GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID");
    const serviceAccount = required("GCP_SERVICE_ACCOUNT_EMAIL");
    const audience = required("GCP_AUDIENCE");
    const client = ExternalAccountClient.fromJSON({
      type: "external_account",
      audience: `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`,
      subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
      token_url: "https://sts.googleapis.com/v1/token",
      service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccount}:generateAccessToken`,
      subject_token_supplier: {
        getSubjectToken: () => getVercelOidcToken({ audience }),
      },
      scopes: [calendarScope],
    });
    if (!client)
      throw new Error("Google workload identity configuration is invalid");
    const { token } = await client.getAccessToken();
    if (!token)
      throw new Error("Google workload identity returned no access token");
    return token;
  }

  const auth = new GoogleAuth({ scopes: [calendarScope] });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("Google ADC returned no access token");
  return token;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
