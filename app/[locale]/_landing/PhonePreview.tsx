import type { Translations } from '@/lib/i18n/locales/zh-TW'
import { FutariMark } from './FutariMark'

// PhonePreview — decorative product mock shown in the desktop hero. Static
// markup; not the real dashboard. Mirrors the real product's visual rhythm
// (BalanceHero / feed / asset chips / FAB) so visitors see what the app
// actually looks like, not a generic illustration. Copy is locale-aware
// (via `phoneMock*` keys in landing) so the mock doesn't sit in Chinese
// when the page itself is rendering in EN/JA. Asset chips stay as emoji —
// universally readable, no translation needed.

type Props = {
  t: Translations['landing']
}

export function PhonePreview({ t }: Props) {
  const feedRows = [
    { c: 'var(--accent)', title: t.phoneMockFeed1Title, sub: t.phoneMockFeed1Sub, amount: '−840' },
    { c: 'var(--asset-color-house)', title: t.phoneMockFeed2Title, sub: t.phoneMockFeed2Sub, amount: '−1,520' },
    { c: 'var(--asset-color-pet)', title: t.phoneMockFeed3Title, sub: t.phoneMockFeed3Sub, amount: '−2,800' },
  ]
  const assetChips = [
    { c: 'var(--asset-color-house)', emoji: '🏠' },
    { c: 'var(--asset-color-car)', emoji: '🚗' },
    { c: 'var(--asset-color-child)', emoji: '👶' },
    { c: 'var(--asset-color-pet)', emoji: '🐾' },
    { c: 'var(--asset-color-plant)', emoji: '🌿' },
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
                className="text-[14px] font-medium"
                style={{ fontFamily: 'var(--font-fraunces)' }}
              >
                Futari
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div
                className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-white text-micro font-semibold"
                style={{ background: 'var(--accent)' }}
              >
                M
              </div>
              <div
                className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-white text-micro font-semibold"
                style={{ background: 'var(--asset-color-house)' }}
              >
                T
              </div>
            </div>
          </div>

          {/* balance hero */}
          <div className="text-center mb-[18px]">
            <p
              className="m-0 text-[10px]"
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
                <div
                  className="w-7 h-7 rounded-[9px] flex items-center justify-center text-micro font-semibold"
                  style={{
                    background: `color-mix(in srgb, ${r.c} 35%, white)`,
                    color: r.c,
                  }}
                >
                  ·
                </div>
                <div className="flex-1 min-w-0">
                  <p className="m-0 text-[12px] font-medium">{r.title}</p>
                  <p className="m-0 text-[10px]" style={{ color: 'var(--ink-2)' }}>
                    {r.sub}
                  </p>
                </div>
                <span
                  className="text-[12px] tnum"
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

          {/* asset chips */}
          <div className="flex gap-1.5 mt-2.5">
            {assetChips.map((a, i) => (
              <div
                key={i}
                className="flex-1 h-9 rounded-[11px] flex items-center justify-center text-body"
                style={{
                  background: `color-mix(in srgb, ${a.c} 35%, white)`,
                  color: a.c,
                }}
              >
                {a.emoji}
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
