/** İngilizce sesli komut sözlüğü. Kimlikler `komutlar.ts` içindeki Türkçe tabloyla birebir aynıdır (kapsam testi denetler).
 *  DİKKAT: ifadeleri değiştirirseniz api/app/stt/vocab.py içindeki KEYWORDS_EN ipucu listesini de güncelleyin. */
export type KomutCeviri = { ad: string; ifadeler: string[] };

export const KOMUTLAR_EN: Record<string, KomutCeviri> = {
  // ---- her sayfada ----
  "git.calisma": { ad: "Go to the workspace", ifadeler: ["workspace", "go to workspace", "go to the workspace", "home", "go home", "home page", "my documents", "go to my documents", "documents"] },
  "git.hesap": { ad: "Go to my account", ifadeler: ["my account", "go to my account", "account", "account page"] },
  "git.yonetim": { ad: "Go to the admin panel", ifadeler: ["admin", "admin panel", "go to admin", "administration"] },
  "geri.sayfa": { ad: "Go back to the previous page", ifadeler: ["go back", "previous page", "back", "navigate back", "page back"] },
  "yazi.buyut": { ad: "Increase text size", ifadeler: ["increase text size", "bigger text", "make text bigger", "larger text", "bigger", "zoom in"] },
  "yazi.kucult": { ad: "Decrease text size", ifadeler: ["decrease text size", "smaller text", "make text smaller", "smaller", "zoom out"] },
  "tema.koyu": { ad: "Dark theme", ifadeler: ["dark theme", "dark mode"] },
  "tema.acik": { ad: "Light theme", ifadeler: ["light theme", "light mode"] },
  "tema.otomatik": { ad: "Automatic theme", ifadeler: ["automatic theme", "default theme", "theme automatic", "auto theme"] },
  "cikis": { ad: "Sign out", ifadeler: ["sign out", "log out", "logout", "sign me out"] },
  "yardim": { ad: "List the commands", ifadeler: ["help", "what can i say", "commands", "command list", "list commands"] },
  "dil.tr": { ad: "Switch to Turkish", ifadeler: ["switch to turkish", "turkish", "speak turkish", "change language to turkish"] },
  "dil.en": { ad: "Switch to English", ifadeler: ["switch to english", "english", "speak english", "change language to english"] },
  // ---- belge sayfasında: bölümlere geçiş ----
  "bolum.soru": { ad: "Ask the Document section", ifadeler: ["ask the document section", "questions and answers", "q and a", "go to questions", "questions section"] },
  "bolum.ozet": { ad: "Summary section", ifadeler: ["summary section", "go to summary", "summary page", "go to the summary"] },
  "bolum.test": { ad: "Practice Quiz section", ifadeler: ["go to quiz", "quiz section", "practice quiz section", "go to practice quiz", "go to the quiz"] },
  "bolum.dinle": { ad: "Listen to the Text section", ifadeler: ["listen to the text", "listen to text section", "listen section", "listening section"] },
  "bolum.metin": { ad: "Extracted Text section", ifadeler: ["extracted text", "go to text", "text section", "go to the text"] },
  "bolum.notlar": { ad: "My Notes section", ifadeler: ["my notes", "go to my notes", "notes"] },
  "bolum.kartlar": { ad: "Flashcards section", ifadeler: ["flashcards", "go to flashcards", "my cards", "go to my flashcards"] },
  "bolum.imler": { ad: "Bookmarks section", ifadeler: ["bookmarks", "go to bookmarks", "my bookmarks"] },
  // ---- belge sayfasında: özet ----
  "ozet.olustur": { ad: "Summarize", ifadeler: ["summarize", "summarise", "create a summary", "make a summary", "summarize the document", "generate summary", "create summary"] },
  "ozet.kisa": { ad: "Short summary", ifadeler: ["short summary", "brief summary", "summarize briefly", "create a short summary"] },
  "ozet.orta": { ad: "Medium summary", ifadeler: ["medium summary", "medium length summary", "create a medium summary"] },
  "ozet.ayrintili": { ad: "Detailed summary", ifadeler: ["detailed summary", "long summary", "full summary", "create a detailed summary"] },
  // ---- belge sayfasında: sesli okuma ----
  "oku.baslat": { ad: "Start / resume reading", ifadeler: ["read", "start reading", "read aloud", "read the document", "read the summary", "listen", "resume", "continue", "play", "start"] },
  "oku.durdur": { ad: "Pause reading", ifadeler: ["stop", "pause", "wait", "stop reading", "be quiet", "hold on"] },
  "oku.ileri": { ad: "Fast forward 10 seconds", ifadeler: ["fast forward", "forward 10 seconds", "ten seconds forward", "skip ahead", "forward"] },
  "oku.geri": { ad: "Rewind 10 seconds", ifadeler: ["rewind", "back 10 seconds", "go back 10 seconds", "ten seconds back", "skip back"] },
  "oku.sonraki": { ad: "Next section", ifadeler: ["next section", "next", "skip section", "skip this section"] },
  "oku.onceki": { ad: "Previous section", ifadeler: ["previous section", "previous", "last section"] },
  "oku.hizli": { ad: "Read faster", ifadeler: ["faster", "read faster", "speed up", "increase speed"] },
  "oku.yavas": { ad: "Read slower", ifadeler: ["slower", "read slower", "slow down", "decrease speed"] },
  // ---- çalışma alanı ----
  "belge.listele": { ad: "List my documents", ifadeler: ["list documents", "list my documents", "read my documents", "read documents", "what documents do i have", "count my documents"] },
  "belge.yukle": { ad: "Upload a file", ifadeler: ["upload document", "upload file", "upload a file", "choose file", "upload a new document", "add document"] },
  // ---- belge sayfası: belgeyi sil ----
  "belge.sil": { ad: "Delete the document", ifadeler: ["delete document", "delete this document", "delete the document", "delete the file"] },
  // ---- belge sayfası: belgeye soru sor ----
  "soru.sor": { ad: "Ask the document a question", ifadeler: ["ask a question", "ask question", "ask the document", "i have a question", "i want to ask a question"] },
  "cevap.oku": { ad: "Read the last answer", ifadeler: ["read answer", "read the answer", "read the last answer", "read answer again", "answer"] },
  "qa.temizle": { ad: "Clear the question history", ifadeler: ["clear history", "clear question history", "delete question history", "clear questions"] },
  // ---- belge sayfası: pekiştirme testi ----
  "test.olustur": { ad: "Create a practice quiz", ifadeler: ["practice quiz", "create quiz", "create a quiz", "create practice quiz", "start quiz", "start practice quiz", "new quiz", "make a quiz", "generate quiz", "quiz me"] },
  "test.kolay": { ad: "Difficulty: easy", ifadeler: ["easy", "easy quiz", "easy difficulty", "difficulty easy"] },
  "test.orta": { ad: "Difficulty: medium", ifadeler: ["medium", "medium quiz", "medium difficulty", "difficulty medium"] },
  "test.zor": { ad: "Difficulty: hard", ifadeler: ["hard", "hard quiz", "hard difficulty", "difficulty hard"] },
  "test.bes": { ad: "5 questions", ifadeler: ["five questions", "5 questions", "five question quiz", "5 question quiz"] },
  "test.on": { ad: "10 questions", ifadeler: ["ten questions", "10 questions", "ten question quiz", "10 question quiz"] },
  "sik.1": { ad: "Select option A", ifadeler: ["option a", "a", "answer a", "choice a", "first option", "first", "option one", "1"] },
  "sik.2": { ad: "Select option B", ifadeler: ["option b", "b", "bee", "answer b", "choice b", "second option", "second", "option two", "2"] },
  "sik.3": { ad: "Select option C", ifadeler: ["option c", "c", "see", "sea", "answer c", "choice c", "third option", "third", "option three", "3"] },
  "sik.4": { ad: "Select option D", ifadeler: ["option d", "d", "dee", "answer d", "choice d", "fourth option", "fourth", "option four", "4"] },
  "test.sonraki": { ad: "Next question", ifadeler: ["next question", "skip question", "skip", "next one"] },
  "test.onceki": { ad: "Previous question", ifadeler: ["previous question", "go to previous question", "last question"] },
  "test.oku": { ad: "Read the question and options", ifadeler: ["read question", "read the question", "repeat question", "read options", "read the question and options"] },
  "test.bitir": { ad: "Finish the quiz", ifadeler: ["finish quiz", "finish the quiz", "submit quiz", "show result", "show results", "end quiz", "finish"] },
  "test.sonuc": { ad: "Read the result", ifadeler: ["read result", "read my result", "what is my score", "how many did i get right", "my score", "read score"] },
  "test.yanlis": { ad: "Explain the mistakes", ifadeler: ["read mistakes", "explain mistakes", "read wrong answers", "explain wrong answers", "read explanations"] },
  "test.tekrar": { ad: "Retake the quiz", ifadeler: ["retake quiz", "retake the quiz", "take the quiz again", "redo quiz", "try again"] },
  "test.sil": { ad: "Delete the quiz", ifadeler: ["delete quiz", "delete this quiz", "remove quiz"] },
};

export const DOLGU_EN = ["please", "now", "assistant", "hey", "ok", "okay", "could", "would", "you", "can", "just", "the", "thanks", "kindly"];
export const SAYI_KELIME_EN: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
export const SIRA_KELIME_EN: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
};
export const EVET_EN = ["yes", "yeah", "yep", "sure", "okay", "ok", "confirm", "correct"];
export const HAYIR_EN = ["no", "nope", "cancel", "stop", "abort", "dont"];
