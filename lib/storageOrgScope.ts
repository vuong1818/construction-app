// Every storage path is scoped to the caller's org, in one place.
//
// storage_tenant_isolation reads the tenant off the front of the object's path:
//
//     (storage.foldername(name))[1] = current_org(auth.uid())
//
// so an object uploaded to `project-13/receipt.jpg` sits under no tenant and is
// readable by nobody, including whoever just uploaded it.
//
// The obvious place to fix that is the upload call — but there are 16 of them in
// this repo and 21 in the web portal, and any new one would have to remember. The
// database cannot do it either: Supabase Storage authenticates the caller at its
// API layer and then writes the metadata row as its OWN service role, so a
// trigger on storage.objects sees auth.uid() = NULL and has no idea whose file
// it is. That was tried in 20260806000031 and removed in 20260806000032.
//
// So it is done once, here, by wrapping the storage client. Every path-taking
// method gets the prefix, which means call sites keep passing the short path
// they always did and cannot forget.
//
// Prefixing is IDEMPOTENT — a path that already starts with an org id is left
// alone — so it is safe for a helper to prefix and for the wrapper to prefix
// again, and safe on paths read back out of the database, which are already
// stored in full form.

const EXEMPT = new Set(["company-logos", "app-downloads"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Methods whose FIRST argument is a path, and the one that takes a list.
const PATH_FIRST = new Set(["upload", "createSignedUrl", "download", "list", "getPublicUrl", "update"]);
const PATH_PAIR = new Set(["move", "copy"]);   // (from, to)
const PATH_LIST = new Set(["remove", "createSignedUrls"]);

// Generic passthrough: returning `any` here would erase the Supabase client's
// types for every caller, which showed up as a wave of implicit-any errors
// across unrelated files.
export function installOrgScopedStorage<T>(supabase: T): T {
  const client = supabase as any;
  if (!client?.storage || client.storage.__orgScoped) return supabase;

  let orgPromise: Promise<string | null> | null = null;
  const orgId = (): Promise<string | null> => {
    if (!orgPromise) {
      orgPromise = (async () => {
        const { data: { user } } = await client.auth.getUser();
        if (!user) return null;
        const { data } = await client.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
        return data?.org_id ?? null;
      })().catch(() => null);
    }
    return orgPromise;
  };
  // A different person signing in must not inherit the last one's org.
  client.auth.onAuthStateChange(() => { orgPromise = null; });

  const prefix = async (p: any) => {
    if (typeof p !== "string" || !p) return p;
    const clean = p.replace(/^\/+/, "");
    if (UUID_RE.test(clean.split("/")[0])) return clean;
    const org = await orgId();
    return org ? `${org}/${clean}` : clean;
  };

  const realFrom = client.storage.from.bind(client.storage);
  client.storage.from = (bucket: string) => {
    const api = realFrom(bucket);
    if (EXEMPT.has(bucket)) return api;
    return new Proxy(api, {
      get(target: any, key: any, recv: any) {
        const value = Reflect.get(target, key, recv);
        if (typeof value !== "function") return value;
        const name = String(key);

        // getPublicUrl is synchronous and cannot await the org. It is also the
        // thing this whole change exists to stop using, so leave it alone rather
        // than return a half-right url.
        if (name === "getPublicUrl") return value.bind(target);

        if (PATH_FIRST.has(name)) {
          return async (p: any, ...rest: any[]) => value.call(target, await prefix(p), ...rest);
        }
        if (PATH_PAIR.has(name)) {
          return async (a: any, b2: any, ...rest: any[]) => value.call(target, await prefix(a), await prefix(b2), ...rest);
        }
        if (PATH_LIST.has(name)) {
          return async (paths: any[], ...rest: any[]) =>
            value.call(target, await Promise.all((paths || []).map(prefix)), ...rest);
        }
        return value.bind(target);
      },
    });
  };
  client.storage.__orgScoped = true;
  return supabase;
}
