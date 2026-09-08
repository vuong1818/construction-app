// Project reference number — the same code the web portal generates, so a job
// created from a phone is indistinguishable from one created at a desk.
// Format: YY + City(3) + Name(3) + MMDD  (e.g. 26HOUWHA0710).
//   • YY      — 2-digit year the project was created
//   • City(3) — first 3 letters of the city
//   • Name(3) — 3+ word names → initials of the first 3 words (First Baptist Church → FBC);
//               1–2 word names → first 3 letters of the first word (Whataburger Remodel → WHA)
//   • MMDD    — month + day created
// Kept byte-for-byte in step with lib/projectRef.js in the web repo: two codes
// for the same job on the same day must match, or the office cannot find it.

function cleanAlnum(s: string | null | undefined): string {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// The name segment — initials for 3+ words, else first 3 letters of the first word.
function nameCode(name: string | null | undefined): string {
  const words = String(name || '')
    .trim()
    .split(/\s+/)
    .map(w => w.replace(/[^A-Za-z0-9]/g, ''))
    .filter(Boolean)
  let code = ''
  if (words.length >= 3) code = words.slice(0, 3).map(w => w[0]).join('')
  else if (words.length > 0) code = words[0].slice(0, 3)
  return code.toUpperCase().slice(0, 3)
}

export function generateProjectRef(
  { name, city, date }: { name?: string | null; city?: string | null; date?: Date | string | null } = {},
): string {
  const d = date instanceof Date ? date : (date ? new Date(date) : new Date())
  const yy = String(d.getFullYear()).slice(-2)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const cityPart = cleanAlnum(city).slice(0, 3)
  return `${yy}${cityPart}${nameCode(name)}${mm}${dd}`
}

// Ensure the generated ref is unique within a set of existing refs (case-insensitive),
// appending -2, -3, … on collision. Descriptive codes can repeat (same city + name +
// day); this keeps them distinct. The DB unique index is the final backstop.
export function uniqueProjectRef(base: string, existingRefs: (string | null | undefined)[] = []): string {
  const taken = new Set((existingRefs || []).filter(Boolean).map(r => String(r).toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  let n = 2
  while (taken.has(`${base}-${n}`.toLowerCase())) n++
  return `${base}-${n}`
}
