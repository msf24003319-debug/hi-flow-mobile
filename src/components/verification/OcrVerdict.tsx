import { clsx } from 'clsx';
import { formatCnic, formatDateTime } from '@/lib/utils';
import { CnicOcrStatus, ProfileVerification } from '@/types/admin.types';

const OCR_MAP: Record<CnicOcrStatus, string> = {
  pending: 'bg-border text-subtle border-border',
  processing: 'bg-info/15 text-info border-info/30',
  matched: 'bg-ok/15 text-ok border-ok/30',
  mismatch: 'bg-warn/15 text-warn border-warn/30',
  ocr_failed: 'bg-danger/15 text-danger border-danger/30',
  manual_review: 'bg-warn/15 text-warn border-warn/30',
};

const OCR_LABEL: Record<CnicOcrStatus, string> = {
  pending: 'Not checked',
  processing: 'Processing',
  matched: 'Match',
  mismatch: 'Mismatch',
  ocr_failed: 'Could not read',
  manual_review: 'Needs manual review',
};

export function OcrBadge({ status }: { status?: CnicOcrStatus | null }) {
  const s = (status ?? 'pending') as CnicOcrStatus;
  return (
    <span
      className={clsx(
        'inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border',
        OCR_MAP[s] ?? OCR_MAP.pending,
      )}
    >
      {OCR_LABEL[s] ?? 'Not checked'}
    </span>
  );
}

/**
 * Read-only PaddleOCR summary for the CNIC verification modals.
 * OCR compares the typed CNIC against the number read off the uploaded
 * photo. It is NOT proof the CNIC is genuine — the admin's Approve/Reject
 * below is the actual verification.
 */
export function OcrVerdict({ prof }: { prof: ProfileVerification | null }) {
  const status = (prof?.cnic_ocr_status ?? 'pending') as CnicOcrStatus;
  const conf = prof?.cnic_ocr_confidence;

  return (
    <div className="rounded-lg border border-border bg-bg p-3 space-y-1.5">
      <div className="flex items-center gap-2">
        <p className="text-muted">CNIC OCR check</p>
        <OcrBadge status={status} />
        {typeof conf === 'number' && status !== 'pending' && status !== 'ocr_failed' && (
          <span className="text-[10px] text-muted">legibility {Math.round(conf * 100)}%</span>
        )}
      </div>

      {prof?.cnic_ocr_detected_number ? (
        <p className="text-white">
          Detected: <span className="font-mono">{formatCnic(prof.cnic_ocr_detected_number)}</span>
        </p>
      ) : (
        <p className="text-subtle">Detected: —</p>
      )}

      {prof?.cnic_ocr_checked_at && (
        <p className="text-[10px] text-muted">Checked {formatDateTime(prof.cnic_ocr_checked_at)}</p>
      )}

      <p className="text-[10px] text-muted leading-snug">
        OCR only compares the typed number with the photo — it does not confirm the CNIC is
        genuine or government-verified. Your decision below is the verification.
      </p>
    </div>
  );
}
