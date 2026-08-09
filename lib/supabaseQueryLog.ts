// Make a failed query say so.
//
// Audit of 2026-08-09, P5. The common shape across both apps is:
//
//     const { data } = await supabase.from("daily_reports").select("*")...
//     setReports(data || []);
//
// The error is never inspected, so a failed request and an empty table render
// identically. That is what produced "There are no reports to view yet" on a
// project holding eleven of them, and what hid the material picker showing 1000
// of 14,208 rows. 156 reads in the web app and 58 in the mobile app are written
// this way.
//
// Editing 214 call sites is not the fix — each one needs its own judgement
// about what the user should see, and a blanket rewrite would be 214 chances to
// get it wrong. What can be fixed centrally is the *silence*: every PostgREST
// request goes over HTTP, so wrapping fetch catches every failure in both apps
// at one place, without touching a single query or changing any control flow.
//
// A failure now lands in the console with the table, the status and the message
// PostgREST returned. Nothing else changes: the request still resolves the way
// it did, callers still get { data: null, error }, and a screen that swallowed
// an error still swallows it — but the error is no longer invisible while you
// are looking for it.
//
// This is deliberately observation only. Making these throw would turn a blank
// list into a crash on 214 paths at once, which is a worse failure than the one
// being fixed.

const REST = "/rest/v1/";

export type QueryFailure = {
  table: string; status: number; message: string;
  details: string | null; hint: string | null; fingerprint: string;
};

// Never log a failure caused by the logger itself. Without this, one broken
// insert into app_error_logs becomes an insert per retry, forever.
const SELF = "app_error_logs";

// The same broken query usually fires on every render and every refetch. One
// row a minute per distinct problem is enough to spot it; more is just noise
// that buries everything else.
const QUIET_MS = 60_000;
const lastSeen = new Map<string, number>();

function shouldReport(fingerprint: string): boolean {
  const now = Date.now();
  const prev = lastSeen.get(fingerprint);
  if (prev && now - prev < QUIET_MS) return false;
  lastSeen.set(fingerprint, now);
  // The map is bounded by the number of distinct failures, but trim anyway.
  if (lastSeen.size > 200) {
    for (const [k, t] of lastSeen) if (now - t > QUIET_MS) lastSeen.delete(k);
  }
  return true;
}

/** Pull the table name back out of a PostgREST url, for a readable log line. */
function tableOf(url: unknown): string {
  const i = String(url).indexOf(REST);
  if (i === -1) return "?";
  return String(url).slice(i + REST.length).split("?")[0];
}

/**
 * Wraps fetch so failed PostgREST calls are reported. Pass to createClient as
 * `{ global: { fetch: loggingFetch } }`.
 *
 * `onError` receives { table, status, message, details, hint, fingerprint } and
 * is where persistence happens — see lib/supabase.js. It is called at most once
 * a minute per distinct failure and must never throw.
 */
export function makeLoggingFetch(onError?: (info: QueryFailure) => void) {
  return async function loggingFetch(input: RequestInfo | URL, init?: RequestInit) {
    const res = await fetch(input, init);
    if (res.ok) return res;

    const url = typeof input === "string" ? input : (input as Request)?.url || String(input);
    if (!String(url).includes(REST)) return res;
    if (String(url).includes(SELF)) return res;

    // Read the body from a clone so the caller still gets an unconsumed stream.
    let body: any = {};
    try { body = await res.clone().json(); } catch { /* not json, never mind */ }

    const table = tableOf(url);
    const message = body?.message || res.statusText;
    const info = {
      table,
      status: res.status,
      message,
      details: body?.details || null,
      hint: body?.hint || null,
      // Groups "this same problem again" without the row ids that make every
      // occurrence look unique.
      fingerprint: `rest:${res.status}:${table}:${String(message).slice(0, 80)}`,
    };

    console.error(
      `[supabase] ${info.status} on ${info.table}: ${info.message}` +
      (info.hint ? ` — ${info.hint}` : ""),
      info.details || "",
    );

    if (shouldReport(info.fingerprint)) {
      try { onError?.(info); } catch { /* a reporter must never break a request */ }
    }
    return res;
  };
}

export default makeLoggingFetch;
