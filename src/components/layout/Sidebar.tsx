'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  UserCheck,
  Users,
  Package,
  Tags,
  Boxes,
  ShoppingCart,
  MapPin,
  Zap,
  Store,
  MessageSquare,
  Star,
  FileText,
  Wrench,
  ClipboardList,
  X,
} from 'lucide-react';

interface SidebarProps {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

const navItems = [
  { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Shopkeepers', href: '/dashboard/shopkeepers', icon: UserCheck },
  { name: 'Customers', href: '/dashboard/customers', icon: Users },
  { name: 'Products', href: '/dashboard/products', icon: Package },
  { name: 'Category Price Edit', href: '/dashboard/products/bulk-price', icon: Tags },
  { name: 'Inventory', href: '/dashboard/products/inventory', icon: Boxes },
  { name: 'Orders', href: '/dashboard/orders', icon: ShoppingCart },
  { name: 'POS Terminal', href: '/dashboard/pos', icon: ShoppingCart },
  { name: 'Billing History', href: '/dashboard/history', icon: ClipboardList },
  { name: 'Locations', href: '/dashboard/locations', icon: MapPin },
  { name: 'Services', href: '/dashboard/services', icon: Wrench },
  { name: 'Service Requests', href: '/dashboard/service-requests', icon: ClipboardList },
  { name: 'Motor Inquiries', href: '/dashboard/motor-inquiries', icon: Zap },
  { name: 'Franchise Leads', href: '/dashboard/franchise-leads', icon: Store },
  { name: 'Feedback', href: '/dashboard/feedback', icon: MessageSquare },
  { name: 'Reviews', href: '/dashboard/reviews', icon: Star },
  { name: 'About Content', href: '/dashboard/content/about', icon: FileText },
  { name: 'Blog Content', href: '/dashboard/content/blog', icon: FileText },
];

export function Sidebar({ mobileOpen, setMobileOpen }: SidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);

  const nav = (
    <div className="flex flex-col h-full bg-surface border-r border-border text-subtle">
      <div className="h-16 flex items-center justify-between px-6 border-b border-border">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-brand flex items-center justify-center font-black text-bg">
            HF
          </div>
          <span className="font-bold text-base text-white tracking-wide">Hi Flow Admin</span>
        </Link>
        <button onClick={() => setMobileOpen(false)} className="lg:hidden text-subtle hover:text-white p-1">
          <X className="h-6 w-6" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1 custom-scrollbar">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-brand/10 text-brand border border-brand/25'
                  : 'text-subtle hover:bg-card hover:text-white'
              }`}
            >
              <Icon className={`h-4 w-4 mr-3 ${active ? 'text-brand' : ''}`} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border text-xs text-muted text-center">
        Hi Flow Pump Industries &copy; 2026
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-64 shrink-0 h-screen sticky top-0">{nav}</aside>
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/70" onClick={() => setMobileOpen(false)} />
          <div className="relative w-64 max-w-[80%] h-full z-10">{nav}</div>
        </div>
      )}
    </>
  );
}
