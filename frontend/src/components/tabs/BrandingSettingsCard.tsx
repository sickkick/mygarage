/**
 * Instance branding controls for Settings → System (admin).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Image as ImageIcon, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/services/api'
import { useBranding } from '@/contexts/BrandingContext'

export default function BrandingSettingsCard() {
  const { t } = useTranslation('settings')
  const { appName, logoUrl, faviconUrl, refreshBranding, bumpAssetVersion } = useBranding()
  const [displayName, setDisplayName] = useState(appName)
  const [savingName, setSavingName] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingFavicon, setUploadingFavicon] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const faviconInputRef = useRef<HTMLInputElement>(null)
  const nameSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editingName = useRef(false)

  useEffect(() => {
    if (!editingName.current) {
      setDisplayName(appName)
    }
  }, [appName])

  const persistName = useCallback(
    async (name: string) => {
      const trimmed = name.trim() || 'MyGarage'
      setSavingName(true)
      try {
        await api.post('/settings/batch', {
          settings: { app_name: trimmed },
        })
        await refreshBranding()
        toast.success(t('branding.nameSaved'))
      } catch {
        toast.error(t('branding.nameError'))
      } finally {
        setSavingName(false)
        editingName.current = false
      }
    },
    [refreshBranding, t],
  )

  const handleNameChange = (value: string) => {
    editingName.current = true
    setDisplayName(value)
    if (nameSaveTimer.current) clearTimeout(nameSaveTimer.current)
    nameSaveTimer.current = setTimeout(() => {
      void persistName(value)
    }, 800)
  }

  const uploadAsset = async (
    kind: 'logo' | 'favicon',
    file: File,
    setBusy: (v: boolean) => void,
  ) => {
    setBusy(true)
    try {
      const form = new FormData()
      form.append('file', file)
      await api.post(`/branding/${kind}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      bumpAssetVersion()
      await refreshBranding()
      toast.success(t(kind === 'logo' ? 'branding.logoUploaded' : 'branding.faviconUploaded'))
    } catch {
      toast.error(t(kind === 'logo' ? 'branding.logoError' : 'branding.faviconError'))
    } finally {
      setBusy(false)
    }
  }

  const removeAsset = async (kind: 'logo' | 'favicon') => {
    try {
      await api.delete(`/branding/${kind}`)
      bumpAssetVersion()
      await refreshBranding()
      toast.success(t(kind === 'logo' ? 'branding.logoRemoved' : 'branding.faviconRemoved'))
    } catch {
      toast.error(t(kind === 'logo' ? 'branding.logoError' : 'branding.faviconError'))
    }
  }

  return (
    <div className="bg-garage-surface rounded-lg border border-garage-border p-6 space-y-6">
      <div className="flex items-start gap-3">
        <ImageIcon className="w-6 h-6 text-primary mt-1" />
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-garage-text mb-2">{t('branding.title')}</h2>
          <p className="text-sm text-garage-text-muted">{t('branding.description')}</p>
        </div>
      </div>

      <div>
        <label htmlFor="branding-app-name" className="block text-sm font-medium text-garage-text mb-2">
          {t('branding.displayName')}
        </label>
        <input
          id="branding-app-name"
          type="text"
          value={displayName}
          onChange={(e) => handleNameChange(e.target.value)}
          onBlur={() => {
            if (nameSaveTimer.current) {
              clearTimeout(nameSaveTimer.current)
              nameSaveTimer.current = null
            }
            if (displayName.trim() !== appName) void persistName(displayName)
            else editingName.current = false
          }}
          className="w-full md:w-96 rounded-lg border border-garage-border bg-garage-bg px-3 py-2 text-garage-text"
          maxLength={64}
          disabled={savingName}
        />
        <p className="mt-2 text-sm text-garage-text-muted">{t('branding.displayNameHelp')}</p>
      </div>

      <AssetUploader
        label={t('branding.logo')}
        help={t('branding.logoHelp')}
        previewUrl={logoUrl}
        accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
        uploading={uploadingLogo}
        inputRef={logoInputRef}
        onPick={() => logoInputRef.current?.click()}
        onFile={(file) => void uploadAsset('logo', file, setUploadingLogo)}
        onRemove={logoUrl ? () => void removeAsset('logo') : undefined}
        removeLabel={t('branding.remove')}
        uploadLabel={t('branding.upload')}
      />

      <AssetUploader
        label={t('branding.favicon')}
        help={t('branding.faviconHelp')}
        previewUrl={faviconUrl}
        accept="image/png,image/jpeg,image/webp,image/x-icon,.png,.jpg,.jpeg,.webp,.ico"
        uploading={uploadingFavicon}
        inputRef={faviconInputRef}
        onPick={() => faviconInputRef.current?.click()}
        onFile={(file) => void uploadAsset('favicon', file, setUploadingFavicon)}
        onRemove={faviconUrl ? () => void removeAsset('favicon') : undefined}
        removeLabel={t('branding.remove')}
        uploadLabel={t('branding.upload')}
      />
    </div>
  )
}

function AssetUploader({
  label,
  help,
  previewUrl,
  accept,
  uploading,
  inputRef,
  onPick,
  onFile,
  onRemove,
  removeLabel,
  uploadLabel,
}: {
  label: string
  help: string
  previewUrl: string | null
  accept: string
  uploading: boolean
  inputRef: React.RefObject<HTMLInputElement | null>
  onPick: () => void
  onFile: (file: File) => void
  onRemove?: () => void
  removeLabel: string
  uploadLabel: string
}) {
  return (
    <div>
      <p className="block text-sm font-medium text-garage-text mb-2">{label}</p>
      <p className="text-sm text-garage-text-muted mb-3">{help}</p>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-garage-border bg-garage-bg overflow-hidden">
          {previewUrl ? (
            <img src={previewUrl} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            <ImageIcon className="w-8 h-8 text-garage-text-muted" />
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onPick}
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {uploadLabel}
          </button>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              disabled={uploading}
              className="inline-flex items-center gap-2 rounded-lg border border-garage-border px-3 py-2 text-sm font-medium text-garage-text disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              {removeLabel}
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) onFile(file)
          }}
        />
      </div>
    </div>
  )
}
