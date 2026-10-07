'use client';

import { Download, Loader2, Printer } from 'lucide-react';
import { ReactNode, RefObject } from 'react';
import { Modal } from '@/components/ui/Modal';

interface OrderDetailsModalProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  onPrint: () => void;
  onDownload: () => void;
  exporting: boolean;
  invoiceReady: boolean;
  invoiceRef: RefObject<HTMLDivElement>;
  invoiceTemplate: ReactNode;
  children: ReactNode;
}

export function OrderDetailsModal({ title, subtitle, onClose, onPrint, onDownload,
  exporting, invoiceReady, invoiceRef, invoiceTemplate, children }: OrderDetailsModalProps) {
  const actionClass = 'p-2 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  return (
    <Modal open wide dark title={title} subtitle={subtitle} onClose={onClose}
      headerActions={<>
        <button type="button" aria-label="Print invoice" title="Print invoice"
          className={actionClass} disabled={!invoiceReady || exporting} onClick={onPrint}>
          <Printer className="h-5 w-5" />
        </button>
        <button type="button" aria-label="Download invoice PDF" title="Download invoice PDF"
          className={actionClass} disabled={!invoiceReady || exporting} onClick={onDownload}>
          {exporting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
        </button>
      </>}>
      {children}
      {invoiceReady && <div ref={invoiceRef} data-invoice-export
        className="absolute -left-[9999px] top-0 pointer-events-none" aria-hidden="true">
        {invoiceTemplate}
      </div>}
    </Modal>
  );
}
