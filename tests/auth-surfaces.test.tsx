// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { routerPush, routerRefresh } = vi.hoisted(() => ({
  routerPush: vi.fn(),
  routerRefresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push: routerPush, refresh: routerRefresh }),
}));
vi.mock("@/lib/current-officer", () => ({ getCurrentOfficer: vi.fn() }));
vi.mock("@/lib/supabase/browser", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import LoginPage from "@/app/login/page";
import GoogleSignIn from "@/app/login/sign-in";
import AccessDeniedPage from "@/app/access-denied/page";
import { GET as authCallback } from "@/app/auth/callback/route";
import { getCurrentOfficer } from "@/lib/current-officer";
import { createClient as createBrowserClient } from "@/lib/supabase/browser";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

let roots: Root[] = [];
let originalSupabaseUrl: string | undefined;

async function mount(element: React.ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);

  await act(async () => {
    root.render(createElement("div", null, element));
  });

  return container;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  vi.mocked(getCurrentOfficer).mockResolvedValue(null);
});

afterEach(async () => {
  await act(async () => {
    roots.forEach((root) => root.unmount());
  });
  roots = [];
  document.body.replaceChildren();
  if (originalSupabaseUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
  }
});

describe("login and access recovery paths", () => {
  it("redirects an already signed-in eligible Officer to the Dashboard", async () => {
    vi.mocked(getCurrentOfficer).mockResolvedValue({ id: 42 } as never);

    await LoginPage({ searchParams: Promise.resolve({}) });

    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("keeps Google sign-in and inline OAuth callback feedback outside local environments", async () => {
    const page = await LoginPage({
      searchParams: Promise.resolve({ error: "auth" }),
    });
    const container = await mount(page);

    expect(container.textContent).toContain("Cappy Hub");
    expect(container.textContent).toContain("Continue with Google");
    expect(container.textContent).toContain(
      "Google sign-in could not be completed. Please try again.",
    );
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Local development accounts");
  });

  it("keeps Google pending feedback and hides raw provider errors", async () => {
    const pendingSignIn = deferred<{
      error: { message: string } | null;
    }>();
    const signInWithOAuth = vi.fn(() => pendingSignIn.promise);
    vi.mocked(createBrowserClient).mockReturnValue({
      auth: { signInWithOAuth },
    } as never);
    const container = await mount(createElement(GoogleSignIn));
    const button = container.querySelector("button");

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(button?.textContent).toBe("Signing in...");
    expect(button?.disabled).toBe(true);
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });

    await act(async () => {
      pendingSignIn.resolve({
        error: { message: "sensitive provider detail" },
      });
      await pendingSignIn.promise;
    });

    expect(container.textContent).toContain(
      "Google sign-in could not start. Please try again.",
    );
    expect(container.textContent).not.toContain("sensitive provider detail");
  });

  it("keeps the existing sign-out action on access denial", async () => {
    const container = await mount(createElement(AccessDeniedPage));

    expect(container.textContent).toContain("Access denied");
    expect(container.textContent).toContain("Sign out and try another account");
    expect(container.querySelector("form button[type=submit]")).not.toBeNull();
  });

  it("offers synthetic Admin, Lead, and Officer accounts only for local Supabase", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    const container = await mount(createElement(GoogleSignIn));

    expect(container.textContent).toContain("Local development accounts");
    expect(container.textContent).toContain("Admin");
    expect(container.textContent).toContain("Intro Lead");
    expect(container.textContent).toContain("Officer");
    expect(container.textContent).toContain("Inactive Officer");
    expect(container.textContent).not.toContain("Continue with Google");
  });

  it.each([
    ["Admin", "admin@cappy.test"],
    ["Intro Lead", "intro-lead@cappy.test"],
    ["Officer", "officer@cappy.test"],
  ])(
    "signs the local %s account in and refreshes the Dashboard",
    async (label, email) => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
      const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(createBrowserClient).mockReturnValue({
        auth: { signInWithPassword },
      } as never);
      const container = await mount(createElement(GoogleSignIn));
      const button = Array.from(container.querySelectorAll("button")).find(
        (candidate) => candidate.textContent === label,
      );

      expect(button).toBeDefined();
      await act(async () => {
        button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      expect(signInWithPassword).toHaveBeenCalledWith({
        email,
        password: "CappyLocal123!",
      });
      expect(routerPush).toHaveBeenCalledWith("/");
      expect(routerRefresh).toHaveBeenCalled();
    },
  );

  it("keeps local sign-in pending feedback and replaces provider diagnostics with a generic error", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    const pendingSignIn = deferred<{
      error: { message: string } | null;
    }>();
    vi.mocked(createBrowserClient).mockReturnValue({
      auth: { signInWithPassword: vi.fn(() => pendingSignIn.promise) },
    } as never);
    const container = await mount(createElement(GoogleSignIn));
    const admin = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "Admin",
    );

    await act(async () => {
      admin?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(admin?.textContent).toBe("Signing in...");
    expect(admin?.disabled).toBe(true);

    await act(async () => {
      pendingSignIn.resolve({
        error: { message: "sensitive provider diagnostic" },
      });
      await pendingSignIn.promise;
    });

    expect(container.textContent).toContain(
      "Local sign-in could not be completed. Please try again.",
    );
    expect(container.textContent).not.toContain(
      "sensitive provider diagnostic",
    );
  });

  it.each([
    ["admin", { id: 1, applicationRole: "admin" }],
    ["lead", { id: 2, positionCode: "lead" }],
    ["officer", { id: 3, positionCode: "officer" }],
  ])(
    "returns an authorized %s callback to the Dashboard",
    async (_role, officer) => {
      vi.mocked(createServerClient).mockResolvedValue({
        auth: {
          exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
        },
      } as never);
      vi.mocked(getCurrentOfficer).mockResolvedValue(officer as never);

      const response = await authCallback(
        new NextRequest("https://cappy.test/auth/callback?code=valid-code"),
      );

      expect(response.headers.get("location")).toBe("https://cappy.test/");
    },
  );

  it("routes an account without an eligible Officer record to existing access denial", async () => {
    vi.mocked(createServerClient).mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
      },
    } as never);
    vi.mocked(getCurrentOfficer).mockResolvedValue(null);

    const response = await authCallback(
      new NextRequest("https://cappy.test/auth/callback?code=valid-code"),
    );

    expect(response.headers.get("location")).toBe(
      "https://cappy.test/access-denied",
    );
  });
});
