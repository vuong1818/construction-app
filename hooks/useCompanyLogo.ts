import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useCompanyLogo() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function loadLogo() {
      try {
        const { data, error } = await supabase
          .from('company_settings')
          .select('logo_url')
          .order('id', { ascending: true })
          .limit(1)
          .maybeSingle()

        if (!mounted) return

        if (error) {
          setLogoUrl(null)
        } else {
          setLogoUrl(data?.logo_url || null)
        }
      } catch {
        if (mounted) {
          setLogoUrl(null)
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
    loading,
  }
}