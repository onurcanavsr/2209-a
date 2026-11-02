"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n/client";

const SAYFALAR = [
  { href: "/admin", ad: "Genel bakış" },
  { href: "/admin/kullanicilar", ad: "Kullanıcılar" },
  { href: "/admin/kullanim", ad: "Kullanım ve maliyet" },
];

export default function AdminMenu() {
  const t = useT();
  const yol = usePathname();
  return (
    <nav aria-label={t("Yönetim menüsü")} className="admin-menu">
      {SAYFALAR.map((s) => (
        <Link key={s.href} href={s.href} aria-current={yol === s.href ? "page" : undefined}>{t(s.ad)}</Link>
      ))}
    </nav>
  );
}
