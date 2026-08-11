import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import api from '@/services/api'
import { withBase } from '@/utils/basePath'

const DEFAULT_APP_NAME = 'MyGarage'

interface BrandingContextType {
  appName: string
  logoUrl: string | null
  faviconUrl: string | null
  loading: boolean
  refreshBranding: () => Promise<void>
  bumpAssetVersion: () => void
}

const BrandingContext = createContext<BrandingContextType | undefined>(undefined)

function settingMap(settings: Array<{ key: string; value?: string | null }>): Record<string, string> {
  const map: Record<string, string> = {}
  for (const s of settings) {
    if (s.value != null) map[s.key] = s.value
  }
  return map
}

function applyDocumentChrome(appName: string, faviconUrl: string | null) {
  document.title = appName

  const existing = document.querySelector<HTMLLinkElement>("link[rel='icon'][data-branding='1']")
  if (faviconUrl) {
    const link = existing ?? document.createElement('link')
    link.rel = 'icon'
    link.setAttribute('data-branding', '1')
    link.href = faviconUrl
    if (!existing) {
      document.head.appendChild(link)
    }
  } else if (existing) {
    existing.remove()
  }
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [appName, setAppName] = useState(DEFAULT_APP_NAME)
  const [hasLogo, setHasLogo] = useState(false)
  const [hasFavicon, setHasFavicon] = useState(false)
  const [assetVersion, setAssetVersion] = useState(() => Date.now())
  const [loading, setLoading] = useState(true)

  const refreshBranding = useCallback(async () => {
    try {
      const response = await api.get('/settings/public')
      const map = settingMap(response.data?.settings ?? [])
      const name = (map.app_name || DEFAULT_APP_NAME).trim() || DEFAULT_APP_NAME
      setAppName(name)
      setHasLogo(map.custom_logo === 'true')
      setHasFavicon(map.custom_favicon === 'true')
    } catch {
      setAppName(DEFAULT_APP_NAME)
      setHasLogo(false)
      setHasFavicon(false)
    } finally {
      setLoading(false)
    }
  }, [])

  const bumpAssetVersion = useCallback(() => {
    setAssetVersion(Date.now())
  }, [])

  useEffect(() => {
    void refreshBranding()
  }, [refreshBranding])

  const logoUrl = useMemo(
    () => (hasLogo ? `${withBase('/api/branding/logo')}?v=${assetVersion}` : null),
    [hasLogo, assetVersion],
  )
  const faviconUrl = useMemo(
    () => (hasFavicon ? `${withBase('/api/branding/favicon')}?v=${assetVersion}` : null),
    [hasFavicon, assetVersion],
  )

  useEffect(() => {
    if (!loading) {
      applyDocumentChrome(appName, faviconUrl)
    }
  }, [appName, faviconUrl, loading])

  const value = useMemo(
    () => ({
      appName,
      logoUrl,
      faviconUrl,
      loading,
      refreshBranding,
      bumpAssetVersion,
    }),
    [appName, logoUrl, faviconUrl, loading, refreshBranding, bumpAssetVersion],
  )

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>
}

export function useBranding(): BrandingContextType {
  const ctx = useContext(BrandingContext)
  if (!ctx) {
    throw new Error('useBranding must be used within a BrandingProvider')
  }
  return ctx
}
