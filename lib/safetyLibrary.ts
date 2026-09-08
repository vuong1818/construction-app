// The safety library a crew sees is two libraries stacked: the shared preset
// documents every company gets, and the documents that company uploaded
// itself. A company that has its own copy of a document should not also be
// shown ours — same code, same content, listed twice.
//
// The company's own copy always wins: they chose it, it may be a newer
// revision, and their signatures are recorded against it.

type LibraryRow = { code?: string | null; is_preset?: boolean | null }

export function ownCopyWins<T extends LibraryRow>(rows: T[]): T[] {
  const mine = new Set(
    rows.filter(r => !r.is_preset && r.code).map(r => r.code as string),
  )
  return rows.filter(r => !(r.is_preset && r.code && mine.has(r.code)))
}
