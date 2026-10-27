/** Mikrofon kaydı: getUserMedia + MediaRecorder tüm güncel tarayıcılarda (Chrome, Edge, Brave, Opera, Firefox, Safari)
 *  aynı çalışır. Konuşmanın bitişi (sessizlik) burada, ses seviyesinden algılanır; tanıma sunucuda yapılır. */

export type KayitSonucu = {
  blob: Blob | null;
  konustu: boolean;
  neden: "sessizlik" | "sure" | "konusma-yok" | "iptal";
};

export class MikrofonHatasi extends Error {
  constructor(public kod: "izin" | "yok" | "desteklenmiyor" | "diger", mesaj: string) {
    super(mesaj);
  }
}

// Sırayla denenir: Chrome/Edge/Brave/Opera → webm, Safari → mp4, Firefox → webm ya da ogg
const ADAYLAR = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

export function desteklenir(): boolean {
  return typeof window !== "undefined" && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia
    && typeof MediaRecorder !== "undefined";
}

function mimeSec(): string | undefined {
  return ADAYLAR.find((m) => MediaRecorder.isTypeSupported?.(m));
}

export type KayitSecenek = {
  signal?: AbortSignal;
  maxMs?: number;          // en uzun kayıt
  sessizlikMs?: number;    // konuşma bittikten sonra beklenecek sessizlik
  ilkKonusmaMs?: number;   // konuşma başlamazsa vazgeçme süresi
  onSeviye?: (v: number) => void;
};

export async function kayitYap(o: KayitSecenek = {}): Promise<KayitSonucu> {
  const { maxMs = 8000, sessizlikMs = 1200, ilkKonusmaMs = 5000 } = o;
  if (!desteklenir()) {
    throw new MikrofonHatasi("desteklenmiyor", "Bu tarayıcı veya bağlantı mikrofon kaydını desteklemiyor (güvenli bağlantı gerekir).");
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
  } catch (e) {
    const ad = (e as DOMException).name;
    if (ad === "NotAllowedError" || ad === "SecurityError") throw new MikrofonHatasi("izin", "Mikrofon izni verilmedi. Tarayıcının adres çubuğundan mikrofona izin verin.");
    if (ad === "NotFoundError" || ad === "OverconstrainedError") throw new MikrofonHatasi("yok", "Mikrofon bulunamadı.");
    throw new MikrofonHatasi("diger", "Mikrofon açılamadı.");
  }

  const AC: typeof AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  try { await ctx.resume(); } catch {}
  const an = ctx.createAnalyser();
  an.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(an);
  const buf = new Float32Array(an.fftSize);

  const mime = mimeSec();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const parcalar: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) parcalar.push(e.data); };

  return new Promise<KayitSonucu>((coz) => {
    const basla = performance.now();
    let konustu = false, sonSes = 0, ardisik = 0, gurultu = 0, ornek = 0, bitti = false;
    let neden: KayitSonucu["neden"] = "sessizlik";

    const bitir = (n: KayitSonucu["neden"]) => {
      if (bitti) return;
      bitti = true; neden = n;
      clearInterval(zamanlayici);
      o.signal?.removeEventListener("abort", iptal);
      if (rec.state !== "inactive") rec.stop(); else sonlandir();
    };
    const iptal = () => bitir("iptal");
    const sonlandir = () => {
      stream.getTracks().forEach((t) => t.stop());
      ctx.close().catch(() => {});
      const ok = neden !== "iptal" && konustu && parcalar.length > 0;
      coz({ blob: ok ? new Blob(parcalar, { type: rec.mimeType || mime || "audio/webm" }) : null, konustu, neden });
    };
    rec.onstop = sonlandir;
    o.signal?.addEventListener("abort", iptal);
    if (o.signal?.aborted) { iptal(); return; }

    rec.start();
    const zamanlayici = setInterval(() => {
      an.getFloatTimeDomainData(buf);
      let s = 0;
      for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
      const rms = Math.sqrt(s / buf.length);
      o.onSeviye?.(rms);
      const t = performance.now() - basla;

      if (t < 300) {                         // ilk 300 ms: ortam gürültüsünü ölç
        gurultu = (gurultu * ornek + rms) / (ornek + 1); ornek++;
        return;
      }
      const esik = Math.max(0.02, gurultu * 2.5);
      if (rms > esik) {
        if (++ardisik >= 2) { konustu = true; sonSes = t; }   // 2 ardışık çerçeve: tek seferlik tıkırtı sayılmaz
      } else {
        ardisik = 0;
      }
      if (konustu && t - sonSes > sessizlikMs) bitir("sessizlik");
      else if (t > maxMs) bitir("sure");
      else if (!konustu && t > ilkKonusmaMs) bitir("konusma-yok");
    }, 50);
  });
}

export function uzanti(mime: string): string {
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  return "webm";
}
