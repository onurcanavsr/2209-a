import { createClient } from "@/lib/supabase/client";

export type Belge = {
  id: string;
  title: string;
  kind: "pdf" | "docx" | "pptx";
  status: "processing" | "ready" | "failed";
  size_bytes?: number | null;
  page_count?: number | null;
  char_count?: number | null;
  used_ocr?: boolean;
  truncated?: boolean;
  note?: string | null;
  error?: string | null;
  created_at: string;
  text_preview?: string;
};

export const DURUM: Record<Belge["status"], string> = {
  processing: "İşleniyor…",
  ready: "Hazır",
  failed: "Başarısız",
};

export async function apiFetch(path: string, init: RequestInit = {}) {
  const { data: { session } } = await createClient().auth.getSession();
  if (!session) {
    window.location.href = "/giris";
    throw new Error("Oturum yok");
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  return fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, { ...init, headers });
}

export async function hataMesaji(r: Response, varsayilan: string) {
  try {
    const j = await r.json();
    if (typeof j.detail === "string") return j.detail;
  } catch {}
  return varsayilan;
}
