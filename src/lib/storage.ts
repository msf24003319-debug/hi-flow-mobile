import { supabase } from './supabase-client';

/** Downscale + JPEG-encode an image File in the browser via canvas. */
async function compress(file: File, maxWidth = 1280): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.72)
  );
}

/** Extract the storage object path from a public URL for a given bucket. */
function pathFromPublicUrl(url: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : url.slice(i + marker.length);
}

/**
 * Upload a product image; if `previousUrl` is given and points at this
 * bucket, delete the old object so storage doesn't accumulate orphans
 * (PDF: "Old image deleted from storage").
 */
export async function uploadProductImage(
  file: File,
  previousUrl?: string
): Promise<string> {
  const bucket = 'product-images';
  const blob = await compress(file);
  const path = `products/${Date.now()}-${crypto.randomUUID()}.jpg`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;

  if (previousUrl) {
    const old = pathFromPublicUrl(previousUrl, bucket);
    if (old) await supabase.storage.from(bucket).remove([old]);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/** Upload a service catalog image; replaces the previous one if given, same as uploadProductImage. */
export async function uploadServiceImage(file: File, previousUrl?: string): Promise<string> {
  const bucket = 'service-images';
  const blob = await compress(file);
  const path = `services/${Date.now()}-${crypto.randomUUID()}.jpg`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;

  if (previousUrl) {
    const old = pathFromPublicUrl(previousUrl, bucket);
    if (old) await supabase.storage.from(bucket).remove([old]);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * CNIC documents live in a private bucket. Mobile stores the object path
 * in cnic_front_url / cnic_back_url; resolve it to a signed URL here.
 * Falls back to the value as-is if it already looks like a full URL.
 */
export async function signCnicUrl(pathOrUrl?: string | null): Promise<string | null> {
  if (!pathOrUrl) return null;
  // Already a full URL (public bucket, or a pre-signed link) — use as-is.
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;

  // Normalize to a bucket-relative object path: strip a leading slash, a
  // "cnic-documents/" bucket prefix, or a "storage/v1/object/.../cnic-documents/"
  // fragment left over from an earlier storage helper.
  const path = pathOrUrl
    .replace(/^\/+/, '')
    .replace(/^(?:storage\/v1\/object\/(?:sign|public|authenticated)\/)?cnic-documents\//, '');

  const { data, error } = await supabase.storage
    .from('cnic-documents')
    .createSignedUrl(path, 60 * 10);
  if (error) {
    console.warn('[signCnicUrl] could not sign', path, '-', error.message);
    return null;
  }
  return data.signedUrl;
}

