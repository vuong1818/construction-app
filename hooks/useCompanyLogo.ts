import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Reads the current user's company branding from company_settings. RLS scopes
// this to the caller's own org, so each tenant sees its own logo + name.
export function useCompanyLogo() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function loadLogo() {
      try {
        const { data, error } = await supabase
          .from('company_settings')
          .select('logo_url, company_name')
          .order('id', { ascending: true })
          .limit(1)
          .maybeSingle()

        if (!mounted) return

        if (error) {
          setLogoUrl(null)
          setCompanyName(null)
        } else {
          setLogoUrl(data?.logo_url || null)
          setCompanyName(data?.company_name || null)
        }
      } catch {
        if (mounted) {
          setLogoUrl(null)
          setCompanyName(null)
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    loadLogo()

    return () => {
      mounted = false
    }
  }, [])

  return {
    logoUrl,
    companyName,
    loading,
  }
}