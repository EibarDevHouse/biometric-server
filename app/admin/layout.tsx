import { ReactNode } from "react";
import Link from "next/link";

export const metadata = {
  title: "Biometric Admin",
  description: "Biometric device management",
};

export const revalidate = 3;

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-slate-900">Biometric Server</h1>
            <div className="flex gap-6">
              <Link href="/admin" className="text-slate-600 hover:text-slate-900">
                Dashboard
              </Link>
              <Link href="/admin/commands" className="text-slate-600 hover:text-slate-900">
                Commands
              </Link>
              <Link href="/admin/logs" className="text-slate-600 hover:text-slate-900">
                Logs
              </Link>
              <Link href="/admin/traffic" className="text-slate-600 hover:text-slate-900">
                Traffic
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
