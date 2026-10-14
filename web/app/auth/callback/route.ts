import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site";

// E-postadaki doğrulama / davet / parola sıfırlama bağlantıları buraya gelir.
// token_hash yöntemi, e-postayı başka cihazda açsanız bile çalışır.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const next = searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const supabase = await createClient();

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${SITE_URL}${safeNext}`);
  }

  const code = searchParams.get("code"); // yedek: PKCE kodu
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${SITE_URL}${safeNext}`);
  }
  return NextResponse.redirect(`${SITE_URL}/giris?hata=baglanti`);
}
