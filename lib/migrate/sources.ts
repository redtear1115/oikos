// lib/migrate/sources.ts
// Central source of truth for /migrate/<source> page competitor data (#852).
// Comparison table labels are written in Chinese and are NOT translated —
// the migrate pages' primary audience is Taiwanese and the labels are
// symbol-based (✓/△/✕) with short phrases that don't meaningfully differ.

export type CellTone = 'yes' | 'partial' | 'no'

export type ComparisonRow = {
  feature: string
  futari: { label: string; tone: CellTone }
  other:  { label: string; tone: CellTone }
}

export type SourceDef = {
  slug: string
  name: string
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
    comparison: {
      rows: [
        { feature: '雙人共同帳本',   futari: { label: '✓ 支援',      tone: 'yes'     }, other: { label: '✓ 支援',      tone: 'yes'     } },
        { feature: '費用分攤模式',   futari: { label: '✓ 多種模式',  tone: 'yes'     }, other: { label: '△ 基本對半',  tone: 'partial' } },
        { feature: '持續維護更新',   futari: { label: '✓ 每兩週發版', tone: 'yes'    }, other: { label: '△ 節奏放緩',  tone: 'partial' } },
        { feature: '多幣別記帳',     futari: { label: '✓ 支援',      tone: 'yes'     }, other: { label: '✕ 無',        tone: 'no'      } },
        { feature: '端對端資料加密', futari: { label: '✓ 支援',      tone: 'yes'     }, other: { label: '未說明',      tone: 'no'      } },
      ],
    },
  },
  spendee: {
    slug: 'spendee',
    name: 'Spendee',
    comparison: {
      rows: [
        { feature: '雙人共同帳本', futari: { label: '✓ 免費內建',   tone: 'yes'     }, other: { label: '△ 需付費解鎖',   tone: 'partial' } },
        { feature: '費用分攤模式', futari: { label: '✓ 多種模式',   tone: 'yes'     }, other: { label: '✕ 無原生支援',   tone: 'no'      } },
        { feature: '即時同步',     futari: { label: '✓ 支援',       tone: 'yes'     }, other: { label: '△ 限付費版',     tone: 'partial' } },
        { feature: '完全免費',     futari: { label: '✓ 永久',       tone: 'yes'     }, other: { label: '△ 基本版有限制', tone: 'partial' } },
        { feature: 'CSV 資料匯入', futari: { label: '✓ 直接上傳',   tone: 'yes'     }, other: { label: '需自行整理',     tone: 'partial' } },
      ],
    },
  },
  cwmoney: {
    slug: 'cwmoney',
    name: 'CWMoney',
    templateDownload: { href: '/cwmoney-template.xlsx' },
    comparison: {
      rows: [
        { feature: '雙人共同帳本', futari: { label: '✓ 預設模式', tone: 'yes'     }, other: { label: '△ 需 VIP',   tone: 'partial' } },
        { feature: '費用分攤模式', futari: { label: '✓ 多種模式', tone: 'yes'     }, other: { label: '✕ 無',       tone: 'no'      } },
        { feature: '多幣別記帳',   futari: { label: '✓ 支援',     tone: 'yes'     }, other: { label: '✓ 支援',     tone: 'yes'     } },
        { feature: '完全免費',     futari: { label: '✓ 永久',     tone: 'yes'     }, other: { label: '△ VIP 解鎖', tone: 'partial' } },
        { feature: '即時雲端同步', futari: { label: '✓ 即時',     tone: 'yes'     }, other: { label: '△ 需 VIP',   tone: 'partial' } },
      ],
    },
  },
  moneybook: {
    slug: 'moneybook',
    name: 'Moneybook',
    comparison: {
      rows: [
        { feature: '雙人共同帳本',   futari: { label: '✓ 預設模式', tone: 'yes'     }, other: { label: '✕ 單人設計',   tone: 'no'      } },
        { feature: '費用分攤模式',   futari: { label: '✓ 多種模式', tone: 'yes'     }, other: { label: '✕ 無',         tone: 'no'      } },
        { feature: 'CSV 資料匯出',   futari: { label: '✓ 免費',     tone: 'yes'     }, other: { label: '△ 需訂閱',     tone: 'partial' } },
        { feature: '完全免費',       futari: { label: '✓ 永久',     tone: 'yes'     }, other: { label: '✕ 訂閱制',     tone: 'no'      } },
        { feature: '端對端資料加密', futari: { label: '✓ 支援',     tone: 'yes'     }, other: { label: '未說明',       tone: 'no'      } },
      ],
    },
  },
  andromoney: {
    slug: 'andromoney',
    name: 'AndroMoney',
    comparison: {
      rows: [
        { feature: '雙人共同帳本', futari: { label: '✓ 預設模式', tone: 'yes'     }, other: { label: '✕ 單人設計',       tone: 'no'      } },
        { feature: '費用分攤模式', futari: { label: '✓ 多種模式', tone: 'yes'     }, other: { label: '✕ 無',             tone: 'no'      } },
        { feature: '即時雲端同步', futari: { label: '✓ 即時',     tone: 'yes'     }, other: { label: '△ 需手動備份',     tone: 'partial' } },
        { feature: '多幣別記帳',   futari: { label: '✓ 支援',     tone: 'yes'     }, other: { label: '✓ 支援',           tone: 'yes'     } },
        { feature: '完全免費',     futari: { label: '✓ 永久',     tone: 'yes'     }, other: { label: '△ 含廣告／付費版', tone: 'partial' } },
      ],
    },
  },
  mobills: {
    slug: 'mobills',
    name: 'Mobills',
    comparison: {
      rows: [
        { feature: '雙人共同帳本', futari: { label: '✓ 預設模式',  tone: 'yes'     }, other: { label: '✕ 單人設計',   tone: 'no'      } },
        { feature: '費用分攤模式', futari: { label: '✓ 多種模式',  tone: 'yes'     }, other: { label: '✕ 無',         tone: 'no'      } },
        { feature: '介面語言',     futari: { label: '✓ 中英日四語', tone: 'yes'    }, other: { label: '△ 以英文為主', tone: 'partial' } },
        { feature: '完全免費',     futari: { label: '✓ 永久',      tone: 'yes'     }, other: { label: '△ 進階需訂閱', tone: 'partial' } },
        { feature: 'CSV 資料匯入', futari: { label: '✓ 直接上傳',  tone: 'yes'     }, other: { label: '✓ 可匯出',     tone: 'yes'     } },
      ],
    },
  },
  manebo: {
    slug: 'manebo',
    name: 'Manebo',
    comparison: {
      rows: [
        { feature: '雙人共同帳本',   futari: { label: '✓ 預設模式', tone: 'yes'     }, other: { label: '△ 需設定共享',      tone: 'partial' } },
        { feature: '費用分攤模式',   futari: { label: '✓ 多種模式', tone: 'yes'     }, other: { label: '✕ 無',              tone: 'no'      } },
        { feature: 'CSV 資料匯出',   futari: { label: '✓ 免費',     tone: 'yes'     }, other: { label: '△ Premium 限定',    tone: 'partial' } },
        { feature: '完全免費',       futari: { label: '✓ 永久',     tone: 'yes'     }, other: { label: '△ 部分功能付費',    tone: 'partial' } },
        { feature: '端對端資料加密', futari: { label: '✓ 支援',     tone: 'yes'     }, other: { label: '未說明',            tone: 'no'      } },
      ],
    },
  },
  'simple-daily-money': {
    slug: 'simple-daily-money',
    name: '簡單記帳',
    screenshotWorkflow: true,
    comparison: {
      rows: [
        { feature: '雙人共同帳本', futari: { label: '✓ 預設模式', tone: 'yes'     }, other: { label: '△ 僅能查看', tone: 'partial' } },
        { feature: '費用分攤模式', futari: { label: '✓ 多種模式', tone: 'yes'     }, other: { label: '✕ 無',       tone: 'no'      } },
        { feature: '雲端同步',     futari: { label: '✓ 即時',     tone: 'yes'     }, other: { label: '△ 視版本',   tone: 'partial' } },
        { feature: '完全免費',     futari: { label: '✓ 永久',     tone: 'yes'     }, other: { label: '△ 進階訂閱', tone: 'partial' } },
        { feature: '資料匯出帶走', futari: { label: '✓ CSV 匯出', tone: 'yes'     }, other: { label: '△ VIP 限定', tone: 'partial' } },
      ],
    },
  },
  'fortune-city': {
    slug: 'fortune-city',
    name: '記帳城市',
    screenshotWorkflow: true,
    comparison: {
      rows: [
        { feature: '雙人共同帳本', futari: { label: '✓ 預設模式', tone: 'yes'     }, other: { label: '✕ 單人設計', tone: 'no'      } },
        { feature: '費用分攤模式', futari: { label: '✓ 多種模式', tone: 'yes'     }, other: { label: '✕ 無',       tone: 'no'      } },
        { feature: '雲端同步',     futari: { label: '✓ 即時',     tone: 'yes'     }, other: { label: '△ 視帳號',   tone: 'partial' } },
        { feature: '完全免費',     futari: { label: '✓ 永久',     tone: 'yes'     }, other: { label: '△ 含內購',   tone: 'partial' } },
        { feature: '資料匯出帶走', futari: { label: '✓ CSV 匯出', tone: 'yes'     }, other: { label: '△ 訂閱限定', tone: 'partial' } },
      ],
    },
  },
  cashman: {
    slug: 'cashman',
    name: 'CashMan',
    screenshotWorkflow: true,
    comparison: {
      rows: [
        { feature: '雙人共同帳本', futari: { label: '✓ 預設模式', tone: 'yes'     }, other: { label: '✕ 單人設計', tone: 'no'      } },
        { feature: '費用分攤模式', futari: { label: '✓ 多種模式', tone: 'yes'     }, other: { label: '✕ 無',       tone: 'no'      } },
        { feature: '雲端同步',     futari: { label: '✓ 即時',     tone: 'yes'     }, other: { label: '△ 本機為主', tone: 'partial' } },
        { feature: '完全免費',     futari: { label: '✓ 永久',     tone: 'yes'     }, other: { label: '✓ 免費',     tone: 'yes'     } },
        { feature: '資料匯出帶走', futari: { label: '✓ CSV 匯出', tone: 'yes'     }, other: { label: '✕ 無匯出',   tone: 'no'      } },
      ],
    },
  },
  '1money': {
    slug: '1money',
    name: '1Money',
    screenshotWorkflow: true,
    comparison: {
      rows: [
        { feature: '雙人共同帳本', futari: { label: '✓ 預設模式', tone: 'yes'     }, other: { label: '✕ 單人設計', tone: 'no'      } },
        { feature: '費用分攤模式', futari: { label: '✓ 多種模式', tone: 'yes'     }, other: { label: '✕ 無',       tone: 'no'      } },
        { feature: '多幣別記帳',   futari: { label: '✓ 支援',     tone: 'yes'     }, other: { label: '✓ 支援',     tone: 'yes'     } },
        { feature: '完全免費',     futari: { label: '✓ 永久',     tone: 'yes'     }, other: { label: '△ 進階付費', tone: 'partial' } },
        { feature: '資料匯出帶走', futari: { label: '✓ CSV 匯出', tone: 'yes'     }, other: { label: '△ 部分匯出', tone: 'partial' } },
      ],
    },
  },
  icost: {
    slug: 'icost',
    name: 'iCost',
    screenshotWorkflow: true,
    comparison: {
      rows: [
        { feature: '雙人共同帳本', futari: { label: '✓ 預設模式',        tone: 'yes'     }, other: { label: '✕ 單人設計',  tone: 'no'      } },
        { feature: '費用分攤模式', futari: { label: '✓ 多種模式',        tone: 'yes'     }, other: { label: '✕ 無',        tone: 'no'      } },
        { feature: '跨平台',       futari: { label: '✓ iOS／Android／Web', tone: 'yes'   }, other: { label: '△ iOS 限定',  tone: 'partial' } },
        { feature: '完全免費',     futari: { label: '✓ 永久',            tone: 'yes'     }, other: { label: '△ 含內購',    tone: 'partial' } },
        { feature: '資料匯出帶走', futari: { label: '✓ CSV 匯出',        tone: 'yes'     }, other: { label: '✕ 無匯出',    tone: 'no'      } },
      ],
    },
  },
  suishouji: {
    slug: 'suishouji',
    name: '隨手記',
    screenshotWorkflow: true,
    comparison: {
      rows: [
        { feature: '雙人共同帳本', futari: { label: '✓ 預設模式', tone: 'yes'     }, other: { label: '△ 需設共享帳本', tone: 'partial' } },
        { feature: '費用分攤模式', futari: { label: '✓ 多種模式', tone: 'yes'     }, other: { label: '✕ 無',           tone: 'no'      } },
        { feature: '多幣別記帳',   futari: { label: '✓ 支援',     tone: 'yes'     }, other: { label: '✓ 支援',         tone: 'yes'     } },
        { feature: '完全免費',     futari: { label: '✓ 永久',     tone: 'yes'     }, other: { label: '△ 含廣告／會員', tone: 'partial' } },
        { feature: '資料匯出帶走', futari: { label: '✓ CSV 匯出', tone: 'yes'     }, other: { label: '△ 需會員',       tone: 'partial' } },
      ],
    },
  },
} satisfies Record<string, SourceDef>

export type MigrateSlug = keyof typeof MIGRATE_SOURCES
// → 'honeydue' | 'spendee' | 'cwmoney' | 'moneybook' | 'andromoney' | 'mobills' | 'manebo' | 'simple-daily-money'
