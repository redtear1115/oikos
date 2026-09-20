import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'

describe('Avatar — letter fallback (#1328)', () => {
  it('renders the initial when src is null (e.g. avatarHidden masked it server-side)', () => {
    const { container } = render(<Avatar memberRole="a" initial="小" src={null} />)
    expect(screen.getByText('小')).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()
  })

  it('renders the image when a src is provided', () => {
    const { container } = render(<Avatar memberRole="a" initial="小" src="https://example.com/photo.jpg" />)
    // alt="" is deliberate (decorative avatar) — that makes the <img> presentational
    // and unreachable via getByRole('img'), so query the DOM directly.
    expect(container.querySelector('img')).toBeTruthy()
    expect(screen.queryByText('小')).toBeNull()
  })
})
