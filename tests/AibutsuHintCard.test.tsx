import { render, screen, fireEvent } from '@testing-library/react'
import { AibutsuHintCard } from '@/app/(dashboard)/assets/[id]/_components/AibutsuHintCard'

describe('AibutsuHintCard', () => {
  it('renders pet hint items', () => {
    render(<AibutsuHintCard type="pet" onCtaPress={() => {}} />)
    expect(screen.getByText(/飼料/)).toBeInTheDocument()
    expect(screen.getByText(/看診/)).toBeInTheDocument()
    expect(screen.getByText(/年度疫苗/)).toBeInTheDocument()
  })

  it('renders child hint items', () => {
    render(<AibutsuHintCard type="child" onCtaPress={() => {}} />)
    expect(screen.getByText(/尿布奶粉/)).toBeInTheDocument()
    expect(screen.getByText(/學費/)).toBeInTheDocument()
  })

  it('renders plant hint items', () => {
    render(<AibutsuHintCard type="plant" onCtaPress={() => {}} />)
    expect(screen.getByText(/介質/)).toBeInTheDocument()
    expect(screen.getByText(/防蟲/)).toBeInTheDocument()
  })

  it('renders house hint items', () => {
    render(<AibutsuHintCard type="house" onCtaPress={() => {}} />)
    expect(screen.getByText(/房貸/)).toBeInTheDocument()
    expect(screen.getByText(/清潔/)).toBeInTheDocument()
  })

  it('calls onCtaPress when button is clicked', () => {
    const onCtaPress = vi.fn()
    render(<AibutsuHintCard type="pet" onCtaPress={onCtaPress} />)
    fireEvent.click(screen.getByRole('button', { name: /記第一筆/ }))
    expect(onCtaPress).toHaveBeenCalledTimes(1)
  })
})
