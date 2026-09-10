import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-surface border border-danger/40 rounded-xl p-6 text-center">
        <ShieldAlert className="h-12 w-12 text-danger mx-auto mb-4" />
        <h1 className="text-lg font-bold text-white mb-2">Access Denied</h1>
        <p className="text-sm text-subtle mb-6">
          Your account does not have administrator access to this panel.
        </p>
        <Link href="/login" className="inline-block px-4 py-2 bg-brand text-bg rounded-lg text-sm font-semibold">
          Return to Login
        </Link>
      </div>
    </div>
  );
}
