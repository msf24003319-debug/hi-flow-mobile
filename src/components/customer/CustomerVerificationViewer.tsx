'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { signCnicUrl } from '@/lib/storage';
import { fetchProfileVerification, setVerificationStatus } from '@/lib/verification';
import { formatCnic, formatDate } from '@/lib/utils';
import {
  Customer,
  VerificationStatus,
  ProfileVerification,
  pickProfile,
} from '@/types/admin.types';
import { Modal } from '@/components/ui/Modal';
import { ImagePreviewModal } from '@/components/ui/ImagePreviewModal';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { OcrVerdict } from '@/components/verification/OcrVerdict';

interface CustomerVerificationViewerProps {
  customer: Customer | null;
  onClose: () => void;
  onUpdated: () => void;
  onStatusChange?: (id: string, status: VerificationStatus) => void;
}

/**
 * CNIC verification for a customer — mirrors the shopkeeper CNICViewer.
 * setVerificationStatus() writes profiles.verification_status (the source of
 * truth the mobile app reads) plus the public.customers status mirror.
 */
export function CustomerVerificationViewer({
  customer,
  onClose,
  onUpdated,
  onStatusChange,
}: CustomerVerificationViewerProps) {
  const [profilePic, setProfilePic] = useState<string | null>(null);
  const [front, setFront] = useState<string | null>(null);
  const [back, setBack] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [prof, setProf] = useState<ProfileVerification | null>(null);
  /** Local status — set the instant the DB write succeeds. */
  const [status, setStatus] = useState<VerificationStatus | null>(null);

  const currentStatus: VerificationStatus =
    status ??
    prof?.verification_status ??
    pickProfile(customer?.profiles)?.verification_status ??
    (customer?.status as VerificationStatus) ??
    'pending';

  const frontPath = prof?.cnic_front_url ?? customer?.cnic_front_url ?? null;
  const backPath = prof?.cnic_back_url ?? customer?.cnic_back_url ?? null;

  useEffect(() => {
    if (!customer) return;
    setProf(null);
    setStatus(null);
    setIsSubmitting(false);
    setErr(null);
    setFront(null);
    setBack(null);
    setProfilePic(customer.profile_pic_url ?? null);
    fetchProfileVerification(customer.id).then((p) => {
      setProf(p);
      setReason(p?.verification_rejection_reason ?? customer.verification_rejection_reason ?? '');
      signCnicUrl(p?.cnic_front_url ?? customer.cnic_front_url).then(setFront);
      signCnicUrl(p?.cnic_back_url ?? customer.cnic_back_url).then(setBack);
    });
  }, [customer]);

  const images = useMemo(
    () => [
      { label: 'Profile Picture', src: profilePic, path: customer?.profile_pic_url ?? null },
      { label: 'CNIC Front', src: front, path: frontPath },
      { label: 'CNIC Back', src: back, path: backPath },
    ],
    [profilePic, front, back, frontPath, backPath, customer?.profile_pic_url],
  );

  if (!customer) return null;

  const submitDecision = async (next: 'approved' | 'rejected') => {
    if (next === 'rejected' && !reason.trim()) {
      setErr('Please give a reason for rejection.');
      return;
    }
    setIsSubmitting(true);
    setErr(null);
    try {
      await setVerificationStatus(customer.id, 'customer', next, reason);
      setStatus(next);
      onStatusChange?.(customer.id, next);
      onUpdated();
      setTimeout(onClose, 550);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setIsSubmitting(false);
    }
  };

  const handleApprove = () => submitDecision('approved');
  const handleReject = () => submitDecision('rejected');

  return (
    <>
      <Modal
        wide
        open
        onClose={onClose}
        title="Customer Verification"
        subtitle={customer.name}
        footer={
          <>
            <button
              onClick={handleReject}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 bg-danger/10 text-danger border border-danger/40 rounded-lg text-xs font-semibold disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" /> Reject
            </button>
            <button
              onClick={handleApprove}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 bg-ok text-bg rounded-lg text-xs font-semibold disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" /> {isSubmitting ? 'Saving…' : 'Approve'}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            {images.map((d) => (
              <div key={d.label}>
                <p className="text-[11px] text-muted uppercase mb-1">{d.label}</p>
                <div
                  className={`aspect-[1.6/1] bg-bg rounded-lg border border-border overflow-hidden flex items-center justify-center ${
                    d.src ? 'cursor-zoom-in' : ''
                  }`}
                  onClick={() => d.src && setPreview(d.src)}
                >
                  {d.src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={d.src} alt={d.label} className="object-contain w-full h-full" />
                  ) : d.path ? (
                    <span className="text-xs text-warn px-2 text-center">
                      File on record but the link failed to load — reopen this modal to retry.
                    </span>
                  ) : (
                    <span className="text-xs text-muted">No image uploaded</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-3 text-xs">
            <Field label="Full Name" value={prof?.name ?? customer.name} />
            <Field label="CNIC Number" value={formatCnic(prof?.cnic_number ?? customer.cnic)} mono />
            <Field label="Phone" value={customer.phone} mono />
            <Field label="Area / City" value={customer.area ?? ''} />
            <Field label="Registered" value={formatDate(customer.created_at)} />

            <OcrVerdict prof={prof} />

            <div>
              <p className="text-muted">Current Status</p>
              <div className="mt-1">
                <StatusBadge status={currentStatus} />
              </div>
            </div>
            <div>
              <label className="text-muted block mb-1">Rejection reason (required to reject)</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="w-full bg-bg border border-border rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
            {err && <p className="text-danger">{err}</p>}
          </div>
        </div>
      </Modal>

      <ImagePreviewModal src={preview} onClose={() => setPreview(null)} />
    </>
  );
}

function Field({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div>
      <p className="text-muted">{label}</p>
      <p className={`text-white font-medium ${mono ? 'font-mono' : ''}`}>{value || '—'}</p>
    </div>
  );
}
