'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import { Menu, LogOut, User } from 'lucide-react';

interface NavbarProps {
  onMenuClick: () => void;
  userEmail?: string;
}

export function Navbar({ onMenuClick, userEmail }: NavbarProps) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.replace('/login');
  };

  return (
    <header className="h-16 bg-surface border-b border-border sticky top-0 z-30 px-4 sm:px-6 flex items-center justify-between">
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-lg text-subtle hover:bg-card hover:text-white transition"
        aria-label="Toggle navigation"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="flex-1" />
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 text-xs text-subtle bg-card px-3 py-1.5 rounded-full border border-border">
          <User className="h-3.5 w-3.5 text-brand" />
          <span className="font-medium truncate max-w-[180px]">{userEmail || 'Admin'}</span>
        </div>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex items-center gap-1.5 text-xs font-medium text-danger hover:bg-danger/10 border border-danger/40 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{loggingOut ? '...' : 'Logout'}</span>
        </button>
      </div>
    </header>
  );
}
