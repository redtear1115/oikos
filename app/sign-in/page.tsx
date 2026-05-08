import { getLocale, getTranslations } from '@/lib/i18n/t'
import { LanguageSwitcher } from '@/lib/i18n/LanguageSwitcher'
import { SignInButton } from './SignInButton'

export default async function SignInPage() {
  const [locale, t] = await Promise.all([getLocale(), getTranslations()])

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-between px-6 py-12"
      style={{ background: 'var(--bg)' }}
    >
      <div className="flex-1" />

      <div className="flex flex-col items-center text-center gap-3">
        <div
          className="text-amount-md leading-none tracking-[-1px]"
          style={{ fontFamily: 'var(--font-fraunces)', color: 'var(--ink)', fontWeight: 500 }}
        >
          Futari
        </div>
        <div className="text-sm tracking-[3px]" style={{ color: 'var(--ink-2)' }}>
          ふたり
        </div>
        <p
          className="mt-6 text-base leading-relaxed"
          style={{ color: 'var(--ink-2)', maxWidth: 280 }}
        >
          {t.signIn.tagline}
        </p>
      </div>

      <div className="w-full max-w-sm flex flex-col items-center gap-4 mt-12">
        <SignInButton label={t.signIn.continueWithGoogle} />
        <p className="text-xs text-center" style={{ color: 'var(--ink-3)' }}>
          {t.signIn.termsPrefix}{' '}
          <a href="/terms" className="underline">{t.signIn.termsLink}</a>
          {' '}{t.signIn.termsAnd}{' '}
          <a href="/privacy" className="underline">{t.signIn.privacyLink}</a>
          {t.signIn.termsSuffix}
        </p>
      </div>

      <div className="flex-1" />

      <LanguageSwitcher current={locale} variant="footer" />
    </main>
  )
}
