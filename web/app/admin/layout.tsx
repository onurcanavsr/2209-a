// Yönetim bağlantıları sol menüde (yalnızca yönetici hesabında) bulunur; burada yalnızca sayfa başlığı yer alır.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <h1>Yönetim Paneli</h1>
      {children}
    </div>
  );
}
