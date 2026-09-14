// lib/migrate/sources.ts
// Central source of truth for /migrate/<source> page competitor data (#852).
//
// Comparison table text is split in two (#1185): verdict-only labels (✓ 支援 /
// ✕ 無 …) stay as Chinese literals here; labels that carry a condition or a
// specific claim are `{ i18n: key }` references into `migrate.comparisonText`
// in the four locale files. The rule and the reasoning live in
// docs/superpowers/specs/migrate-pages-design.md — not restated here, so there
// is only one copy to keep true.

export type CellTone = 'yes' | 'partial' | 'no'

/** Keys of `migrate.comparisonText` in every locale file. The locale type is
 *  `Record<ComparisonTextKey, string>`, so a key used here but missing from a
 *  locale fails `tsc`. */
export type ComparisonTextKey =
  | 'interfaceLanguage'
  | 'fourLanguages'
  | 'notStated'
  | 'basicHalfSplit'
  | 'updatesSlowed'
  | 'paidUnlock'
  | 'paidPlanOnly'
  | 'basicPlanLimited'
  | 'manualCleanup'
  | 'requiresVip'
  | 'vipUnlock'
  | 'requiresSubscription'
  | 'manualBackup'
  | 'adsOrPaidPlan'
  | 'mostlyEnglish'
  | 'advancedNeedsSubscription'
  | 'sharingSetupRequired'
  | 'premiumOnly'
  | 'someFeaturesPaid'
  | 'viewOnly'
  | 'dependsOnVersion'
  | 'advancedSubscription'
  | 'vipOnly'
  | 'dependsOnAccount'
  | 'inAppPurchases'
  | 'subscriptionOnly'
  | 'mostlyLocal'
  | 'advancedPaid'
  | 'partialExport'
  | 'iosOnly'
  | 'freePlanFourPerDay'
  | 'conversionNeedsPro'
  | 'sharedLedgerSetupRequired'
  | 'adsOrMembership'
  | 'requiresMembership'

/** A literal (untranslated, verdict-only) string or a locale-dictionary key. */
export type ComparisonText = string | { i18n: ComparisonTextKey }

/** `partial` (△) cells must be translated: the glyph alone says "partly", and
 *  the condition after it (e.g. 免費版每日 4 筆) is the whole point of the cell.
 *  Enforced structurally so a new source can't reintroduce a Chinese-only △. */
export type ComparisonCell =
  | { label: ComparisonText; tone: 'yes' | 'no' }
  | { label: { i18n: ComparisonTextKey }; tone: 'partial' }

export type ComparisonRow = {
  feature: ComparisonText
  futari: ComparisonCell
  other:  ComparisonCell
}

export type ResolvedComparisonRow = {
  feature: string
  futari: { label: string; tone: CellTone }
  other:  { label: string; tone: CellTone }
}

/** Swap `{ i18n }` references for the locale's `migrate.comparisonText`
 *  strings. Literals pass through, so zh-TW output is byte-identical to the
 *  pre-#1185 hard-coded table. */
export function resolveComparisonRows(
  rows: readonly ComparisonRow[],
  text: Record<ComparisonTextKey, string>,
): ResolvedComparisonRow[] {
  const r = (v: ComparisonText) => (typeof v === 'string' ? v : text[v.i18n])
  return rows.map((row) => ({
    feature: r(row.feature),
    futari: { label: r(row.futari.label), tone: row.futari.tone },
    other: { label: r(row.other.label), tone: row.other.tone },
  }))
}

export type SourceDef = {
  slug: string
  name: string
  /** Content last-changed date (YYYY-MM-DD) for sitemap lastmod. Bump this
   *  when this source's comparison rows or its i18n copy actually change —
   *  it is the crawl-prioritisation signal, not a build timestamp. (#1004) */
  contentUpdatedAt: string
  /** cwmoney only — renders a download link inside step 2 */
  templateDownload?: { href: string }
  /** Non-CSV-export apps (#839 P2): renders the shared screenshot→ChatGPT→CSV
   *  walkthrough (MigrateChatgptWorkflow) between the steps and the upload tool.
   *  The uploaded file is the ChatGPT output, detected as `futari_generic`. */
  screenshotWorkflow?: boolean
  comparison: { rows: ComparisonRow[] }
}

