import "./globals.css";
import Link from "next/link";
import Araclar from "./components/Araclar";
import Kabuk from "./components/Kabuk";
import { createClient } from "@/lib/supabase/server";
import { SITE_ADI } from "@/lib/site";

export const metadata = { title: SITE_ADI };

const ONCEDEN_UYGULA = `try{var t=localStorage.getItem("tema"),b=localStorage.getItem("boyut"),r=document.documentElement;if(t&&t!=="auto")r.setAttribute("data-theme",t);if(b)r.style.setProperty("--fs",b+"px")}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = user?.app_metadata?.role === "admin";

  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap" />
        <script dangerouslySetInnerHTML={{ __html: ONCEDEN_UYGULA }} />
      </head>
      <body>
        <a className="skip" href="#icerik">Ana içeriğe geç</a>
        {user ? (
          <Kabuk admin={admin} eposta={user.email ?? ""}>{children}</Kabuk>
        ) : (
          <>
            <header className="ust ust-sade">
              <Link href="/" className="brand"><span className="logo" aria-hidden="true">{SITE_ADI[0]}</span>{SITE_ADI}</Link>
              <div className="tools"><Araclar /></div>
            </header>
            <main id="icerik" className="sade">{children}</main>
            <footer>
              <Link href="/aydinlatma">Aydınlatma Metni</Link> · <Link href="/kullanim-sartlari">Kullanım Şartları</Link>
            </footer>
          </>
        )}
      </body>
    </html>
  );
}
