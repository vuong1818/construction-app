/**
 * Build a single human-readable address string from a project's address
 * components. Falls back to the legacy `address` field when component
 * fields haven't been filled in yet.
 */
export function formatProjectAddress(p: {
  address?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
} | null | undefined): string {
  if (!p) return ''
  const street = (p.address || '').trim()
  const city   = (p.city    || '').trim()
  const state  = (p.state   || '').trim()
  const zip    = (p.zip     || '').trim()

  if (city || state || zip) {
    const cityState = [city, state].filter(Boolean).join(', ')
    const tail      = [cityState, zip].filter(Boolean).join(' ')
    return [street, tail].filter(Boolean).join(', ')
  }
  return street
}
