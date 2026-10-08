import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SUPPORTED_LOCALES, isLocale, type Locale } from '@/lib/i18n/locales-meta'
import { dictionaries } from '@/lib/i18n/t'
import { buildAlternates, ogLocale, alternateOgLocales, ogImage } from '@/lib/i18n/seo'
import { localizedHref } from '@/lib/i18n/path'
import type { UseCaseSlug } from '@/lib/use-case/cases'
import { BrandBreadcrumb } from '../../_components/BrandBreadcrumb'
import { LampLinkRow } from '../../_components/LampLinkRow'
import { Ember } from '../../_components/Ember'
import { Phrase } from '../../_components/Phrase'
import { s } from '../../_components/brand-inner'
import { UseCaseHero } from '../../use-case/_components/UseCaseHero'
import { FEATURE_OUTING_CSS, f } from './_components/feature-outing-css'
import { FeatureOutingCta } from './_components/FeatureOutingCta'
import { FeatureOutingJsonLd } from './_components/FeatureOutingJsonLd'
import { OutingWalkthrough } from './_components/OutingWalkthrough'
import { Reveal } from './_components/Reveal'
import { BirthdayArt, CampingArt, CouplesArt, HeroMotif, LatecomerArt } from './_components/Illustrations'
import { OUTING_MOCK, deriveOutingMock, formatMockAmount } from './_components/mock'

type Params = Promise<{ locale: string }>

const PATH = '/features/outing'
const CROSS_LINKS: readonly UseCaseSlug[] = ['travel', 'aa-split']

