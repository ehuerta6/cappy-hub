import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOfficer } from "@/lib/current-officer";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code)
    return NextResponse.redirect(new URL("/login?error=auth", request.url));

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("OAuth callback exchange failed", error);
    return NextResponse.redirect(new URL("/login?error=auth", request.url));
  }

  const officer = await getCurrentOfficer();
  return NextResponse.redirect(
    new URL(officer ? "/" : "/access-denied", request.url),
  );
}
