"""Tanıyıcıya ipucu olarak verilen komut sözcükleri.
DİKKAT: web/lib/ses/komutlar.ts içindeki komut ifadeleriyle uyumlu tutun (ikisi birbirinden bağımsız çalışır;
uyumsuzluk yalnızca tanıma doğruluğunu düşürür, işlevi bozmaz)."""

KEYWORDS = [
    "özetle", "özet", "kısa özet", "orta özet", "ayrıntılı özet",
    "oku", "durdur", "duraklat", "devam et", "ileri sar", "geri sar", "10 saniye ileri", "10 saniye geri",
    "sonraki bölüm", "önceki bölüm", "daha hızlı", "daha yavaş",
    "çalışma alanı", "ana sayfa", "hesabım", "yönetim", "geri git",
    "yazıyı büyüt", "yazıyı küçült", "koyu tema", "açık tema", "otomatik tema",
    "yardım", "ne diyebilirim",
]

PROMPT = (
    "Kullanıcı bir web sitesini sesle yönetiyor. Konuşma çok kısa bir Türkçe komuttur, örneğin: "
    + ", ".join(KEYWORDS[:12]) + "."
)
