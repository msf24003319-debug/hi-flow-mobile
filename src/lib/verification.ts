import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase-client';
import { ProfileVerification, VerificationStatus } from '@/types/admin.types';

// Progressively smaller column sets. Each is only valid on a database that
// has run the corresponding migration; a missing column 400s the whole
// select, so we fall back a tier at a time.
//   FULL   — + cnic_ocr_* (20261004000000_cnic_ocr_status)
//   NO_OCR — + verified_at/by, rejection reason (20260930/20261001)
//   SLIM   — the columns present on the live table pre-migration
const FULL =
  'verification_status, verification_rejection_reason, cnic_number, cnic_front_url, cnic_back_url, verified_at, verified_by, cnic_ocr_status, cnic_ocr_detected_number, cnic_ocr_confidence, cnic_ocr_checked_at';
const NO_OCR =
  'verification_status, verification_rejection_reason, cnic_number, cnic_front_url, cnic_back_url, verified_at, verified_by';
const SLIM = 'verification_status, cnic_number, cnic_front_url, cnic_back_url';

/**
 * Fetch a single user's CNIC-verification fields from `profiles`, tolerating a
 * database where a verification migration hasn't been applied yet (a FULL
 * select then 400s on the missing column, so we retry with a smaller set).
 */
export async function fetchProfileVerification(
  id: string,
): Promise<ProfileVerification | null> {
  for (const cols of [FULL, NO_OCR, SLIM]) {
    const res = await supabase.from('profiles').select(cols).eq('id', id).maybeSingle();
    if (!res.error) return (res.data as unknown as ProfileVerification) ?? null;
    console.warn(
      `[verification] profile select failed (${cols === FULL ? 'full' : cols === NO_OCR ? 'no-ocr' : 'slim'}), retrying smaller:`,
      res.error.message,
    );
  }
  console.error('[verification] every profile select tier failed');
  return null;
}

/** PostgREST "column not in the schema cache" — the table is missing that
 *  column on this deployment (schema drift; migration not yet applied). */
function isMissingColumn(err: PostgrestError | null): boolean {
  if (!err) return false;
  return err.code === 'PGRST204' || /Could not find the .*column/i.test(err.message ?? '');
}

/**
 * `.update(payload)` on `table` for row `id`, returning the affected ids.
 * If the write 400s because a column in `payload` doesn't exist on this
 * database, retry with the next (smaller) payload in `fallbacks`.
 */
async function updateRow(
  table: 'profiles' | 'shopkeepers' | 'customers',
  id: string,
  payload: Record<string, unknown>,
  ...fallbacks: Record<string, unknown>[]
) {
  let res = await supabase.from(table).update(payload).eq('id', id).select('id');
  for (const next of fallbacks) {
    if (!isMissingColumn(res.error)) break;
    console.warn(
      `[verification] ${table}: dropping unknown column and retrying —`,
      res.error?.message,
    );
    res = await supabase.from(table).update(next).eq('id', id).select('id');
  }
  return res;
}

/** Thrown when an approve/reject write touched 0 rows — i.e. RLS `is_admin()`
 *  did not evaluate true for this session, so the "success" was a silent no-op. */
export class RlsBlockedError extends Error {
  constructor(table: string) {
    super(
      `The ${table} update was blocked by row-level security (0 rows changed) — ` +
        "this session isn't recognised as an admin. Confirm your profiles.role = 'admin' " +
        'and that the verification migrations (20261001000000 + 20261002000000) have run.',
    );
    this.name = 'RlsBlockedError';
  }
}

/**
 * Approve or reject a buyer — the single write path for both the shopkeeper
 * and customer verification modals.
 *
 * Always updates `public.profiles.verification_status` — the source of truth the
 * mobile app reads (`authStore.refreshProfile`) — plus the role's own status
 * mirror:
 *   - shopkeeper -> `public.shopkeepers` (status, rejection_reason, verified_at)
 *   - customer   -> `public.customers`   (status, verification_rejection_reason,
 *                                         verified_at)
 *
 * Guarantees, per requirement:
 *   - every `.update()` is checked for a Supabase error AND for 0 affected rows;
 *     either one throws an explicit Error (never a silent success),
 *   - schema-drift tolerant: a payload column the live DB lacks is dropped and
 *     the write retried (`updateRow` fallbacks), so it works before/after the
 *     verification migrations (20261001000000 / 20261002000000).
 */
export async function setVerificationStatus(
  id: string,
  role: 'shopkeeper' | 'customer',
  status: Extract<VerificationStatus, 'approved' | 'rejected'>,
  rejectionReason?: string,
): Promise<{ verifiedAt: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const verifiedAt = new Date().toISOString();
  const reason = status === 'rejected' ? rejectionReason?.trim() || null : null;

  // --- 1. profiles (source of truth) ---------------------------------
  const prof = await updateRow(
    'profiles',
    id,
    {
      verification_status: status,
      verified_at: verifiedAt,
      verified_by: user?.id ?? null,
      verification_rejection_reason: reason,
    },
    { verification_status: status, verified_at: verifiedAt, verified_by: user?.id ?? null },
    { verification_status: status, verified_at: verifiedAt },
    { verification_status: status },
  );
  if (prof.error) {
    throw new Error(`Could not update public.profiles.verification_status: ${prof.error.message}`);
  }
  if (!prof.data || prof.data.length === 0) {
    throw new RlsBlockedError('profiles');
  }

  // --- 2. role status mirror ----------------------------------------
  if (role === 'shopkeeper') {
    const sk = await updateRow(
      'shopkeepers',
      id,
      { status, rejection_reason: reason, verified_at: verifiedAt },
      { status, rejection_reason: reason },
      { status },
    );
    if (sk.error) {
      throw new Error(`Could not update public.shopkeepers.status: ${sk.error.message}`);
    }
    if (!sk.data || sk.data.length === 0) {
      throw new RlsBlockedError('shopkeepers');
    }
  } else {
    // role === 'customer' — mirror onto public.customers (added by
    // 20261002000000_customer_verification_mirror).
    const cust = await updateRow(
      'customers',
      id,
      { status, verification_rejection_reason: reason, verified_at: verifiedAt },
      { status, verification_rejection_reason: reason },
      { status },
    );
    if (cust.error) {
      throw new Error(`Could not update public.customers.status: ${cust.error.message}`);
    }
    if (!cust.data || cust.data.length === 0) {
      throw new RlsBlockedError('customers');
    }
  }

  return { verifiedAt };
}
