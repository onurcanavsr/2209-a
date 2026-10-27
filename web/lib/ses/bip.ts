/** Kısa sesli işaret (görme engelliler için "dinliyorum / bitti" bildirimi). Düşük ses, kısa süre. */
let ctx: AudioContext | null = null;

/** Kullanıcı tıklamasının İÇİNDE çağrılmalı (tarayıcılar sesi ancak o zaman açar). */
export function bipHazirla() {
  try {
    const AC: typeof AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = ctx ?? new AC();
    void ctx.resume();
  } catch {}
}

export function bip(frekans: number, ms = 110): Promise<void> {
  return new Promise((coz) => {
    try {
      if (!ctx) return coz();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = frekans;
      g.gain.value = 0.08;
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + ms / 1000);
      o.onended = () => coz();
    } catch { coz(); }
  });
}
