import { Link } from 'react-router-dom'
import { useBranding } from '@/contexts/BrandingContext'

/**
 * Two-tone logo lockup (prototype dc.html:40-45). 30x30 accent-soft tile with an
 * inlined car outline in --accent, plus the wordmark where "My" is accent and
 * "Garage" is --text when using the default product name. Custom branding
 * replaces the mark and uses a single-color wordmark.
 */
export default function Logo() {
  const { appName, logoUrl } = useBranding()
  const isDefaultName = appName === 'MyGarage'

  return (
    <Link to="/" className="flex flex-none items-center gap-2.5">
      <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-(--accent-soft) text-(--accent) overflow-hidden">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="h-full w-full object-contain" />
        ) : (
          <svg
            aria-hidden="true"
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 13l2-5a3 3 0 0 1 3-2h8a3 3 0 0 1 3 2l2 5" />
            <path d="M3 13h18v4a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-1H7v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
            <circle cx="7.5" cy="15.5" r="1" />
            <circle cx="16.5" cy="15.5" r="1" />
          </svg>
        )}
      </span>
      <span className="text-[15.5px] font-bold tracking-[-0.01em] text-text">
        {/* i18n-exempt -- brand / instance display name */}
        {isDefaultName ? (
          <>
            <span className="text-(--accent)">My</span>Garage
          </>
        ) : (
          appName
        )}
      </span>
    </Link>
  )
}
