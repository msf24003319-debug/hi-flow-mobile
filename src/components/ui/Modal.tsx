'use client';

import { X } from 'lucide-react';
import { ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  headerActions?: ReactNode;
  wide?: boolean;
  dark?: boolean;
}

export function Modal({ open, onClose, title, subtitle, children, footer, headerActions, wide, dark }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div
        className={`w-full ${wide ? 'max-w-4xl' : 'max-w-2xl'} ${dark ? 'bg-[#1a1a1a] text-gray-200 border-gray-800' : 'bg-surface border-border'} border rounded-xl shadow-2xl flex flex-col max-h-[90vh]`}
      >
        <div className="h-16 px-6 border-b border-border flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white">{title}</h2>
            {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
          {headerActions}
          <button type="button" aria-label="Close modal" onClick={onClose} className="p-1.5 rounded-lg text-subtle hover:text-white hover:bg-card">
            <X className="h-5 w-5" />
          </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
