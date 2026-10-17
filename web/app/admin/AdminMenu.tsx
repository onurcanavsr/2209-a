"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const SAYFALAR = [
  { href: "/admin", ad: "Genel bakış" },
  { href: "/admin/kullanicilar", ad: "Kullanıcılar" },
  { href: "/admin/kullanim", ad: "Kullanım ve maliyet" },
];

export default function AdminMenu() {
  const yol = usePathname();
  return (
    <nav aria-label="Yönetim menüsü" className="admin-menu">
      {SAYFALAR.map((s) => (
        <Link key={s.href} href={s.href} aria-current={yol === s.href ? "page" : undefined}>{s.ad}</Link>
      ))}
    </nav>
  );
}
