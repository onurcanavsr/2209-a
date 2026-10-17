import AdminMenu from "./AdminMenu";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <h1>Yönetim Paneli</h1>
      <AdminMenu />
      {children}
    </div>
  );
}
