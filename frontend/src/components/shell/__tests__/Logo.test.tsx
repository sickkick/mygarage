import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '../../../__tests__/test-utils'
import Logo from '../Logo'

vi.mock('@/contexts/BrandingContext', () => ({
  useBranding: vi.fn(() => ({
    appName: 'MyGarage',
    logoUrl: null,
    faviconUrl: null,
    loading: false,
    refreshBranding: async () => {},
    bumpAssetVersion: () => {},
  })),
}))

import { useBranding } from '@/contexts/BrandingContext'

describe('Logo', () => {
  it('links to / with the MyGarage accessible name', () => {
    render(<Logo />)
    const link = screen.getByRole('link', { name: 'MyGarage' })
    expect(link).toHaveAttribute('href', '/')
  })

  it('renders the two-tone wordmark with an accent "My"', () => {
    render(<Logo />)
    const my = screen.getByText('My')
    expect(my).toHaveClass('text-(--accent)')
  })

  it('hides the brand mark from assistive tech', () => {
    const { container } = render(<Logo />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders a custom display name without the My/Garage split', () => {
    vi.mocked(useBranding).mockReturnValue({
      appName: 'Shaffer Garage',
      logoUrl: '/api/branding/logo?v=1',
      faviconUrl: null,
      loading: false,
      refreshBranding: async () => {},
      bumpAssetVersion: () => {},
    })
    render(<Logo />)
    expect(screen.getByRole('link', { name: 'Shaffer Garage' })).toBeInTheDocument()
    expect(screen.queryByText('My')).not.toBeInTheDocument()
    expect(screen.getByRole('link').querySelector('img')).toHaveAttribute(
      'src',
      '/api/branding/logo?v=1',
    )
  })
})