// One static HTML per locale. zh-TW is the unprefixed locale, so its URL is
// /features/outing; the proxy rewrites it to /zh-TW/features/outing.
export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale: rawLocale } = await params
  if (!isLocale(rawLocale)) return {}
  const locale: Locale = rawLocale
  const t = dictionaries[locale].seo.featureOuting
  return {
    title: t.title,
    description: t.description,
    alternates: buildAlternates(PATH, locale),
    openGraph: {
      title: t.title,
      description: t.ogDescription,
      url: localizedHref(PATH, locale),
      siteName: dictionaries[locale].landing.jsonLdAppName,
      type: 'website',
      locale: ogLocale(locale),
      alternateLocale: alternateOgLocales(locale),
      images: [{ url: ogImage(locale), width: 1200, height: 630, alt: t.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: t.title,
      description: t.ogDescription,
      images: [ogImage(locale)],
    },
  }
}

export default async function FeatureOutingPage({ params }: { params: Params }) {
  const { locale: rawLocale } = await params
  if (!isLocale(rawLocale)) notFound()
  const locale = rawLocale as Locale
  const dict = dictionaries[locale]
  const t = dict.featureOuting

  // The walkthrough's example, run through the product's own split / settle
  // functions (see mock.ts). No fold amount appears anywhere on this page (#1634).
  const def = OUTING_MOCK[locale]
  const { transfers } = deriveOutingMock(def)
  const name = (id: string) => def.names[id]
  const money = (n: number) => formatMockAmount(def, n)

  const scenarioArt = [<CampingArt key="a" />, <BirthdayArt key="b" />, <CouplesArt key="c" />, <LatecomerArt key="d" />]
  const h2 = `${s.h2} m-0 text-xl md:text-title font-medium`

  return (
    <div className={s.flow}>
      <style dangerouslySetInnerHTML={{ __html: FEATURE_OUTING_CSS }} />
      <FeatureOutingJsonLd locale={locale} t={t} homeName="Futari" />

      <div className={s.hero}>
        <BrandBreadcrumb
          label={dict.brand.breadcrumbLabel}
          crumbs={[
            { label: 'Futari', href: localizedHref('/', locale) },
            { label: t.breadcrumbLabel },
          ]}
        />
        <UseCaseHero kicker={t.heroKicker} title={t.heroTitle} subtitle={t.heroSubtitle} />
        <div className={`${f.ctaRow} mt-6`}>
          <FeatureOutingCta locale={locale} label={t.ctaLabel} location="feature_primary" />
          <a href="#how" className="inline-flex items-center min-h-11 text-sm underline text-ink-2">
            {t.howLink}
          </a>
        </div>
        <HeroMotif />
      </div>

      <section id="how" className={s.band}>
        <h2 className={h2}>
          <Phrase text={t.howHeading} />
        </h2>
        <OutingWalkthrough
          copy={{
            steps: t.steps,
            stepsLabel: t.walkthrough.stepsLabel,
            pause: t.walkthrough.pause,
            play: t.walkthrough.play,
            mock: {
              nameFieldLabel: t.mock.nameFieldLabel,
              createLabel: dict.outingList.addCta,
              chatMessage: t.mock.chatMessage,
              linkChip: t.mock.linkChip,
              whoAreYou: dict.outingPublic.whoAreYou,
              claimed: t.mock.claimed,
              expensesTitle: t.mock.expensesTitle,
              splitEvenly: t.mock.splitEvenly,
              settleTitle: t.mock.settleTitle,
            },
          }}
          data={{
            outingName: def.outingName,
            people: def.participantIds.map((id) => ({
              id,
              name: name(id),
              member: (def.members as readonly string[]).includes(id),
            })),
            expenses: def.expenses.map((e) => ({
              id: e.id,
              label: e.label,
              paidBy: t.mock.paidBy.replace('{name}', name(e.paidBy)),
              amount: money(e.amount),
            })),
            transfers: transfers.map((tr, i) => ({
              id: String(i),
              from: name(tr.from),
              to: name(tr.to),
              amount: money(tr.amount),
            })),
          }}
        />
      </section>

      <section className={s.band}>
        <h2 className={h2}>
          <Phrase text={t.scenariosHeading} />
        </h2>
        <ul className={f.cards}>
          {t.scenarios.map((sc, i) => (
            <li key={sc.title}>
              <Reveal>
                <div className={f.card}>
                  {scenarioArt[i]}
                  <h3 className="m-0 text-base font-medium text-ink">
                    {sc.title}
                  </h3>
                  <p className="m-0 text-sm leading-[1.7] text-ink-2">
                    {sc.body}
                  </p>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </section>

      <section className={s.band}>
        <h2 className={h2}>
          <Phrase text={t.foldHeading} />
        </h2>
        <div className="flex flex-col gap-6">
          <p className="m-0 text-base leading-[1.7] text-ink-2">
            {t.foldBody}
          </p>
          {/* Number-free on purpose (#1634): the outing closes, one settlement goes home. */}
          <Reveal>
            <div className={f.foldRow} aria-hidden="true">
              <div className={f.fold}>
                <div className={f.fcard}>
                  <p className="text-sm font-medium">{def.outingName}</p>
                  <span className={`${f.fTag} text-xs`}>{dict.outingList.endedTag}</span>
                </div>
                <div className={f.fcard}>
                  <p className="text-sm font-medium">{t.fold.ledger}</p>
                </div>
              </div>
              <span className={`${f.chip} ${f.fChip} text-xs`}>{t.fold.chip}</span>
            </div>
          </Reveal>
        </div>
      </section>

      <section id="for-friends" className={s.band}>
        <h2 className={h2}>
          <Phrase text={t.friendsHeading} />
        </h2>
        <ul className={`${f.friends} text-base`}>
          {t.friends.map((line) => (
            <li key={line}>
              <Ember />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={s.band}>
        <h2 className={h2}>
          <Phrase text={t.faqHeading} />
        </h2>
        <dl className={s.faq}>
          {t.faq.map(({ question, answer }) => (
            <div key={question}>
              <dt className="text-base font-medium">{question}</dt>
              <dd className="text-sm">{answer}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={s.band}>
        <h2 className={h2}>
          <Phrase text={t.closingHeading} />
        </h2>
        <div className="flex flex-col gap-8">
          <div className="text-center md:text-left">
            <FeatureOutingCta locale={locale} label={t.ctaLabel} location="feature_closing" />
          </div>
          <ul className={s.rows}>
            {CROSS_LINKS.map((slug) => (
              <LampLinkRow
                key={slug}
                href={localizedHref(`/use-case/${slug}`, locale)}
                name={dict.useCase.hub.items[slug].name}
                description={dict.useCase.hub.items[slug].description}
                cta={dict.useCase.hub.cardCta}
              />
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}
