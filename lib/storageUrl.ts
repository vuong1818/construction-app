import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// Reading a stored file goes through a SIGNED url, not a public one.
//
// Most of the storage buckets were created public, which in Supabase means the
// object is served to anyone who has — or can guess — the path, with no login.
// The web portal already reads through signed urls; this is the phone doing the
// same, and it is the prerequisite for closing the buckets.
//
// A row may hold either shape: newer writes store a PATH in a *_path column,
// older ones store a whole public url in *_url. objectPath() reduces both to
// the same object so a screen can pass `row.file_path || row.file_url` and not
// care which it got.

const OBJECT_RE = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?]+)\/(.+?)(?:\?|$)/

/** Normalise a stored value to the object's path within its bucket. */
export function objectPath(value?: string | null): string | null {
  if (!value) return null
  const s = String(value).trim()
  if (!s) return null
  const m = s.match(OBJECT_RE)
  if (m) {
    try { return decodeURIComponent(m[2]) } catch { return m[2] }
  }
  return s.replace(/^\/+/, '')
}

/** The bucket named inside a full storage url, or null for a bare path. */
export function bucketOf(value?: string | null): string | null {
  const m = value ? String(value).match(OBJECT_RE) : null
  return m ? m[1] : null
}

// A signed url costs a round trip, and a job-kit screen with thirty photos
// would otherwise mint thirty on every render. Cache per (bucket, path) and
// re-sign once the url is within a minute of expiring.
const cache = new Map<string, { url: string; expiresAt: number }>()
const DEFAULT_TTL = 60 * 60

// storageOrgScope prefixes every path with the CALLER's org, which is right
// until the file belongs to a project another company shared with us. Their
// plan is stored as `46/plan.pdf`, the wrapper makes it `{our org}/46/plan.pdf`,
// and storage says "Object not found" — which is what a subcontractor saw on
// every plan and every photo. The storage policy was always right: it reads the
// owning org off the front of the path. It just never got a path with that org
// on it. So callers on a shared project pass ownerOrg.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function withOwnerOrg(path: string | null, ownerOrg?: string | null): string | null {
  if (!path || !ownerOrg) return path
  const clean = String(path).replace(/^\/+/, '')
  if (UUID_RE.test(clean.split('/')[0])) return clean
  return `${ownerOrg}/${clean}`
}

/**
 * A signed, expiring url for one object, or null when it cannot be signed —
 * the caller shows whatever placeholder it already has rather than a broken
 * image.
 */
export async function signedUrl(
  bucket: string,
  value?: string | null,
  opts?: { expiresIn?: number; ownerOrg?: string | null },
): Promise<string | null> {
  const path = withOwnerOrg(objectPath(value), opts?.ownerOrg)
  if (!path) return null
  // A stored url naming its own bucket wins over the caller's guess: the row
  // knows where its file lives.
  const b = bucketOf(value) || bucket
  if (!b) return null

  const expiresIn = opts?.expiresIn ?? DEFAULT_TTL
  // Already whole when ownerOrg was supplied; otherwise storageOrgScope adds
  // our own org on the way through.
  const full = path
  const key = `${b}|${full}`
  const hit = cache.get(key)
  if (hit && hit.expiresAt - Date.now() > 60_000) return hit.url

  const { data, error } = await supabase.storage.from(b).createSignedUrl(full, expiresIn)
  if (error || !data?.signedUrl) {
    // Deliberately no fall back to getPublicUrl: that is the thing being
    // removed, and quietly serving a public url would undo the fix while
    // looking like it worked.
    cache.delete(key)
    return null
  }
  cache.set(key, { url: data.signedUrl, expiresAt: Date.now() + expiresIn * 1000 })
  return data.signedUrl
}

/** Sign many at once, preserving order. */
export async function signedUrls(
  bucket: string,
  values: (string | null | undefined)[],
  opts?: { expiresIn?: number },
): Promise<(string | null)[]> {
  return Promise.all((values || []).map((v) => signedUrl(bucket, v, opts)))
}

/** Forget a cached url — call after replacing or deleting the object. */
export function forgetSignedUrl(bucket: string, value?: string | null) {
  const path = objectPath(value)
  if (path) cache.delete(`${bucketOf(value) || bucket}|${path}`)
}

/**
 * Render-time signing. Returns null until it resolves, and only ever returns a
 * url for the value that asked for it — a list row reused for a different
 * record must not flash the previous row's photo.
 */
export function useSignedUrl(
  bucket: string,
  value?: string | null,
  opts?: { expiresIn?: number; ownerOrg?: string | null },
): string | null {
  const [state, setState] = useState<{ key: string | null; url: string | null }>({ key: null, url: null })
  const expiresIn = opts?.expiresIn
  // Without this every SignedImage on a shared project asked storage for OUR
  // org's copy of their file and got nothing — the fix went into signedUrl and
  // stopped there, which covered the code that calls it directly and missed
  // every component that renders through this hook.
  const ownerOrg = opts?.ownerOrg ?? null
  const path = withOwnerOrg(objectPath(value), ownerOrg)
  const key = path ? `${bucketOf(value) || bucket}|${path}` : null

  useEffect(() => {
    if (!key) return
    let alive = true
    signedUrl(bucket, value, { ...(expiresIn ? { expiresIn } : {}), ownerOrg })
      .then((u) => { if (alive) setState({ key, url: u }) })
      .catch(() => { if (alive) setState({ key, url: null }) })
    return () => { alive = false }
  }, [bucket, value, expiresIn, ownerOrg, key])

  return key && state.key === key ? state.url : null
}
