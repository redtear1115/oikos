// lib/migrate/sources.ts
// Central source of truth for /migrate/<source> page competitor data (#852).
//
// Every comparison-table string — feature names, verdict labels and the
// conditional cells — is an `{ i18n: key }` reference into `migrate.comparisonText`
// in the four locale files, so /en, /ja and /zh-CN render no Traditional Chinese
// (#1538). Withdrawn: the #1185 rule that kept verdict-only labels as Chinese
// literals here. The reasoning, and why it was reversed, are in
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
  | 'featSharedLedger'
  | 'featSplitModes'
  | 'featMaintained'
  | 'featMultiCurrency'
  | 'featRealtimeSync'
  | 'featFree'
  | 'featCsvImport'
  | 'featCsvExport'
  | 'featCloudSync'
  | 'featRealtimeCloudSync'
  | 'featDataExport'
  | 'featCrossPlatform'
  | 'featDailyEntries'
  | 'verdictSupported'
  | 'verdictNone'
  | 'verdictMultipleModes'
  | 'verdictBiweekly'
  | 'verdictFreeBuiltIn'
  | 'verdictNoNativeSupport'
  | 'verdictForever'
  | 'verdictDirectUpload'
  | 'verdictDefaultMode'
  | 'verdictInstant'
  | 'verdictSingleUser'
  | 'verdictSubscriptionModel'
  | 'verdictFree'
  | 'verdictCanExport'
  | 'verdictNoExport'
  | 'verdictGroupSupport'
  | 'verdictUnlimited'
  | 'verdictBuiltInConversion'
  | 'verdictSpreadsheetExport'
  | 'verdictCsvExport'
  | 'verdictPlatforms'

/** A reference into the locale dictionary. There is deliberately no string
 *  form: a literal here is rendered verbatim on every locale, which is how
 *  /en/migrate/* came to show 支援 / 無 / 多種模式 (#1538). `tsc` rejects it, and
 *  `tests/migrate-comparison-i18n.test.tsx` checks the rendered table. */
export type ComparisonText = { i18n: ComparisonTextKey }

/** Labels are plain text; the ✓ / △ / ✕ mark comes from the tone, rendered by
 *  MigrateComparison (#1519). */
export type ComparisonCell = { label: ComparisonText; tone: CellTone }

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
 *  strings. The zh-TW output is byte-identical to the pre-#1538 table. */
