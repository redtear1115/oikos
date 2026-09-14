import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'
import { zhTW } from '@/lib/i18n/locales/zh-TW'
import { zhCN } from '@/lib/i18n/locales/zh-CN'
import { en } from '@/lib/i18n/locales/en'
import { ja } from '@/lib/i18n/locales/ja'
import { QuestionCard } from '@/app/(dashboard)/review/[month]/quiz/_components/QuestionCard'
import { QuizClient } from '@/app/(dashboard)/review/[month]/quiz/_components/QuizClient'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/actions/partnerQuiz', () => ({ submitPartnerQuizAnswers: vi.fn() }))

beforeEach(() => { vi.clearAllMocks() })

// #1123 — the quiz answer screen used to render `err.message` verbatim, so the
// solo guard in `submitPartnerQuizAnswers` shipped a hard-coded zh-TW sentence
// to every locale and `quiz.errors.solo` had no render site at all. The action
// now throws a code; the copy comes from the dictionary.
describe('QuestionCard — solo error copy comes from the locale', () => {
  function renderCard() {
    return render(
      <I18nWrapper>
        <QuestionCard sessionId="sess-1" questionKeys={['impulse']} reviewHref="/review/2026-09" />
      </I18nWrapper>,
    )
  }

  async function submitOnce(container: HTMLElement) {
    const choices = container.querySelectorAll('[aria-pressed]')
    fireEvent.click(choices[0])
    fireEvent.click(screen.getByText(zhTW.quiz.answerCtaFinal))
  }

  it('shows quiz.errors.solo — never the raw code the action threw', async () => {
    const { submitPartnerQuizAnswers } = await import('@/actions/partnerQuiz')
    vi.mocked(submitPartnerQuizAnswers).mockRejectedValue(new Error('solo_group'))

    const { container } = renderCard()
    await submitOnce(container)

    const alert = await waitFor(() => screen.getByRole('alert'))
    expect(alert.textContent).toBe(zhTW.quiz.errors.solo)
    expect(alert.textContent).not.toContain('solo_group')
    // The framing #1123 removed must not come back through the error path.
    expect(alert.textContent).not.toContain('還沒辦法')
  })

  it('falls back to quiz.errors.submitFailed for an unmapped failure', async () => {
    const { submitPartnerQuizAnswers } = await import('@/actions/partnerQuiz')
    vi.mocked(submitPartnerQuizAnswers).mockRejectedValue('not an Error')

    const { container } = renderCard()
    await submitOnce(container)

    const alert = await waitFor(() => screen.getByRole('alert'))
    expect(alert.textContent).toBe(zhTW.quiz.errors.submitFailed)
  })

  // #1140 — the other four rejections were still prose. `already_answered` is
  // the one a real user hits (two devices, or two tabs, submitting the same
  // final question), so it gets the render-level proof that the code reaches
  // the dictionary instead of the screen. Per-locale resolution is covered in
  // `quiz-errors.test.ts`; this harness only has zh-TW.
  it('shows quiz.errors.alreadyAnswered for the already_answered code', async () => {
    const { submitPartnerQuizAnswers } = await import('@/actions/partnerQuiz')
    vi.mocked(submitPartnerQuizAnswers).mockRejectedValue(new Error('already_answered'))

    const { container } = renderCard()
    await submitOnce(container)

    const alert = await waitFor(() => screen.getByRole('alert'))
    expect(alert.textContent).toBe(zhTW.quiz.errors.alreadyAnswered)
    expect(alert.textContent).not.toContain('already_answered')
  })

  it('shows quiz.errorNotFound / quiz.errors.wrongGroup for the tamper codes', async () => {
    const { submitPartnerQuizAnswers } = await import('@/actions/partnerQuiz')

    for (const [code, expected] of [
      ['session_not_found', zhTW.quiz.errorNotFound],
      ['wrong_group', zhTW.quiz.errors.wrongGroup],
      ['already_revealed', zhTW.quiz.errors.alreadyRevealed],
    ] as const) {
      vi.mocked(submitPartnerQuizAnswers).mockRejectedValue(new Error(code))
      const { container, unmount } = renderCard()
      await submitOnce(container)

      const alert = await waitFor(() => screen.getByRole('alert'))
      expect(alert.textContent, code).toBe(expected)
      expect(alert.textContent, code).not.toContain(code)
      unmount()
    }
  })
})

// #1123 — the solo branch reused `revealHeading` (「你們的理財組合」), a
// second-person plural addressed to someone who is here alone.
describe('QuizClient — solo heading', () => {
  it('uses soloHeading, not the plural revealHeading', () => {
    render(
      <I18nWrapper>
        <QuizClient
          reviewedMonth={{ year: 2026, month: 9 }}
          mode="solo"
          sessionId=""
          questionKeys={[]}
          selfAnsweredKeys={[]}
          revealedAt={null}
          viewer={{ id: 'user-a', displayName: '', avatarUrl: null }}
          partner={null}
          memberAId="user-a"
          memberBId=""
          answers={[]}
        />
      </I18nWrapper>,
    )

    expect(screen.getByRole('heading').textContent).toBe(zhTW.quiz.soloHeading)
    expect(screen.queryByText(zhTW.quiz.revealHeading)).toBeNull()
    expect(screen.getByText(zhTW.quiz.soloFallback)).toBeTruthy()
  })

  it('every locale gives solo its own heading', () => {
    for (const [name, dict] of Object.entries({ 'zh-TW': zhTW, 'zh-CN': zhCN, en, ja })) {
      expect(dict.quiz.soloHeading, name).toBeTruthy()
      expect(dict.quiz.soloHeading, name).not.toBe(dict.quiz.revealHeading)
    }
  })
})
