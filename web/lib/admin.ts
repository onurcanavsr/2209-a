// Yönetim paneli ortak tipleri ve biçimlendiriciler.

export const EYLEM_AD: Record<string, string> = {
  summarize: "Özetleme", ask: "Soru-cevap", quiz: "Test üretimi", tts: "Sesli okuma", upload: "Belge yükleme",
};
export const eylemAd = (a: string) => EYLEM_AD[a] ?? a;

export const usd = (n: number) =>
  "$" + n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 });
export const sayi = (n: number) => n.toLocaleString("tr-TR");
export const tarih = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" }) : "—";
export const tarihSaat = (s?: string | null) =>
  s ? new Date(s).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export type Ozet = {
  users: number; inactive_users: number; admins: number; new_7d: number; active_7d: number;
  documents: number; documents_failed: number; summaries: number; quizzes: number; qa_messages: number;
  today: { calls: number; est_cost: number; by_action: EylemToplam[] };
  last_30d: { calls: number; est_cost: number };
};
export type EylemToplam = { action: string; calls: number; units: number; est_cost: number };
export type KullaniciSatiri = {
  id: string; email: string | null; role: "student" | "admin"; is_active: boolean;
  created_at: string; doc_count: number; last_activity: string | null;
};
export type KullaniciListesi = { items: KullaniciSatiri[]; total: number; page: number; page_size: number };
export type GunlukSatir = { day: string; action: string; calls: number; units: number; users: number; est_cost: number };
export type Kullanim = {
  days: number; rows: GunlukSatir[]; daily: { day: string; calls: number; est_cost: number }[];
  by_action: EylemToplam[]; total_est_cost: number;
};
export type KullaniciKullanimi = {
  days: number;
  items: { user_id: string; email: string | null; calls: number; est_cost: number; by_action: Record<string, number> }[];
};
export type Ayarlar = {
  limits: Record<string, number>;
  models: { main: string; fast: string; tts_provider: string };
  cost_assumptions: { llm_main_usd_per_mtok: number[]; llm_fast_usd_per_mtok: number[]; tts_usd_per_mchar: number; chars_per_token: number };
};
export type DenetimKaydi = {
  id: number; admin_email: string | null; action: string; target_email: string | null;
  detail: Record<string, unknown>; created_at: string;
};
export const DENETIM_AD: Record<string, string> = {
  kullanici_devre_disi: "Hesabı devre dışı bıraktı", kullanici_etkinlestir: "Hesabı etkinleştirdi",
  rol_degistir: "Rolü değiştirdi", kullanici_sil: "Hesabı sildi",
};

// Excel'in (Türkçe) doğru açması için ';' ayracı ve UTF-8 BOM. Formül enjeksiyonuna karşı =,+,-,@ ile başlayan metinlere ' eklenir.
function hucre(v: string | number): string {
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@]/.test(s)) s = "'" + s;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function csvIndir(dosyaAdi: string, baslik: string[], satirlar: (string | number)[][]) {
  const govde = [baslik, ...satirlar].map((r) => r.map(hucre).join(";")).join("\r\n");
  const blob = new Blob(["\uFEFF" + govde], { type: "text/csv;charset=utf-8" });
  const u = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = u; a.download = dosyaAdi;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 10000);
}