export function resolveComparisonRows(
  rows: readonly ComparisonRow[],
  text: Record<ComparisonTextKey, string>,
): ResolvedComparisonRow[] {
  const r = (v: ComparisonText) => text[v.i18n]
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
    contentUpdatedAt: '2026-10-03',
    comparison: {
      rows: [
        { feature: { i18n: 'featSharedLedger' },   futari: { label: { i18n: 'verdictSupported' },      tone: 'yes'     }, other: { label: { i18n: 'verdictSupported' },      tone: 'yes'     } },
        { feature: { i18n: 'featSplitModes' },   futari: { label: { i18n: 'verdictMultipleModes' },  tone: 'yes'     }, other: { label: { i18n: 'basicHalfSplit' },  tone: 'partial' } },
        { feature: { i18n: 'featMaintained' },   futari: { label: { i18n: 'verdictBiweekly' }, tone: 'yes'    }, other: { label: { i18n: 'updatesSlowed' },  tone: 'partial' } },
        { feature: { i18n: 'featMultiCurrency' },     futari: { label: { i18n: 'verdictSupported' },      tone: 'yes'     }, other: { label: { i18n: 'verdictNone' },        tone: 'no'      } },
      ],
    },
  },
  spendee: {
    slug: 'spendee',
    name: 'Spendee',
    contentUpdatedAt: '2026-10-03',
    comparison: {
      rows: [
        { feature: { i18n: 'featSharedLedger' }, futari: { label: { i18n: 'verdictFreeBuiltIn' },   tone: 'yes'     }, other: { label: { i18n: 'paidUnlock' },   tone: 'partial' } },
        { feature: { i18n: 'featSplitModes' }, futari: { label: { i18n: 'verdictMultipleModes' },   tone: 'yes'     }, other: { label: { i18n: 'verdictNoNativeSupport' },   tone: 'no'      } },
        { feature: { i18n: 'featRealtimeSync' },     futari: { label: { i18n: 'verdictSupported' },       tone: 'yes'     }, other: { label: { i18n: 'paidPlanOnly' },     tone: 'partial' } },
        { feature: { i18n: 'featFree' },     futari: { label: { i18n: 'verdictForever' },       tone: 'yes'     }, other: { label: { i18n: 'basicPlanLimited' }, tone: 'partial' } },
        { feature: { i18n: 'featCsvImport' }, futari: { label: { i18n: 'verdictDirectUpload' },   tone: 'yes'     }, other: { label: { i18n: 'manualCleanup' },     tone: 'partial' } },
      ],
    },
  },
  cwmoney: {
    slug: 'cwmoney',
    name: 'CWMoney',
    contentUpdatedAt: '2026-10-03',
    templateDownload: { href: '/cwmoney-template.xlsx' },
    comparison: {
      rows: [
        { feature: { i18n: 'featSharedLedger' }, futari: { label: { i18n: 'verdictDefaultMode' }, tone: 'yes'     }, other: { label: { i18n: 'requiresVip' },   tone: 'partial' } },
        { feature: { i18n: 'featSplitModes' }, futari: { label: { i18n: 'verdictMultipleModes' }, tone: 'yes'     }, other: { label: { i18n: 'verdictNone' },       tone: 'no'      } },
        { feature: { i18n: 'featMultiCurrency' },   futari: { label: { i18n: 'verdictSupported' },     tone: 'yes'     }, other: { label: { i18n: 'verdictSupported' },     tone: 'yes'     } },
        { feature: { i18n: 'featFree' },     futari: { label: { i18n: 'verdictForever' },     tone: 'yes'     }, other: { label: { i18n: 'vipUnlock' }, tone: 'partial' } },
        { feature: { i18n: 'featRealtimeCloudSync' }, futari: { label: { i18n: 'verdictInstant' },     tone: 'yes'     }, other: { label: { i18n: 'requiresVip' },   tone: 'partial' } },
      ],
    },
  },
  moneybook: {
    slug: 'moneybook',
    name: 'Moneybook',
    contentUpdatedAt: '2026-10-03',
    comparison: {
      rows: [
        { feature: { i18n: 'featSharedLedger' },   futari: { label: { i18n: 'verdictDefaultMode' }, tone: 'yes'     }, other: { label: { i18n: 'verdictSingleUser' },   tone: 'no'      } },
        { feature: { i18n: 'featSplitModes' },   futari: { label: { i18n: 'verdictMultipleModes' }, tone: 'yes'     }, other: { label: { i18n: 'verdictNone' },         tone: 'no'      } },
        { feature: { i18n: 'featCsvExport' },   futari: { label: { i18n: 'verdictFree' },     tone: 'yes'     }, other: { label: { i18n: 'requiresSubscription' },     tone: 'partial' } },
        { feature: { i18n: 'featFree' },       futari: { label: { i18n: 'verdictForever' },     tone: 'yes'     }, other: { label: { i18n: 'verdictSubscriptionModel' },     tone: 'no'      } },
      ],
    },
  },
  andromoney: {
    slug: 'andromoney',
    name: 'AndroMoney',
    contentUpdatedAt: '2026-10-03',
    comparison: {
      rows: [
        { feature: { i18n: 'featSharedLedger' }, futari: { label: { i18n: 'verdictDefaultMode' }, tone: 'yes'     }, other: { label: { i18n: 'verdictSingleUser' },       tone: 'no'      } },
        { feature: { i18n: 'featSplitModes' }, futari: { label: { i18n: 'verdictMultipleModes' }, tone: 'yes'     }, other: { label: { i18n: 'verdictNone' },             tone: 'no'      } },
        { feature: { i18n: 'featRealtimeCloudSync' }, futari: { label: { i18n: 'verdictInstant' },     tone: 'yes'     }, other: { label: { i18n: 'manualBackup' },     tone: 'partial' } },
        { feature: { i18n: 'featMultiCurrency' },   futari: { label: { i18n: 'verdictSupported' },     tone: 'yes'     }, other: { label: { i18n: 'verdictSupported' },           tone: 'yes'     } },
        { feature: { i18n: 'featFree' },     futari: { label: { i18n: 'verdictForever' },     tone: 'yes'     }, other: { label: { i18n: 'adsOrPaidPlan' }, tone: 'partial' } },
      ],
    },
  },
  mobills: {
    slug: 'mobills',
    name: 'Mobills',
    contentUpdatedAt: '2026-10-03',
    comparison: {
      rows: [
        { feature: { i18n: 'featSharedLedger' }, futari: { label: { i18n: 'verdictDefaultMode' },  tone: 'yes'     }, other: { label: { i18n: 'verdictSingleUser' },   tone: 'no'      } },
        { feature: { i18n: 'featSplitModes' }, futari: { label: { i18n: 'verdictMultipleModes' },  tone: 'yes'     }, other: { label: { i18n: 'verdictNone' },         tone: 'no'      } },
        { feature: { i18n: 'interfaceLanguage' },     futari: { label: { i18n: 'fourLanguages' }, tone: 'yes'    }, other: { label: { i18n: 'mostlyEnglish' }, tone: 'partial' } },
        { feature: { i18n: 'featFree' },     futari: { label: { i18n: 'verdictForever' },      tone: 'yes'     }, other: { label: { i18n: 'advancedNeedsSubscription' }, tone: 'partial' } },
        { feature: { i18n: 'featCsvImport' }, futari: { label: { i18n: 'verdictDirectUpload' },  tone: 'yes'     }, other: { label: { i18n: 'verdictCanExport' },     tone: 'yes'     } },
      ],
    },
  },
  manebo: {
    slug: 'manebo',
    name: 'Manebo',
    contentUpdatedAt: '2026-10-03',
    comparison: {
      rows: [
        { feature: { i18n: 'featSharedLedger' },   futari: { label: { i18n: 'verdictDefaultMode' }, tone: 'yes'     }, other: { label: { i18n: 'sharingSetupRequired' },      tone: 'partial' } },
        { feature: { i18n: 'featSplitModes' },   futari: { label: { i18n: 'verdictMultipleModes' }, tone: 'yes'     }, other: { label: { i18n: 'verdictNone' },              tone: 'no'      } },
        { feature: { i18n: 'featCsvExport' },   futari: { label: { i18n: 'verdictFree' },     tone: 'yes'     }, other: { label: { i18n: 'premiumOnly' },    tone: 'partial' } },
        { feature: { i18n: 'featFree' },       futari: { label: { i18n: 'verdictForever' },     tone: 'yes'     }, other: { label: { i18n: 'someFeaturesPaid' },    tone: 'partial' } },
      ],
    },
  },
  'simple-daily-money': {
    slug: 'simple-daily-money',
    name: '簡單記帳',
    contentUpdatedAt: '2026-10-03',
    screenshotWorkflow: true,
    comparison: {
      rows: [
        { feature: { i18n: 'featSharedLedger' }, futari: { label: { i18n: 'verdictDefaultMode' }, tone: 'yes'     }, other: { label: { i18n: 'viewOnly' }, tone: 'partial' } },
        { feature: { i18n: 'featSplitModes' }, futari: { label: { i18n: 'verdictMultipleModes' }, tone: 'yes'     }, other: { label: { i18n: 'verdictNone' },       tone: 'no'      } },
        { feature: { i18n: 'featCloudSync' },     futari: { label: { i18n: 'verdictInstant' },     tone: 'yes'     }, other: { label: { i18n: 'dependsOnVersion' },   tone: 'partial' } },
        { feature: { i18n: 'featFree' },     futari: { label: { i18n: 'verdictForever' },     tone: 'yes'     }, other: { label: { i18n: 'advancedSubscription' }, tone: 'partial' } },
        { feature: { i18n: 'featDataExport' }, futari: { label: { i18n: 'verdictCsvExport' }, tone: 'yes'     }, other: { label: { i18n: 'vipOnly' }, tone: 'partial' } },
      ],
    },
  },
  'fortune-city': {
    slug: 'fortune-city',
    name: '記帳城市',
    contentUpdatedAt: '2026-10-03',
    screenshotWorkflow: true,
    comparison: {
      rows: [
        { feature: { i18n: 'featSharedLedger' }, futari: { label: { i18n: 'verdictDefaultMode' }, tone: 'yes'     }, other: { label: { i18n: 'verdictSingleUser' }, tone: 'no'      } },
        { feature: { i18n: 'featSplitModes' }, futari: { label: { i18n: 'verdictMultipleModes' }, tone: 'yes'     }, other: { label: { i18n: 'verdictNone' },       tone: 'no'      } },
        { feature: { i18n: 'featCloudSync' },     futari: { label: { i18n: 'verdictInstant' },     tone: 'yes'     }, other: { label: { i18n: 'dependsOnAccount' },   tone: 'partial' } },
        { feature: { i18n: 'featFree' },     futari: { label: { i18n: 'verdictForever' },     tone: 'yes'     }, other: { label: { i18n: 'inAppPurchases' },   tone: 'partial' } },
        { feature: { i18n: 'featDataExport' }, futari: { label: { i18n: 'verdictCsvExport' }, tone: 'yes'     }, other: { label: { i18n: 'subscriptionOnly' }, tone: 'partial' } },
      ],
    },
  },
  cashman: {
    slug: 'cashman',
    name: 'CashMan',
    contentUpdatedAt: '2026-10-03',
    screenshotWorkflow: true,
    comparison: {
      rows: [
        { feature: { i18n: 'featSharedLedger' }, futari: { label: { i18n: 'verdictDefaultMode' }, tone: 'yes'     }, other: { label: { i18n: 'verdictSingleUser' }, tone: 'no'      } },
        { feature: { i18n: 'featSplitModes' }, futari: { label: { i18n: 'verdictMultipleModes' }, tone: 'yes'     }, other: { label: { i18n: 'verdictNone' },       tone: 'no'      } },
        { feature: { i18n: 'featCloudSync' },     futari: { label: { i18n: 'verdictInstant' },     tone: 'yes'     }, other: { label: { i18n: 'mostlyLocal' }, tone: 'partial' } },
        { feature: { i18n: 'featFree' },     futari: { label: { i18n: 'verdictForever' },     tone: 'yes'     }, other: { label: { i18n: 'verdictFree' },     tone: 'yes'     } },
        { feature: { i18n: 'featDataExport' }, futari: { label: { i18n: 'verdictCsvExport' }, tone: 'yes'     }, other: { label: { i18n: 'verdictNoExport' },   tone: 'no'      } },
      ],
    },
  },
  '1money': {
    slug: '1money',
    name: '1Money',
    contentUpdatedAt: '2026-10-03',
    screenshotWorkflow: true,
    comparison: {
      rows: [
        { feature: { i18n: 'featSharedLedger' }, futari: { label: { i18n: 'verdictDefaultMode' }, tone: 'yes'     }, other: { label: { i18n: 'verdictSingleUser' }, tone: 'no'      } },
        { feature: { i18n: 'featSplitModes' }, futari: { label: { i18n: 'verdictMultipleModes' }, tone: 'yes'     }, other: { label: { i18n: 'verdictNone' },       tone: 'no'      } },
        { feature: { i18n: 'featMultiCurrency' },   futari: { label: { i18n: 'verdictSupported' },     tone: 'yes'     }, other: { label: { i18n: 'verdictSupported' },     tone: 'yes'     } },
        { feature: { i18n: 'featFree' },     futari: { label: { i18n: 'verdictForever' },     tone: 'yes'     }, other: { label: { i18n: 'advancedPaid' }, tone: 'partial' } },
        { feature: { i18n: 'featDataExport' }, futari: { label: { i18n: 'verdictCsvExport' }, tone: 'yes'     }, other: { label: { i18n: 'partialExport' }, tone: 'partial' } },
      ],
    },
  },
  icost: {
    slug: 'icost',
    name: 'iCost',
    contentUpdatedAt: '2026-10-03',
    screenshotWorkflow: true,
    comparison: {
      rows: [
        { feature: { i18n: 'featSharedLedger' }, futari: { label: { i18n: 'verdictDefaultMode' },        tone: 'yes'     }, other: { label: { i18n: 'verdictSingleUser' },  tone: 'no'      } },
        { feature: { i18n: 'featSplitModes' }, futari: { label: { i18n: 'verdictMultipleModes' },        tone: 'yes'     }, other: { label: { i18n: 'verdictNone' },        tone: 'no'      } },
        { feature: { i18n: 'featCrossPlatform' },       futari: { label: { i18n: 'verdictPlatforms' }, tone: 'yes'   }, other: { label: { i18n: 'iosOnly' },  tone: 'partial' } },
        { feature: { i18n: 'featFree' },     futari: { label: { i18n: 'verdictForever' },            tone: 'yes'     }, other: { label: { i18n: 'inAppPurchases' },    tone: 'partial' } },
        { feature: { i18n: 'featDataExport' }, futari: { label: { i18n: 'verdictCsvExport' },        tone: 'yes'     }, other: { label: { i18n: 'verdictNoExport' },    tone: 'no'      } },
      ],
    },
  },
  splitwise: {
    slug: 'splitwise',
    name: 'Splitwise',
    contentUpdatedAt: '2026-10-03',
    // No screenshotWorkflow: Splitwise exports a spreadsheet per group /
    // friendship (kb.splitwise.com "How can I double check my balances?"),
    // so users arrive holding a real CSV. Headers don't match any dedicated
    // sniff signature, so the file routes to the generic mapping wizard.
    comparison: {
      rows: [
        { feature: { i18n: 'featSharedLedger' },   futari: { label: { i18n: 'verdictDefaultMode' },   tone: 'yes'     }, other: { label: { i18n: 'verdictGroupSupport' },      tone: 'yes'     } },
        { feature: { i18n: 'featSplitModes' },   futari: { label: { i18n: 'verdictMultipleModes' },   tone: 'yes'     }, other: { label: { i18n: 'verdictMultipleModes' },      tone: 'yes'     } },
        { feature: { i18n: 'featDailyEntries' },   futari: { label: { i18n: 'verdictUnlimited' },       tone: 'yes'     }, other: { label: { i18n: 'freePlanFourPerDay' }, tone: 'partial' } },
        { feature: { i18n: 'featMultiCurrency' },     futari: { label: { i18n: 'verdictBuiltInConversion' },   tone: 'yes'     }, other: { label: { i18n: 'conversionNeedsPro' },    tone: 'partial' } },
        { feature: { i18n: 'featDataExport' },   futari: { label: { i18n: 'verdictCsvExport' },   tone: 'yes'     }, other: { label: { i18n: 'verdictSpreadsheetExport' },    tone: 'yes'     } },
      ],
    },
  },
  suishouji: {
    slug: 'suishouji',
    name: '隨手記',
    contentUpdatedAt: '2026-10-03',
    screenshotWorkflow: true,
    comparison: {
      rows: [
        { feature: { i18n: 'featSharedLedger' }, futari: { label: { i18n: 'verdictDefaultMode' }, tone: 'yes'     }, other: { label: { i18n: 'sharedLedgerSetupRequired' }, tone: 'partial' } },
        { feature: { i18n: 'featSplitModes' }, futari: { label: { i18n: 'verdictMultipleModes' }, tone: 'yes'     }, other: { label: { i18n: 'verdictNone' },           tone: 'no'      } },
        { feature: { i18n: 'featMultiCurrency' },   futari: { label: { i18n: 'verdictSupported' },     tone: 'yes'     }, other: { label: { i18n: 'verdictSupported' },         tone: 'yes'     } },
        { feature: { i18n: 'featFree' },     futari: { label: { i18n: 'verdictForever' },     tone: 'yes'     }, other: { label: { i18n: 'adsOrMembership' }, tone: 'partial' } },
        { feature: { i18n: 'featDataExport' }, futari: { label: { i18n: 'verdictCsvExport' }, tone: 'yes'     }, other: { label: { i18n: 'requiresMembership' },       tone: 'partial' } },
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
