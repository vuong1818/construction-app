// The drawn signature goes to storage, and the row keeps the path. (2026-09-11)
//
// Acknowledgement rows used to carry the PNG inline as a data URL — 112 KB a
// row, 29 MB across 233 rows, more than every table but the catalog. The PNG
// now lives in the private safety-signatures bucket under
// {org}/signatures/{kind}/{worker}/{stamp}.png (the storage wrapper adds the
// org) and the row stores signature_path. The office's view link and PDF
// report read either form, so a failed upload can still fall back to the
// inline column rather than losing the signature.
import { supabase } from './supabase'

const DATA_URL = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/

/**
 * Upload a signature data URL. Resolves to the storage path, or null when
 * the value is not an image data URL or the upload failed (the caller then
 * keeps the data URL in signature_text as before).
 */
export async function uploadSignature(
  dataUrl: string | null | undefined,
  kind: 'manual' | 'meeting',
  workerId: string,
): Promise<string | null> {
  const m = DATA_URL.exec(dataUrl || '')
  if (!m) return null
  try {
    const type = m[1] === 'jpg' ? 'jpeg' : m[1]
    const bin = atob(m[2])
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const path = `signatures/${kind}/${workerId}/${Date.now()}.${type === 'jpeg' ? 'jpg' : type}`
    const { data, error } = await supabase.storage
      .from('safety-signatures')
      .upload(path, bytes, { contentType: `image/${type}`, upsert: false })
    if (error) return null
    // The wrapper prefixed the org; keep the full path the server will read.
    return data?.path || null
  } catch {
    return null
  }
}
