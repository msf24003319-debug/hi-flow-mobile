'use client';

import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { ShieldAlert } from 'lucide-react';

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, loading, isAdmin } = useAdminAuth('/login');

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-bg flex flex-col items-center justify-center text-subtle">
        <div className="h-8 w-8 border-2 border-border border-t-brand rounded-full animate-spin mb-3" />
        <span className="text-sm">Loading admin…</span>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen w-full bg-bg flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-surface border border-danger/40 rounded-xl p-6 text-center">
          <ShieldAlert className="h-12 w-12 text-danger mx-auto mb-4" />
          <h2 className="text-lg font-bold text-white mb-2">Access Denied</h2>
          <p className="text-sm text-subtle mb-6">You do not have administrator access.</p>
          <a href="/login" className="inline-block px-4 py-2 bg-brand text-bg rounded-lg text-sm font-semibold">
            Return to Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-white flex">
      <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar onMenuClick={() => setMobileOpen(true)} userEmail={user?.email} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
