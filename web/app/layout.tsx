import "./globals.css";

export const metadata = { title: "Akademik Asistan" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap" />
      </head>
      <body>
        <a className="skip" href="#icerik">Ana içeriğe geç</a>
        <main id="icerik">{children}</main>
      </body>
    </html>
  );
}
