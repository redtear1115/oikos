import type { Translations } from '@/lib/i18n/locales/zh-TW'
import type { CategoryId } from '@/lib/categories'
import type { AssetType } from '@/lib/assets'
import { CategoryChip } from '@/app/(dashboard)/_components/CategoryChip'
import { AssetIcon } from '@/app/(dashboard)/_components/AssetIcon'
import { FutariMark } from './FutariMark'

// PhonePreview — decorative product mock shown in the desktop hero. Static
// markup; not the real dashboard. Mirrors the real product's visual rhythm
// (BalanceHero / feed / asset chips / FAB) and now borrows the real
// CategoryChip + AssetIcon components so the chips look identical to what
// the live app ships (#832 phase 1). Copy stays locale-aware via the
// `phoneMock*` keys in landing.

type Props = {
  t: Translations['landing']
}

type FeedRow = {
  categoryId: CategoryId
  title: string
  sub: string
  amount: string
}

type AssetChip = {
  type: AssetType
  /** Hue token used for the chip's tinted background + icon stroke color.
   *  Mirrors the per-type --asset-color-* family used in the live app. */
  c: string
}

export function PhonePreview({ t }: Props) {
  const feedRows: FeedRow[] = [
    { categoryId: 'dining',  title: t.phoneMockFeed1Title, sub: t.phoneMockFeed1Sub, amount: '−840' },
    { categoryId: 'housing', title: t.phoneMockFeed2Title, sub: t.phoneMockFeed2Sub, amount: '−1,520' },
    { categoryId: 'health',  title: t.phoneMockFeed3Title, sub: t.phoneMockFeed3Sub, amount: '−2,800' },
  ]
  const assetChips: AssetChip[] = [
    { type: 'house', c: 'var(--asset-color-house)' },
    { type: 'car',   c: 'var(--asset-color-car)' },
    { type: 'child', c: 'var(--asset-color-child)' },
    { type: 'pet',   c: 'var(--asset-color-pet)' },
    { type: 'plant', c: 'var(--asset-color-plant)' },
  ]

  return (
    <div
      className="relative shrink-0"
      style={{
        width: 320,
        height: 640,
        borderRadius: 44,
        background: '#1a1310',
        padding: 12,
        boxShadow:
          '0 50px 80px -30px rgba(58, 36, 25, 0.35), 0 0 0 1px rgba(58, 36, 25, 0.06)',
        transform: 'rotate(2.5deg)',
      }}
    >
      {/* notch */}
      <div
        aria-hidden
        className="absolute z-10"
        style={{
          top: 14,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 100,
          height: 22,
          background: '#1a1310',
          borderRadius: 12,
        }}
      />

      <div
        className="relative w-full h-full overflow-hidden"
        style={{ background: 'var(--bg)', borderRadius: 34 }}
      >
        <div className="pt-11 px-[18px]">
          {/* brand bar */}
          <div className="flex items-center justify-between mb-[22px]">
            <div className="flex items-center gap-1.5">
              <FutariMark size={18} />
              <span
                className="text-meta font-medium"
                style={{ fontFamily: 'var(--font-fraunces)' }}
              >
                Futari
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div
                className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-white text-micro font-medium"
                style={{ background: 'var(--accent)' }}
              >
                M
              </div>
              <div
                className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-white text-micro font-medium"
                style={{ background: 'var(--asset-color-house)' }}
              >
                T
              </div>
            </div>
          </div>

          {/* balance hero */}
          <div className="text-center mb-[18px]">
            <p
              className="m-0 text-mini"
              style={{ color: 'var(--ink-2)', letterSpacing: '2px' }}
            >
              {t.phoneMockBalanceCaption}
            </p>
            <p
              className="m-0 tnum"
              style={{
                fontFamily: '-apple-system, "SF Pro Display", system-ui',
                fontSize: 44,
                fontWeight: 500,
                letterSpacing: '-1.5px',
                color: 'var(--ink)',
              }}
            >
              NT$ 1,240
            </p>
            <p
              className="m-0 mt-1 text-micro"
              style={{ color: 'var(--ink-2)' }}
            >
              {t.phoneMockBalancePeriod}
            </p>
          </div>

          {/* mini feed */}
          <div
            className="rounded-2xl p-3 mb-2.5"
            style={{ background: 'var(--surface)' }}
          >
            {feedRows.map((r, i, arr) => (
              <div
                key={i}
                className="flex items-center gap-2.5 py-2"
                style={{
                  borderBottom:
                    i < arr.length - 1
                      ? '1px solid var(--hairline)'
                      : 'none',
                }}
              >
                <CategoryChip categoryId={r.categoryId} size={28} />
                <div className="flex-1 min-w-0">
                  <p className="m-0 text-caption font-medium">{r.title}</p>
                  <p className="m-0 text-mini" style={{ color: 'var(--ink-2)' }}>
                    {r.sub}
                  </p>
                </div>
                <span
                  className="text-caption tnum"
                  style={{
                    fontFamily: '-apple-system, "SF Pro Display", system-ui',
                    color: 'var(--ink)',
                  }}
                >
                  {r.amount}
                </span>
              </div>
            ))}
          </div>

          {/* asset chips — same tinted-hue family the real dashboard uses
              for asset rails, with the real AssetIcon glyph centered inside. */}
          <div className="flex gap-1.5 mt-2.5">
            {assetChips.map((a) => (
              <div
                key={a.type}
                className="flex-1 h-9 rounded-[11px] flex items-center justify-center"
                style={{
                  background: `color-mix(in srgb, ${a.c} 35%, white)`,
                  color: a.c,
                }}
              >
                <AssetIcon type={a.type} size={20} />
              </div>
            ))}
          </div>
        </div>

        {/* FAB */}
        <div
          aria-hidden
          className="absolute right-[18px] bottom-[18px] w-12 h-12 rounded-full flex items-center justify-center text-white text-2xl font-medium"
          style={{
            background: 'var(--accent)',
            boxShadow: '0 8px 16px -4px rgba(224, 136, 86, 0.5)',
          }}
        >
          +
        </div>
      </div>
    </div>
  )
}