export const MIGRATE_SOURCES = {
  honeydue: {
    slug: 'honeydue',
    name: 'Honeydue',
    contentUpdatedAt: '2026-09-15',
    comparison: {
      rows: [
        { feature: '雙人共同帳本',   futari: { label: '✓ 支援',      tone: 'yes'     }, other: { label: '✓ 支援',      tone: 'yes'     } },
        { feature: '費用分攤模式',   futari: { label: '✓ 多種模式',  tone: 'yes'     }, other: { label: { i18n: 'basicHalfSplit' },  tone: 'partial' } },
        { feature: '持續維護更新',   futari: { label: '✓ 每兩週發版', tone: 'yes'    }, other: { label: { i18n: 'updatesSlowed' },  tone: 'partial' } },
        { feature: '多幣別記帳',     futari: { label: '✓ 支援',      tone: 'yes'     }, other: { label: '✕ 無',        tone: 'no'      } },
      ],
    },
  },
  spendee: {
    slug: 'spendee',
    name: 'Spendee',
    contentUpdatedAt: '2026-09-15',
    comparison: {
      rows: [
        { feature: '雙人共同帳本', futari: { label: '✓ 免費內建',   tone: 'yes'     }, other: { label: { i18n: 'paidUnlock' },   tone: 'partial' } },
        { feature: '費用分攤模式', futari: { label: '✓ 多種模式',   tone: 'yes'     }, other: { label: '✕ 無原生支援',   tone: 'no'      } },
        { feature: '即時同步',     futari: { label: '✓ 支援',       tone: 'yes'     }, other: { label: { i18n: 'paidPlanOnly' },     tone: 'partial' } },
        { feature: '完全免費',     futari: { label: '✓ 永久',       tone: 'yes'     }, other: { label: { i18n: 'basicPlanLimited' }, tone: 'partial' } },
        { feature: 'CSV 資料匯入', futari: { label: '✓ 直接上傳',   tone: 'yes'     }, other: { label: { i18n: 'manualCleanup' },     tone: 'partial' } },
      ],
    },
  },
  cwmoney: {
    slug: 'cwmoney',
    name: 'CWMoney',
    contentUpdatedAt: '2026-09-15',
    templateDownload: { href: '/cwmoney-template.xlsx' },
    comparison: {
      rows: [
        { feature: '雙人共同帳本', futari: { label: '✓ 預設模式', tone: 'yes'     }, other: { label: { i18n: 'requiresVip' },   tone: 'partial' } },
        { feature: '費用分攤模式', futari: { label: '✓ 多種模式', tone: 'yes'     }, other: { label: '✕ 無',       tone: 'no'      } },
        { feature: '多幣別記帳',   futari: { label: '✓ 支援',     tone: 'yes'     }, other: { label: '✓ 支援',     tone: 'yes'     } },
        { feature: '完全免費',     futari: { label: '✓ 永久',     tone: 'yes'     }, other: { label: { i18n: 'vipUnlock' }, tone: 'partial' } },
        { feature: '即時雲端同步', futari: { label: '✓ 即時',     tone: 'yes'     }, other: { label: { i18n: 'requiresVip' },   tone: 'partial' } },
      ],
    },
  },
  moneybook: {
    slug: 'moneybook',
    name: 'Moneybook',
    contentUpdatedAt: '2026-09-15',
    comparison: {
      rows: [
        { feature: '雙人共同帳本',   futari: { label: '✓ 預設模式', tone: 'yes'     }, other: { label: '✕ 單人設計',   tone: 'no'      } },
        { feature: '費用分攤模式',   futari: { label: '✓ 多種模式', tone: 'yes'     }, other: { label: '✕ 無',         tone: 'no'      } },
        { feature: 'CSV 資料匯出',   futari: { label: '✓ 免費',     tone: 'yes'     }, other: { label: { i18n: 'requiresSubscription' },     tone: 'partial' } },
        { feature: '完全免費',       futari: { label: '✓ 永久',     tone: 'yes'     }, other: { label: '✕ 訂閱制',     tone: 'no'      } },
      ],
    },
  },
  andromoney: {
    slug: 'andromoney',
    name: 'AndroMoney',
    contentUpdatedAt: '2026-09-15',
    comparison: {
      rows: [
        { feature: '雙人共同帳本', futari: { label: '✓ 預設模式', tone: 'yes'     }, other: { label: '✕ 單人設計',       tone: 'no'      } },
        { feature: '費用分攤模式', futari: { label: '✓ 多種模式', tone: 'yes'     }, other: { label: '✕ 無',             tone: 'no'      } },
        { feature: '即時雲端同步', futari: { label: '✓ 即時',     tone: 'yes'     }, other: { label: { i18n: 'manualBackup' },     tone: 'partial' } },
        { feature: '多幣別記帳',   futari: { label: '✓ 支援',     tone: 'yes'     }, other: { label: '✓ 支援',           tone: 'yes'     } },
        { feature: '完全免費',     futari: { label: '✓ 永久',     tone: 'yes'     }, other: { label: { i18n: 'adsOrPaidPlan' }, tone: 'partial' } },
      ],
    },
  },
  mobills: {
    slug: 'mobills',
    name: 'Mobills',
    contentUpdatedAt: '2026-09-15',
    comparison: {
      rows: [
        { feature: '雙人共同帳本', futari: { label: '✓ 預設模式',  tone: 'yes'     }, other: { label: '✕ 單人設計',   tone: 'no'      } },
        { feature: '費用分攤模式', futari: { label: '✓ 多種模式',  tone: 'yes'     }, other: { label: '✕ 無',         tone: 'no'      } },
        { feature: { i18n: 'interfaceLanguage' },     futari: { label: { i18n: 'fourLanguages' }, tone: 'yes'    }, other: { label: { i18n: 'mostlyEnglish' }, tone: 'partial' } },
        { feature: '完全免費',     futari: { label: '✓ 永久',      tone: 'yes'     }, other: { label: { i18n: 'advancedNeedsSubscription' }, tone: 'partial' } },
        { feature: 'CSV 資料匯入', futari: { label: '✓ 直接上傳',  tone: 'yes'     }, other: { label: '✓ 可匯出',     tone: 'yes'     } },
      ],
    },
  },
  manebo: {
    slug: 'manebo',
    name: 'Manebo',
    contentUpdatedAt: '2026-09-15',
    comparison: {
      rows: [
        { feature: '雙人共同帳本',   futari: { label: '✓ 預設模式', tone: 'yes'     }, other: { label: { i18n: 'sharingSetupRequired' },      tone: 'partial' } },
        { feature: '費用分攤模式',   futari: { label: '✓ 多種模式', tone: 'yes'     }, other: { label: '✕ 無',              tone: 'no'      } },
        { feature: 'CSV 資料匯出',   futari: { label: '✓ 免費',     tone: 'yes'     }, other: { label: { i18n: 'premiumOnly' },    tone: 'partial' } },
        { feature: '完全免費',       futari: { label: '✓ 永久',     tone: 'yes'     }, other: { label: { i18n: 'someFeaturesPaid' },    tone: 'partial' } },
      ],
    },
  },
  'simple-daily-money': {
    slug: 'simple-daily-money',
    name: '簡單記帳',
    contentUpdatedAt: '2026-09-15',
    screenshotWorkflow: true,
    comparison: {
      rows: [
        { feature: '雙人共同帳本', futari: { label: '✓ 預設模式', tone: 'yes'     }, other: { label: { i18n: 'viewOnly' }, tone: 'partial' } },
        { feature: '費用分攤模式', futari: { label: '✓ 多種模式', tone: 'yes'     }, other: { label: '✕ 無',       tone: 'no'      } },
        { feature: '雲端同步',     futari: { label: '✓ 即時',     tone: 'yes'     }, other: { label: { i18n: 'dependsOnVersion' },   tone: 'partial' } },
        { feature: '完全免費',     futari: { label: '✓ 永久',     tone: 'yes'     }, other: { label: { i18n: 'advancedSubscription' }, tone: 'partial' } },
        { feature: '資料匯出帶走', futari: { label: '✓ CSV 匯出', tone: 'yes'     }, other: { label: { i18n: 'vipOnly' }, tone: 'partial' } },
      ],
    },
  },
  'fortune-city': {
    slug: 'fortune-city',
    name: '記帳城市',
    contentUpdatedAt: '2026-09-15',
    screenshotWorkflow: true,
    comparison: {
      rows: [
        { feature: '雙人共同帳本', futari: { label: '✓ 預設模式', tone: 'yes'     }, other: { label: '✕ 單人設計', tone: 'no'      } },
        { feature: '費用分攤模式', futari: { label: '✓ 多種模式', tone: 'yes'     }, other: { label: '✕ 無',       tone: 'no'      } },
        { feature: '雲端同步',     futari: { label: '✓ 即時',     tone: 'yes'     }, other: { label: { i18n: 'dependsOnAccount' },   tone: 'partial' } },
        { feature: '完全免費',     futari: { label: '✓ 永久',     tone: 'yes'     }, other: { label: { i18n: 'inAppPurchases' },   tone: 'partial' } },
        { feature: '資料匯出帶走', futari: { label: '✓ CSV 匯出', tone: 'yes'     }, other: { label: { i18n: 'subscriptionOnly' }, tone: 'partial' } },
      ],
    },
  },
  cashman: {
    slug: 'cashman',
    name: 'CashMan',
    contentUpdatedAt: '2026-09-15',
    screenshotWorkflow: true,
    comparison: {
      rows: [
        { feature: '雙人共同帳本', futari: { label: '✓ 預設模式', tone: 'yes'     }, other: { label: '✕ 單人設計', tone: 'no'      } },
        { feature: '費用分攤模式', futari: { label: '✓ 多種模式', tone: 'yes'     }, other: { label: '✕ 無',       tone: 'no'      } },
        { feature: '雲端同步',     futari: { label: '✓ 即時',     tone: 'yes'     }, other: { label: { i18n: 'mostlyLocal' }, tone: 'partial' } },
        { feature: '完全免費',     futari: { label: '✓ 永久',     tone: 'yes'     }, other: { label: '✓ 免費',     tone: 'yes'     } },
        { feature: '資料匯出帶走', futari: { label: '✓ CSV 匯出', tone: 'yes'     }, other: { label: '✕ 無匯出',   tone: 'no'      } },
      ],
    },
  },
  '1money': {
    slug: '1money',
    name: '1Money',
    contentUpdatedAt: '2026-09-15',
    screenshotWorkflow: true,
    comparison: {
      rows: [
        { feature: '雙人共同帳本', futari: { label: '✓ 預設模式', tone: 'yes'     }, other: { label: '✕ 單人設計', tone: 'no'      } },
        { feature: '費用分攤模式', futari: { label: '✓ 多種模式', tone: 'yes'     }, other: { label: '✕ 無',       tone: 'no'      } },
        { feature: '多幣別記帳',   futari: { label: '✓ 支援',     tone: 'yes'     }, other: { label: '✓ 支援',     tone: 'yes'     } },
        { feature: '完全免費',     futari: { label: '✓ 永久',     tone: 'yes'     }, other: { label: { i18n: 'advancedPaid' }, tone: 'partial' } },
        { feature: '資料匯出帶走', futari: { label: '✓ CSV 匯出', tone: 'yes'     }, other: { label: { i18n: 'partialExport' }, tone: 'partial' } },
      ],
    },
  },
  icost: {
    slug: 'icost',
    name: 'iCost',
    contentUpdatedAt: '2026-09-15',
    screenshotWorkflow: true,
    comparison: {
      rows: [
        { feature: '雙人共同帳本', futari: { label: '✓ 預設模式',        tone: 'yes'     }, other: { label: '✕ 單人設計',  tone: 'no'      } },
        { feature: '費用分攤模式', futari: { label: '✓ 多種模式',        tone: 'yes'     }, other: { label: '✕ 無',        tone: 'no'      } },
        { feature: '跨平台',       futari: { label: '✓ iOS／Android／Web', tone: 'yes'   }, other: { label: { i18n: 'iosOnly' },  tone: 'partial' } },
        { feature: '完全免費',     futari: { label: '✓ 永久',            tone: 'yes'     }, other: { label: { i18n: 'inAppPurchases' },    tone: 'partial' } },
        { feature: '資料匯出帶走', futari: { label: '✓ CSV 匯出',        tone: 'yes'     }, other: { label: '✕ 無匯出',    tone: 'no'      } },
      ],
    },
  },
  splitwise: {
    slug: 'splitwise',
    name: 'Splitwise',
    contentUpdatedAt: '2026-09-15',
    // No screenshotWorkflow: Splitwise exports a spreadsheet per group /
    // friendship (kb.splitwise.com "How can I double check my balances?"),
    // so users arrive holding a real CSV. Headers don't match any dedicated
    // sniff signature, so the file routes to the generic mapping wizard.
    comparison: {
      rows: [
        { feature: '雙人共同帳本',   futari: { label: '✓ 預設模式',   tone: 'yes'     }, other: { label: '✓ 群組支援',      tone: 'yes'     } },
        { feature: '費用分攤模式',   futari: { label: '✓ 多種模式',   tone: 'yes'     }, other: { label: '✓ 多種模式',      tone: 'yes'     } },
        { feature: '每日記帳筆數',   futari: { label: '✓ 不限',       tone: 'yes'     }, other: { label: { i18n: 'freePlanFourPerDay' }, tone: 'partial' } },
        { feature: '多幣別記帳',     futari: { label: '✓ 內建換算',   tone: 'yes'     }, other: { label: { i18n: 'conversionNeedsPro' },    tone: 'partial' } },
        { feature: '資料匯出帶走',   futari: { label: '✓ CSV 匯出',   tone: 'yes'     }, other: { label: '✓ 試算表匯出',    tone: 'yes'     } },
      ],
    },
  },
  suishouji: {
    slug: 'suishouji',
    name: '隨手記',
    contentUpdatedAt: '2026-09-15',
    screenshotWorkflow: true,
    comparison: {
      rows: [
        { feature: '雙人共同帳本', futari: { label: '✓ 預設模式', tone: 'yes'     }, other: { label: { i18n: 'sharedLedgerSetupRequired' }, tone: 'partial' } },
        { feature: '費用分攤模式', futari: { label: '✓ 多種模式', tone: 'yes'     }, other: { label: '✕ 無',           tone: 'no'      } },
        { feature: '多幣別記帳',   futari: { label: '✓ 支援',     tone: 'yes'     }, other: { label: '✓ 支援',         tone: 'yes'     } },
        { feature: '完全免費',     futari: { label: '✓ 永久',     tone: 'yes'     }, other: { label: { i18n: 'adsOrMembership' }, tone: 'partial' } },
        { feature: '資料匯出帶走', futari: { label: '✓ CSV 匯出', tone: 'yes'     }, other: { label: { i18n: 'requiresMembership' },       tone: 'partial' } },
      ],
    },
  },
} satisfies Record<string, SourceDef>

/**
 * The registry keys, and the authority for "which /migrate pages exist".
 * Pages, sitemap, i18n `Record<MigrateSlug, …>` and the analytics
 * `entry_source` axis (`lib/analytics/attribution.ts`) all derive from it —
 * adding a source here is enough. No hand-written copy of the slug list lives
 * anywhere: the one that used to sit in this comment went stale at 8 of 15.
 */
export type MigrateSlug = keyof typeof MIGRATE_SOURCES
