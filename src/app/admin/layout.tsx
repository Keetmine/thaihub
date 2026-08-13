export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="admin-shell d-flex flex-column min-vh-100">{children}</div>;
}
