/** Base copy shape for all /migrate/<source> pages.
 *  `comparison` has moved to lib/migrate/sources.ts (#852).
 *  Optional fields are source-specific extras — only honeydue has `intro`,
 *  only spendee has `formatHint*`, only cwmoney has `templateDownload*`. */
export type MigrateBasePageCopy = {
  heroKicker: string
  heroTitle: string
  heroSubtitle: string
  /** honeydue only — objective background paragraph rendered above differentiators */
  intro?: string
  differentiators: readonly [
    { title: string; body: string },
    { title: string; body: string },
    { title: string; body: string },
  ]
  stepsHeading: string
  step1: string
  step2: string
  step3: string
  /** spendee only — CSV column hint rendered inside step 1 */
  formatHintLabel?: string
  formatHintHeaders?: string
  formatHintNote?: string
  /** cwmoney only — Excel template download rendered inside step 2 */
  templateDownloadLabel?: string
  templateNote?: string
  faq: readonly [
    { question: string; answer: string },
    { question: string; answer: string },
    { question: string; answer: string },
    { question: string; answer: string },
  ]
}

export type Translations = {
  signIn: {
    tagline: string
    continueWithGoogle: string
    termsPrefix: string
    termsLink: string
    termsAnd: string
    privacyLink: string
    /** Trailing copy after the privacy link. Empty for languages whose
     *  sentence ends naturally on the noun (en, zh-TW, zh-CN); populated
     *  for SOV languages that need a trailing verb particle (ja). */
    termsSuffix: string
    /** Left-column about narrative on /sign-in (#416). First-person from Ray.
     *  Each section has a long-tail SEO H2 heading + 2–4 body paragraphs;
     *  s5 ends with a short standalone punchline (last array item). */
    about: {
      s1Heading: string
      s1Body: string[]
      s2Heading: string
      s2Body: string[]
      s3Heading: string
      s3Body: string[]
      s4Heading: string
      s4Body: string[]
      s5Heading: string
      s5Body: string[]
      s6Heading: string
      s6Body: string[]
      s7Heading: string
      s7Body: string[]
      /** Quiet footer line shown under the featured article — signals that
       *  Futari has more stories rotating in on future visits. The literal
       *  number ("6") refers to the count of non-featured sections; if the
       *  total section count moves away from 7, update this string in all
       *  4 locales. */
      moreStoriesHint: string
    }
    /** Right-column 4 feature highlight cards on /sign-in (#417).
     *  Scene-style titles (not feature-list titles), one short body each. */
    features: {
      c1Title: string
      c1Body: string
      c2Title: string
      c2Body: string
      c3Title: string
      c3Body: string
      c4Title: string
      c4Body: string
    }
    blog: {
      /** Section heading above the dev-log article list (issue #460). */
      heading: string
    }
    /** sr-only suffix appended to the "Futari" H1 for screen-reader / SEO context (#467). */
    srTagline: string
    /** sr-only paragraph below the visible tagline describing the app (#467). */
    srDescription: string
    /** Quiet secondary entry below the OAuth button on /sign-in that lets
     *  unauthenticated visitors add Futari to their home screen (#540).
     *  Android taps `cta` → fires the captured beforeinstallprompt; iOS
     *  expands `iosStep1` + `iosStep2` inline (no programmatic API). */
    installHint: {
      cta: string
      /** Step 1 text — paired with the share icon by the component. */
      iosStep1: string
      /** Step 2 text — paired with the home icon by the component. */
      iosStep2: string
    }
  }

  landing: {
    /** ALL CAPS small kicker shown above the giant tagline on desktop. */
    heroKicker: string
    /** Tagline as inline HTML — uses `<br />` to break.
     *  Mobile renders this twice (once as the headline, once larger);
     *  desktop renders it once as the giant 96px headline. */
    taglineHtml: string
    /** Hero body copy — supports inline `<br />`. */
    bodyHtml: string
    /** Primary CTA label — appears in top nav (desktop), hero, and
     *  must keep <= ~6 characters in CJK for the mobile pill. */
    cta: string
    /** Caption under mobile CTA, e.g. 「免費 · 不需註冊就能體驗」 */
    ctaHint: string
    /** Secondary desktop CTA — sign-in link for returning users. */
    alreadyHaveAccount: string
    /** Trust pills next to the desktop CTA (compact variant of `<TrustSection>`). */
    trustEncrypted: string
    trustFree: string
    trustPwa: string
    /** Full trust section (#538) — shown between Features and footer. The
     *  compact variant above stays available via `<TrustSection variant="compact">`
     *  for reuse elsewhere; landing renders the `full` variant which uses these. */
    trust: {
      /** One-line narrative above the three trust cards. */
      narrative: string
      encryption: { title: string; body: string }
      portability: { title: string; body: string }
      forever: { title: string; body: string }
    }
    /** Features section. */
    featuresKicker: string
    featuresTitle: string
    /** HTML body shown on desktop only, can contain `<br />`. */
    featuresSubtitleHtml: string
    f1Title: string
    f1Body: string
    f2Title: string
    f2Body: string
    f3Title: string
    f3Body: string
    f4Title: string
    f4Body: string
    /** Migrate section (#613) — three locale-aware links to /migrate/* between
     *  the full trust section and the footer. Strengthens internal link graph
     *  for SEO and gives visitors arriving from another tool a clear next step.
     *  Tone: 溫和見證者 — "搬過來 / 帶過來" verbs, no exclamation marks. */
    migrateSection: {
      /** ALL CAPS kicker shown above the section title. */
      kicker: string
      /** Section heading. */
      title: string
      /** One-line subtitle. */
      subtitle: string
      /** Per-source card title + body. */
      honeydueTitle: string
      honeydueBody: string
      spendeeTitle: string
      spendeeBody: string
      cwmoneyTitle: string
      cwmoneyBody: string
      /** Aria label template — `{source}` is the tool name. */
      cardAriaLabel: string
    }
    /** Use-case section (#851) — three locale-aware links to /use-case/* on the
     *  landing page. Positioned after the migrate section to strengthen internal
     *  link graph for situational-keyword SEO. Tone: 陪伴，not 管理. */
    useCaseSection: {
      kicker: string
      title: string
      subtitle: string
      cohabitationTitle: string
      cohabitationBody: string
      newlywedsTitle: string
      newlywedsBody: string
      petOwnersTitle: string
      petOwnersBody: string
      cardAriaLabel: string
    }
    /** Footer trust note. */
    footerTrust: string
    /** schema.org `name` for WebSite + SoftwareApplication JSON-LD (#467). */
    jsonLdAppName: string
    /** schema.org `alternateName` array for WebSite + SoftwareApplication (#467). */
    jsonLdAlternateNames: readonly string[]
    /** schema.org SoftwareApplication `description` (#467). */
    jsonLdAppDescription: string
    /** schema.org SoftwareApplication `featureList` (#467). */
    jsonLdFeatureList: readonly string[]
    /** schema.org FAQPage entries — answers held to ~40–60 字 to fit AI
     *  Overview's Answer Capsule extraction window (#611). Per-locale so each
     *  rendered page emits FAQ schema matching its visible audience language. */
    jsonLdFaq: readonly { question: string; answer: string }[]
    /** Decorative PhonePreview mock (desktop hero) — not real data (#467). */
    phoneMockBalanceCaption: string
    phoneMockBalancePeriod: string
    phoneMockFeed1Title: string
    phoneMockFeed1Sub: string
    phoneMockFeed2Title: string
    phoneMockFeed2Sub: string
    phoneMockFeed3Title: string
    phoneMockFeed3Sub: string
  }

  common: {
    cancel: string
    save: string
    /** Edit-mode submit label. Distinct from `save` so create-vs-edit CTAs
     *  read semantically (create = "save / jot it down", edit = "update"). */
    update: string
    saving: string
    processing: string
    delete: string
    /** Default confirm-button label used by `ConfirmModal` when the caller
     *  doesn't override `confirmLabel`. Generic affirmative — destructive
     *  modals pass an explicit verb (e.g. `t.common.delete`). */
    confirm: string
    /** "Done" — used by sheet headers that submit on tap (e.g. EditTextSheet
     *  iOS-style header right action). Distinct from `save` because some
     *  contexts read better as "Done" than as "Save". */
    done: string
    me: string
    partner: string
    you: string
    all: string
    error: string
    /** Shown when a server action fails because the device has no network.
     *  Detected by `describeError` in lib/errors.ts. Soft phrasing — Futari
     *  treats network loss as a temporary state, not an error to apologize for. */
    offlineError: string
    back: string
    edit: string
    shared: string
    none: string
    deleteSoftDescription: string
    /** Short transient toasts. `recorded` and `updated` carry the NT$ amount
     *  inline via `{amount}`; `deleted` is a flat acknowledgement. Surfaced
     *  by Dashboard.handleMutated for every successful create / edit / delete. */
    toast: {
      recorded: string
      updated: string
      deleted: string
    }
    /** Generic wizard-step navigation labels (#632). Reused across the CSV
     *  import wizard and any future multi-step flows. Distinct from
     *  `common.back` ("返回" / header back) — these carry step-sequence
     *  semantics ("上一步" / "next step"). */
    navigation: {
      next: string
      back: string
      confirm: string
      cancel: string
      retry: string
    }
  }

  splitType: {
    even: string
    allMine: string
    allPartners: string
    mine: string
    theirs: string
    weighted: string
  }

  category: {
    dining: string
    clothing: string
    housing: string
    transit: string
    education: string
    entertainment: string
    health: string
    financial: string
    other: string
    settle: string
  }

  incomeCategory: {
    salary: string
    bonus: string
    maturity: string
    dividend: string
    survival_annuity: string
    claim: string
    gift: string
    refund: string
    sidehustle: string
    other: string
  }

  feed: {
    header: string
    noFiltered: string
    noRecordsTitle: string
    noRecordsHint: string
    addFirst: string
    noIncome: string
    noFilteredAddHint: string
  }

  firstRecordCard: {
    headline: string
    dismiss: string
    closeAriaLabel: string
  }

  modeToggle: {
    expense: string
    income: string
  }

  payerToggle: {
    label: string
  }

  dashboard: {
    soloHint: string
    inviteCta: string
    addExpense: string
    addIncome: string
    filterLabel: string
    filterAriaLabel: string
    /** Split dual-toggle on Dashboard L3 — drives the `burden` dim (who
     *  actually bears the cost), NOT raw split_type. */
    burdenMe: string
    burdenPartner: string
    /** Issue #367 — contextual surface shown when there's an active trip. */
    /** First-use floating label hints below the BrandHeader icon buttons (#765).
     *  Shown once per device (localStorage), auto-dismiss after 3.5 s. */
    headerHint: {
      trip: string
      settings: string
    }
    activeTripBanner: {
      /** Small kicker above the trip name, e.g. "旅行進行中". */
      kicker: string
      /** Single trip secondary line — `{date}` is the trip start date. */
      singleStartedAt: string
      /** Single trip secondary line with a currency symbol —
       *  `{date}` start date, `{currency}` symbol like "NT$" / "¥". */
      singleStartedAtWithCurrency: string
      /** Aria label for the single-trip card link — `{name}` trip name. */
      singleAriaLabel: string
      /** Heading when N > 1 trips are active — `{count}` the count. */
      multipleHeading: string
      /** CTA line under the multi-trip heading. */
      multipleCta: string
      /** Aria label for the multi-trip card link — `{count}` the count. */
      multipleAriaLabel: string
      /** Single-line CTA shown when there are no active trips. */
      emptyCta: string
      /** Aria label for the ✈ add-trip button. */
      addAriaLabel: string
      /** Aria label for the − collapse toggle. */
      collapseAriaLabel: string
      /** Aria label for the + expand toggle. */
      expandAriaLabel: string
    }
  }

  balanceHero: {
    monthlyIncome: string
    countLabel: string
    /** Measure word rendered after the entry count (e.g. "5 筆").
     *  Empty for languages without a counter word (en); populated for
     *  CJK languages (zh-TW 筆 / zh-CN 笔 / ja 件). Callers gate the
     *  leading space on truthiness, so empty cleanly omits the suffix. */
    countSuffix: string
    recent: string
    noRecord: string
    manage: string
    settleAriaLabel: string
    /** Visible text label on the settle button (next to the ⇄ icon). */
    settleLabel: string
    partnerOwesYou: string
    youOwePartner: string
    currentlyEven: string
    currentlyLabel: string
    /** Toggle label for the settled-only balance view (issue #164). */
    modeSettledLabel: string
    /** Toggle label for the include-pending balance view (issue #164). */
    modeIncludePendingLabel: string
    /** Aria label for the settled/include-pending toggle. */
    modeToggleAriaLabel: string
  }

  soloBanner: {
    waiting: string
    sendInviteHint: string
    dismissAriaLabel: string
    generating: string
    sendInvite: string
    sharedAndCopied: string
    copied: string
  }

  addSheet: {
    title: string
    titleEdit: string
    amount: string
    descPlaceholder: string
    /** Aria label for the description-autocomplete suggestion listbox. */
    descSuggestions: string
    category: string
    assetLink: string
    splitMethod: string
    date: string
    notesLabel: string
    notesPlaceholder: string
    statusLabel: string
    statusSettled: string
    statusPending: string
    /** Subtle hint shown under the toggle when 'pending' is selected, explaining
     *  the row is excluded from the shared balance until promoted to settled. */
    statusPendingHint: string
    deleteOne: string
    deleteConfirmTitle: string
    /** Label for the currency selector (#68). */
    currency: string
    /** Label for the trip selector (#42). */
    trip: string
    /** "No trip" option in the trip selector. */
    noTrip: string
    errors: {
      amountRequired: string
      /** {max} = formatted MAX_AMOUNT ceiling. */
      amountTooLarge: string
      descriptionRequired: string
      noPartner: string
    }
  }

  compactRow: {
    /** Small badge appended to a transaction row when its status is 'pending'. */
    pendingBadge: string
    /** Transaction row payer label — viewer paid (settlement). */
    iSettled: string
    /** Transaction row payer label — partner paid (settlement). `{name}` = partner displayName. */
    partnerSettled: string
    /** Transaction row payer label — viewer paid (income). */
    youIncome: string
    /** Transaction row payer label — partner paid (income). `{name}` = partner displayName. */
    partnerIncome: string
    /** Transaction row payer label — viewer paid (expense). */
    youPaid: string
    /** Transaction row payer label — partner paid (expense). `{name}` = partner displayName. */
    partnerPaid: string
    /** Abbreviation suffix for trillions (兆). */
    trillion: string
    /** Abbreviation suffix for hundred millions (億). */
    hundredMillion: string
  }

  transactionFeed: {
    /** Load-more button while fetching. */
    loading: string
    /** Load-more button idle state. */
    loadMore: string
    /** End-of-feed sentinel shown when there are no more pages. */
    endOfFeed: string
    /** Aria-label on the error toast close button. */
    closeAriaLabel: string
    /** Fallback description for settlement rows (when note is absent). */
    settlementFallback: string
  }

  partnerToast: {
    /** Realtime toast — partner added an expense record. `{name}` = partner displayName. */
    recordedExpense: string
    /** Realtime toast — partner added an income record. `{name}` = partner displayName. */
    recordedIncome: string
  }

  bottomNav: {
    home: string
    records: string
    assets: string
    settings: string
    /** Aria-label for the floating add button. */
    addAriaLabel: string
    /** Aria-label for the nav landmark itself (screen-reader-only). */
    navAriaLabel: string
  }

  miniCalendar: {
    /** Aria-label for the "previous month" nav button. */
    prevMonth: string
    /** Aria-label for the "next month" nav button. */
    nextMonth: string
    /** Aria-label for the "previous year" nav button. */
    prevYear: string
    /** Aria-label for the "next year" nav button. */
    nextYear: string
    /** Aria-label for the "previous decade" nav button. */
    prevDecade: string
    /** Aria-label for the "next decade" nav button. */
    nextDecade: string
    /** Aria-label for the month-picker trigger in day view. */
    selectMonth: string
    /** Aria-label for the year-picker trigger in month view. */
    selectYear: string
    /** Aria-label for the split-ratio slider. */
    splitRatioAriaLabel: string
    /** Title in day view. `{year}` and `{month}` are replaced. */
    dayViewTitle: string
    /** Title in month view. `{year}` is replaced. */
    monthViewTitle: string
    /** Single month cell label. `{month}` is replaced (1–12). */
    monthLabel: string
    /** Weekday header labels, Sunday first. Array of 7 strings. */
    weekdays: string[]
  }

  splitTypeSelector: {
    /** Aria-label for the radiogroup wrapper. */
    groupAriaLabel: string
    /** Aria-label for the ratio slider. */
    ratioAriaLabel: string
    /** Sub-label when weighted ratio is 50/50 and amount is 0. */
    evenSub: string
    /** Sub-label when viewer paid, weighted, amount > 0. `{amount}` replaced. */
    partnerOwesYouAmount: string
    /** Sub-label when partner paid, weighted, amount > 0. `{amount}` replaced. */
    youOwePartnerAmount: string
    /** Sub-label when ratio is not 50/50 and amount is 0. `{me}` and `{other}` replaced. */
    ratioNoAmount: string
    /** Sub-label for all_mine when viewer paid. */
    allMineSelfPaid: string
    /** Sub-label for all_mine when partner paid. */
    allMinePartnerPaid: string
    /** Sub-label for all_theirs when viewer paid and amount is 0. */
    allTheirsNoAmount: string
    /** Sub-label for all_theirs when partner paid and amount is 0. */
    allTheirsPartnerNoAmount: string
    /** Sub-label for all_theirs when viewer paid, amount > 0. `{amount}` replaced. */
    allTheirsYouPaid: string
    /** Sub-label for all_theirs when partner paid, amount > 0. `{amount}` replaced. */
    allTheirsPartnerPaid: string
    /** Me ratio label. `{ratio}` replaced. */
    meRatio: string
    /** Partner ratio label. `{ratio}` replaced. */
    partnerRatio: string
  }

  pendingIncomeStack: {
    /** Section heading above the pending income cards. */
    heading: string
    /** Collapse button label (when expanded). */
    collapse: string
    /** Expand button label. `{count}` replaced with remaining hidden count. */
    expand: string
  }

  pendingIncomeCard: {
    /** Primary confirm button label. */
    confirm: string
    /** Edit button label. */
    edit: string
    /** Skip button label. */
    skip: string
    /** Skip confirm modal title. `{date}` and `{name}` replaced. */
    skipTitle: string
    /** Skip confirm modal body. */
    skipDescription: string
    /** Error fallback when confirm fails. */
    confirmError: string
    /** Error fallback when skip fails. */
    skipError: string
  }

  logoutButton: {
    /** Button label when idle. */
    label: string
    /** Button label while signing out. */
    pending: string
    /** Confirm modal title. */
    title: string
    /** Confirm modal description. */
    description: string
  }

  splitRatioSection: {
    /** Inline label suffix for viewer. `{name}` replaced with displayName. */
    meSuffix: string
    /** Inline label suffix for partner. `{name}` replaced with displayName. */
    partnerSuffix: string
  }

  errorPage: {
    /** Retry button label. */
    retry: string
    /** Generic subtitle asking the user to try again. */
    subtitle: string
    /** Title for the dashboard error page. */
    dashboard: string
    /** Title for the records error page. */
    records: string
    /** Title for the settings error page. */
    settings: string
    /** Title for the trips error page. */
    trips: string
    /** Title for the assets error page. */
    assets: string
    /** Title for the monthly review error page. */
    review: string
    /** Label preceding the error digest, e.g. "錯誤代碼: abc123". */
    refLabel: string
  }

  assetListItem: {
    /** Badge label for savings-type insurance assets. */
    savingsBadge: string
    /** Small label above the monthly amount column. */
    thisMonth: string
    /** Section / switcher group labels for insurance assets by kind. */
    insuranceGroups: {
      shortTermProtection: string
      longTermProtection: string
      savings: string
    }
  }

  /** Trip list page (#42). */
  tripList: {
    /** Page heading at the top of /trips. */
    title: string
    /** Soft subtitle under the page title. */
    subtitle: string
    /** Section label above the active trips list. */
    sectionActive: string
    /** Section label above the past / ended trips list. */
    sectionPast: string
    /** Inline tag appended after the date range on past rows. */
    endedTag: string
    /** Date range "{startDate} 起,進行中" — `{startDate}` is the trip start ISO date. */
    dateRangeActive: string
    /** Aria label for the back link in the page header (where applicable). */
    backAriaLabel: string
    /** Empty-state copy when the group has no trips at all. */
    empty: {
      heading: string
      body: string
    }
  }

  /** Trip create/edit sheet (#42, #410). */
  tripSheet: {
    /** Sheet title for creating a new trip. */
    titleNew: string
    /** Sheet title for editing an existing trip. */
    titleEdit: string
    /** Bottom save button when creating. */
    saveNew: string
    /** Bottom save button when editing. */
    saveEdit: string
    errors: {
      /** Server fallback when createTrip throws without a message. */
      createFailed: string
      /** Server fallback when updateTrip throws without a message. */
      updateFailed: string
      /** Inline error under a custom row whose code is blank. */
      codeBlank: string
      /** Inline error when two rows have the same code. */
      codeDuplicate: string
      /** Inline error when any row's rate ≤ 0 — bound near the offending input. */
      rateInvalid: string
      /** Inline error under a rate input that is blank or non-positive. */
      rateInvalidInline: string
      /** Soft toast-style error when the user tries to exceed MAX_ENTRIES.
       *  `{max}` is the cap (5). */
      maxCurrencies: string
    }
    /** Label above the trip name input. */
    nameLabel: string
    /** Placeholder inside the trip name input. */
    namePlaceholder: string
    /** Label above the start date picker. */
    startDateLabel: string
    /** Label above the (optional) end date picker. */
    endDateLabel: string
    /** Inline alert under the date pair when end < start. */
    endBeforeStart: string
    /** Section heading above the currency picker. */
    currenciesSectionTitle: string
    /** One-line hint under the section heading explaining rate direction. */
    currenciesHint: string
    /** "{n} / {max}" pill in the section header. */
    currencyCountFormat: string
    /** Pill button to add a custom (non-preset) currency row. */
    addCustomCta: string
    /** Bottom-of-sheet reassurance about how trip-tagged expenses are routed. */
    footerNote: string
    /** Inline hint under the rate input showing the inverse direction.
     *  `{default}` is the base currency code. */
    rateInverseFormat: string
    /** Pill on the base currency's header row — base is always present and
     *  is the trip's reference currency (no longer user-switchable). */
    basePill: string
    /** Soft note shown beneath a non-base currency row when there are already
     *  TripExpenses recorded against it. `{n}` is the count. Reassures that
     *  rate edits only affect future records. */
    usedCountNote: string
    customRow: {
      /** Aria label on the custom-row code input. */
      codeAriaLabel: string
      /** Placeholder text in the custom-row code input. */
      codePlaceholder: string
      /** Aria label on the custom-row display name input. */
      labelAriaLabel: string
      /** Placeholder text in the custom-row display name input. */
      labelPlaceholder: string
      /** Aria label on the × remove button. */
      removeAriaLabel: string
    }
    /** Localised display name for each preset currency code (the 4 codes are
     *  universal; the labels next to them are not). */
    presetLabels: {
      TWD: string
      CNY: string
      USD: string
      JPY: string
    }
  }

  /** Trip detail page (#42). */
  tripDetail: {
    /** Empty-state copy when the trip is still active. */
    emptyActive: string
    /** Empty-state copy when the trip is already ended / read-only. */
    emptyEnded: string
    /** Section heading above the multi-currency breakdown table. */
    currencyBreakdown: string
    /** Suffix after currency-bucket row count, e.g. "3 筆". */
    recordsSuffix: string
    /** Section heading above the per-side paid/share cards. */
    perSideContribution: string
    /** Card label for "you paid" (viewer column). */
    youPaid: string
    /** Card label for partner paid — `{name}` is replaced with the partner displayName. */
    partnerPaid: string
    /** Sub-label under each per-side card: "share" = the slice this side carried. */
    share: string
    /** Hint under the per-side block clarifying scope (settled rows only). */
    perSideHint: string
    /** Sheet title for the "end this trip" modal. */
    endTitle: string
    /** Body copy under the end-trip title, explaining what end means. */
    endBody: string
    /** Date-input label inside the end-trip sheet. */
    endDateLabel: string
    /** Save button on the end-trip sheet. */
    endConfirm: string
    /** Validation error when end date < start date.
     *  `{date}` is replaced with the trip's start date. */
    endDateBeforeStart: string
    /** Server/network error fallback when endTrip() throws without a message. */
    endFailure: string
    /** Aria label for the pencil edit button in the trip detail sticky header. */
    editAriaLabel: string
    /** Red-tinted warning shown above the end-trip date picker — emphasises
     *  that ending writes a summary into the main ledger and cannot be undone. */
    endIrreversibleNote: string
    /** Tiny label above the trip total in the top fold-preview card. */
    totalLabel: string
    /** Pill on the top card showing this trip's settlement currency. `{code}` is the base code. */
    baseCurrencyTag: string
    /** Title attribute on the base currency pill. */
    baseCurrencyTagTitle: string
    /** Section header above the records list. `{n}` is the record count. */
    recordsCountLabel: string
  }

  incomeSheet: {
    title: string
    titleEdit: string
    amountLabel: string
    recipientPrompt: string
    categoryLabel: string
    policyLink: string
    selectPolicy: string
    maturityHint: string
    claimHint: string
    noPolicy: string
    insuranceBadge: string
    noteLabel: string
    notePlaceholder: string
    deleteIncome: string
    deleteConfirmTitle: string
    errors: {
      amountRequired: string
      /** {max} = formatted MAX_AMOUNT ceiling. */
      amountTooLarge: string
      saveFailed: string
      missingPendingId: string
    }
  }

  settlement: {
    debtorTitle: string
    /** Template with `{name}` placeholder. */
    creditorTitle: string
    primaryRepay: string
    primaryReceive: string
    amountAriaLabel: string
    /** SettlementSheet (edit-existing) header title. */
    editTitle: string
    /** Label above the amount block in SettlementSheet. */
    amountLabel: string
    /** Label above the date picker in SettlementSheet. */
    dateLabel: string
    /** Inline delete CTA at the bottom of SettlementSheet. */
    deleteOne: string
    /** Confirm-modal title shown when the user taps `deleteOne`. */
    deleteConfirmTitle: string
    errors: {
      exceedsDebt: string
      /** Inline validation when the amount input is empty or zero. */
      amountRequired: string
      /** Inline validation when "對方付" is selected but no partner exists. */
      noPartner: string
    }
  }

  /** Generic single-input sheet (e.g. rename帳本 / 顯示名稱). */
  editTextSheet: {
    /** Inline error when the user tries to save an empty value. */
    errorEmpty: string
    /** Fallback error message when the onSubmit callback rejects without one. */
    saveFailed: string
  }

  /** Bottom-sheet asset picker — opens from AddSheet to link a record to
   *  an existing 愛物 (or to clear the link). */
  assetPickerSheet: {
    title: string
    /** Tab/aria label — same wording as `title` so SR users hear the
     *  picker's purpose when focus enters the tablist. */
    tablistAriaLabel: string
    /** "No link" sentinel option always shown at the top of the picker. */
    noneTitle: string
    /** Subtitle under `noneTitle` explaining what "no link" means. */
    noneSubtitle: string
    /** Placeholder while assets are being fetched. */
    loading: string
    /** Fallback error string passed to `describeError` when the fetch throws. */
    loadFailed: string
    /** Empty-state copy when the 愛物 tab has no assets. */
    emptyAibutsu: string
    /** Empty-state copy when the 守護 tab has no insurance assets. */
    emptyGuardian: string
  }

  records: {
    title: string
    tabExpense: string
    tabIncome: string
    manageRecurringIncome: string
    manageRecurringExpense: string
    recurringShortcut: string
    offlineMoreNeedsNetwork: string
    monthPicker: {
      triggerLabel: string
      dialogLabel: string
      prevYear: string
      nextYear: string
    }
    stats: {
      title: string         // expense-tab title (kept for back-compat)
      titleAll: string      // 全部 tab
      titleIncome: string   // 收入 tab
      empty: string
      emptySub: string
      viewByCategory: string
      viewByAsset: string
      otherSpend: string
      prevMonth: string
      nextMonth: string
      collapse: string
      expand: string
      summaryExpense: string    // {amount}
      summaryIncome: string     // {amount}
      summaryNetIncome: string  // {amount}, e.g. "淨收入 +NT$..."
      summaryNetExpense: string // {amount}, e.g. "淨支出 NT$..."
      summaryNetEven: string    // "持平"
      /** A11y label for a stats bar that's NOT currently the drill target. {label} = bar's label. */
      drillFilterLabel: string  // {label}
      /** A11y label for a stats bar that IS the active drill (tap to clear). {label} = bar's label. */
      drillClearLabel: string   // {label}
      drillChipPrefix: string   // small prefix shown before the label inside the chip
      drillChipClear: string    // a11y label for the chip's X button
      drillAssetUnknown: string // fallback when an asset has no resolvable name
      /** Donut chart center label when no slice is selected. */
      donutCenterTotal: string
      /** 收支-tab daily trend chart (#747): legend labels + chart a11y. */
      trendExpense: string
      trendIncome: string
      trendNet: string
      trendChartLabel: string
    }
  }

  filterSheet: {
    reset: string
    title: string
    apply: string
    payerSection: string
    splitSection: string
    categorySection: string
    incomeCategorySection: string
    dateSection: string
    dateThisMonth: string
    dateLastMonth: string
    dateAll: string
    dateCustom: string
    dateCustomStart: string
    dateCustomEnd: string
    dateRangeAll: string
    dateRangeChipPrefix: string
    dateRangeClear: string
    assetSection: string
    assetNone: string
    /** v0.16.0 #223 — chip label inside each asset sub-section that toggles
     *  every asset in the group on/off. Same label across all groups (車輛 /
     *  房子 / 生命 / 物品 / 守護). */
    assetGroupSelectAll: string
    /** v0.16.0 #223 — sub-section labels for the 愛物 filter, grouped by
     *  asset type. Mirrors the section labels on /assets so the visual
     *  identity is consistent across the filter sheet and the asset list. */
    assetGroup: {
      car: string
      house: string
      living: string
      item: string
      coverage: string
    }
    amountSection: string
    amountMinPlaceholder: string
    amountMaxPlaceholder: string
    amountMinLabel: string
    amountMaxLabel: string
    statusSection: string
    statusPending: string
    statusSettled: string
    shareLink: string
    shareCopied: string
    shareFailed: string
  }

  settings: {
    title: string
    subtitle: string
    sectionGroup: string
    groupName: string
    sectionMember: string
    youSuffix: string
    sectionPersonal: string
    addToHomeScreen: string
    displayName: string
    soloLockHint: string
    /** Accessible label for the default split-type radiogroup (assistive only). */
    defaultSplitLabel: string
    inviteCta: string
    /** Settings 主頁頂部 row — 個人與帳本快捷入口 (#427). */
    quickAccessRow: string
    currency: string
    sectionApp: string
    offlineBrowsing: string
    offlineHintOff: string
    offlineHintOn: string
    offlineToggling: string
    offlineToggleError: string
    offlineUnsupported: string
    recurringIncome: string
    recurringExpense: string
    recurringSettings: string
    sectionData: string
    trust: string
    /** #893 — 「支持 Futari」row label in settings footer. */
    support: string
    exportData: string
    pastTimes: string
    trips: string
    /** Secondary text under the 旅行 row — counts of active / past trips. */
    tripsRow: {
      active: string
      past: string
      both: string
    }
    guardianBeta: {
      title: string
      description: string
    }
    dangerZone: {
      sectionTitle: string
      leaveCta: string
      swapBanner: {
        yourProposal: string
        partnerProposal: string
        expiresOn: string
        cancelCta: string
        rejectCta: string
        acceptCta: string
        processing: string
        errorPrefix: string
      }
      flow: {
        step: string
        back: string
        next: string
        close: string
        roleA: string
        roleB: string
        card1: {
          titleA: string
          titleB: string
          bodyA: string
          bodyB: string
        }
        card2: {
          title: string
          body: string
        }
        card3: {
          title: string
          intro: string
          bullets: string[]
        }
        card4: {
          title: string
          body: string
          yesB: string
          yesASwap: string
          no: string
        }
        finalConfirm: {
          title: string
          balanceOk: string
          balanceNotZero: string
          settleCta: string
          typePromptPrefix: string
          typePromptSuffix: string
          typePlaceholder: string
          confirmText: string
          leaveButton: string
          leaving: string
        }
        swapProposed: {
          title: string
          body: string
          ok: string
        }
      }
      errors: {
        swapAlreadyPending: string
        noPendingSwap: string
        swapExpired: string
        cannotConfirmOwnProposal: string
        notAMember: string
        onlyMemberBCanLeave: string
        balanceNotZero: string
        soloGroup: string
        fallback: string
      }
    }
    /** #607 — Settings nav entry + /settings/import wizard copy. */
    import: {
      navLabel: string
      navSecondary: string
      pageTitle: string
      pageSubtitle: string
      back: string
      stepLabel: string
      step1: {
        title: string
        subtitle: string
        sourceLabel: string
        sources: {
          honeydue: string
          spendee: string
          cwmoney: string
          generic: string
        }
        uploadPrompt: string
        uploadButton: string
        parsing: string
        fileSelected: string
        summary: string
        sourceDetected: string
        invalidNote: string
        retryCta: string
        parseError: string
      }
      step2: {
        title: string
        subtitle: string
        sourceColumn: string
        targetColumn: string
        rowCount: string
        keepOriginal: string
      }
      step3: {
        title: string
        subtitle: string
        payerLabel: string
        payerHint: string
        splitLabel: string
        splitOptions: {
          all_mine: string
          all_theirs: string
          half: string
        }
        soloHint: string
      }
      step4: {
        title: string
        subtitle: string
        tableHeader: {
          date: string
          description: string
          category: string
          amount: string
          type: string
        }
        typeExpense: string
        typeIncome: string
        moreRows: string
        confirmCta: string
        confirming: string
        summary: string
      }
      result: {
        successHeading: string
        successBody: string
        rollbackHint: string
        rollbackCta: string
        rollbackConfirm: string
        rollbacking: string
        doneCta: string
      }
      history: {
        title: string
        empty: string
        rolledBack: string
        completed: string
        rollbackableTag: string
        expiredTag: string
      }
      errors: {
        parseFailed: string
        submitFailed: string
        rollbackFailed: string
        noValidRows: string
      }
    }
  }

  postLeave: {
    /** Stayer's "your partner left" card. `{partner}` substituted with the leaver's display name. */
    partnerLeftHeading: string
    partnerLeftBody: string
    /** Leaver's "welcome back to solo" card. */
    welcomeSoloHeading: string
    welcomeSoloBody: string
    dismissAria: string
  }

  pastTimes: {
    title: string
    back: string
    intro: string
    /** Label for the open chapter; `{partner}` replaced with partner name, or
     *  the locale falls back to a solo phrasing if no partner is present. */
    currentChapter: string
    currentChapterSolo: string
    /** Label template for a closed chapter — `{start}` / `{end}` substituted. */
    chapterRange: string
    /** Label inside each row; `{partner}` substituted, or the solo string if no partner. */
    withPartner: string
    soloLabel: string
    enterCta: string
    /** Banner copy across the top of dashboard / records when a past epoch is pinned. */
    bannerHeading: string
    bannerExitCta: string
    empty: string
  }

  csvExport: {
    preparing: string
    failed: string
    /** Filename stem; `-YYYYMMDD.csv` is appended at download time. */
    filenamePrefix: string
    columns: {
      date: string
      description: string
      amount: string
      category: string
      paidBy: string
      splitType: string
      notes: string
    }
  }

  contextStrip: {
    partnerLeftLine: string
  }

  assets: {
    title: string
    empty: {
      title: string
      body: string
    }
    section: {
      property: string
      living: string
      coverage: string
      items: string
    }
    /** v0.15.2 #178 — 愛物頁分成「愛物」/「守護」兩個 tab，保險併入守護。 */
    tabs: {
      aibutsu: string
      guardian: string
    }
    tabEmpty: {
      aibutsuHint: string
      guardianHint: string
    }
    /** #227 — shown when guardian beta is off but the user lands on the
     *  guardian tab (or insurance asset detail) via a stale URL/bookmark.
     *  In-place gate that points to Settings → Guardian (Beta) toggle. */
    guardianGated: {
      title: string
      body: string
      cta: string
    }
    addCar: string
    addSecondCar: string
    addHouse: string
    addChild: string
    addPet: string
    addPlant: string
    addItem: string
    /** #545 §5 — aria-label for the “全部 / all types” chip in the icon-only filter strip. */
    typeFilterAll: string
    /** v0.15.0 #127 — strings used only by InsuranceListItem in the coverage section. */
    insuranceList: {
      /** Template with `{name}` placeholder. */
      insuredPrefix: string
      /** Template with `{amount}` placeholder. Annual-premium pill, plain NT$. */
      annualPremium: string
      // ── savings ─────────────────────────────────────────────────────────
      /** Template with `{amount}` placeholder. Years-paid × annual premium. */
      savingsCumulative: string
      /** Shown after cumulative when notes mention "USD". */
      savingsForeignNote: string
      /** Shown when today > expiry for savings policies. */
      savingsMaturedBadge: string
      /** #260 — default fallback badge so every card has a visible state. */
      activeBadge: string
      // ── multi-year protection ───────────────────────────────────────────
      /** Template with `{amount}` placeholder. */
      sumInsuredShort: string
      /** Template with `{n}` placeholder — remaining years. */
      yearsLeft: string
      /** Shown when policy is expired (any kind). */
      expired: string
      // ── single-year protection ──────────────────────────────────────────
      /** Fallback subtitle for single-year policies with no premium set. */
      singleYearLabel: string
      /** Template with `{n}` — amber/warning badge (≤60d, >reminderDaysBefore). */
      daysLeftWarning: string
      /** Template with `{n}` — red/urgent badge (≤reminderDaysBefore). */
      daysLeftUrgent: string
      /** Red badge shown when single-year policy is expired. */
      expiredBadge: string
      // ── multi-period (savings + multi-year protection) ──────────────────
      /** Template with `{n}` — amber/warning badge for upcoming premium. */
      nextPaymentBadge: string
      /** Button label — opens the renewal sheet. */
      renewAction: string
      /** Button label — opens the lapse confirmation. */
      lapseAction: string
      // ── renew sheet ─────────────────────────────────────────────────────
      renewTitle: string
      renewDescription: string
      renewPolicyNoLabel: string
      renewPolicyNoPlaceholder: string
      renewConfirm: string
      // ── lapse confirm ───────────────────────────────────────────────────
      lapseTitle: string
      lapseDescription: string
      lapseConfirm: string
    }
  }

  recurringIncome: {
    title: string
    back: string
    empty: {
      hint: string
      cta: string
    }
    rule: {
      pausedHint: string
      intervalEveryMonth: string
      intervalEveryQuarter: string
      intervalEveryHalfYear: string
      intervalEveryYear: string
      /** Template with `{n}` for non-standard intervals. */
      intervalEveryNMonths: string
      /** Template with `{day}` placeholder. */
      dayLabel: string
    }
    pending: {
      sectionLabel: string
      primaryAction: string
      editAction: string
      skipAction: string
      /** Template with `{date}` and `{description}` placeholders. */
      skipConfirm: string
      /** Template with `{n}` placeholder. */
      expandAll: string
      collapse: string
    }
    sheet: {
      titleNew: string
      titleEdit: string
      amountLabel: string
      recipientPrompt: string
      categoryLabel: string
      intervalLabel: string
      dayOfMonthLabel: string
      dayOfMonthFallbackHint: string
      /** Template with `{day}` placeholder for DayPicker aria-label. */
      dayAriaLabel: string
      dayFallbackTitle: string
      sourceLabel: string
      sourcePlaceholder: string
      startsOnLabel: string
      endsOnLabel: string
      assetLabel: string
      assetNone: string
      pauseAction: string
      resumeAction: string
      deleteRuleAction: string
      deleteConfirmTitle: string
      deleteConfirmDescription: string
    }
    errors: {
      amountRequired: string
      saveFailed: string
      operationFailed: string
      deleteFailed: string
    }
    raceMessage: string
  }

  trust: {
    title: string
    back: string
    pageHeading: string
    pageSubtitle: string
    encryption: {
      heading: string
      body: string
    }
    portability: {
      heading: string
      body: string
      comingSoonHint: string
    }
    backup: {
      heading: string
      body: string
    }
    onboarding: {
      line1: string
      line2: string
      line3: string
    }
    bilateral: {
      inviter: {
        heading: string
        subtitle: string
        cta: string
      }
      invitee: {
        /** Template with `{name}` placeholder for inviter's display name. */
        heading: string
        subtitle: string
        cta: string
        confirming: string
      }
    }
  }

  /** /settings/support page — embedded Ko-fi tip jar (#893). The iframe lets
   *  the user complete the donation without leaving the app. */
  support: {
    title: string
    back: string
    pageHeading: string
    pageSubtitle: string
  }

  /** /settings/currency page — base currency only since v0.17.4 (#410).
   *  Trip-scoped 心理匯率 lives inside each trip's TripSheet. */
  currencyPage: {
    title: string
    back: string
    pageHeading: string
    pageSubtitle: string
    base: {
      sectionTitle: string
      sectionHint: string
      locked: {
        heading: string
        body: string
        bodyNext: string
      }
    }
    /** Hint card pointing users at trip-scoped currency settings. */
    tripsHint: {
      heading: string
      body: string
      linkLabel: string
    }
    errors: {
      baseChangeFailed: string
    }
  }

  assetSheet: {
    titleNew: string
    titleEdit: string
    typeFallback: string
    saveChanges: string
    deleteConfirm: {
      title: string
      description: string
      confirmLabel: string
    }
    type: {
      label: string
      car: string
      child: string
      pet: string
      plant: string
      house: string
      insurance: string
      item: string
      more: string
    }
    name: {
      label: string
      placeholderCar: string
      placeholderChild: string
      placeholderPet: string
      placeholderPlant: string
      placeholderHouse: string
      placeholderInsurance: string
    }
    notes: {
      label: string
      placeholder: string
    }
    car: {
      color: string
      colorNoneAriaLabel: string
      plate: string
      platePlaceholder: string
      year: string
      yearPlaceholder: string
      brand: string
      brandPlaceholder: string
      model: string
      modelPlaceholder: string
      purchasedAt: string
      pickDate: string
      purchasePrice: string
      initialOdometer: string
      initialOdometerPlaceholder: string
      fuelType: string
      fuelTypeDiesel: string
      primaryUser: string
    }
    child: {
      nickname: string
      nicknamePlaceholder: string
      /** #826 — full real name input. Trinary semantics like nationalId. */
      fullName: string
      fullNamePlaceholder: string
      gender: string
      genderMale: string
      genderFemale: string
      birthday: string
      sectionId: string
      nationalId: string
      nationalIdPlaceholder: string
      nhiNo: string
      nhiNoPlaceholder: string
      encryptedHint: string
      pendingClearHint: string
      clear: string
      cancelClear: string
      bloodType: string
      hospital: string
      hospitalPlaceholder: string
      sectionBody: string
      height: string
      heightPlaceholder: string
      weight: string
      weightPlaceholder: string
    }
    pet: {
      species: string
      speciesCat: string
      speciesDog: string
      speciesRabbit: string
      speciesBird: string
      speciesFish: string
      speciesOther: string
      breed: string
      breedPlaceholder: string
      sex: string
      sexMale: string
      sexFemale: string
      sexUnknown: string
      birthDate: string
      adoptedDate: string
      purchaseCost: string
      purchaseCostPlaceholder: string
      weight: string
      weightPlaceholder: string
      sectionHealth: string
      chipNo: string
      chipNoPlaceholder: string
      vet: string
      vetPlaceholder: string
    }
    plant: {
      species: string
      speciesPlaceholder: string
      location: string
      locationPlaceholder: string
      sproutedAt: string
      cost: string
      costPlaceholder: string
      sectionCare: string
      waterEvery: string
      waterEverySuffix: string
    }
    house: {
      address: string
      addressPlaceholder: string
      purchasedAt: string
      pickDate: string
      purchasePrice: string
      purchasePricePlaceholder: string
    }
    insurance: {
      kind: string
      kindMedical: string
      kindLife: string
      kindAccident: string
      kindCancer: string
      kindIllness: string
      kindCar: string
      kindSavings: string
      insured: string
      insuredPlaceholder: string
      insuredFreeform: string
      policyHolder: string
      insurer: string
      insurerPlaceholder: string
      policyNo: string
      policyNoPlaceholder: string
      sectionPremium: string
      annualPremium: string
      annualPremiumPlaceholder: string
      sumInsured: string
      sumInsuredPlaceholder: string
      expectedMaturityAmount: string
      expectedMaturityAmountPlaceholder: string
      /** #166 — investment-linked savings policies only. */
      accountValue: string
      accountValuePlaceholder: string
      payCycle: string
      payCycleAnnual: string
      payCycleSemi: string
      payCycleQuarterly: string
      payCycleMonthly: string
      sectionContract: string
      startsAt: string
      endsAt: string
      termYears: string
      termYearsPlaceholder: string
      termYearsSuffix: string
      sectionLinkedVehicle: string
      linkedVehicle: string
      noLink: string
    }
  }

  /** v0.16.0 #222 — 愛物模板系統 v1：只有「物品 (general)」一個模板，純文字紀錄，不接 FuelLog / 守護 等任何自動化。 */
  assetTemplate: {
    namePlaceholder: string
    detailSection: string
  }

  assetDetail: {
    backAriaLabel: string
    editAriaLabel: string
    switcherAriaLabel: string
    siblingRailAriaLabel: string
    switcher: {
      emptyGroup: string
      currentLabel: string
    }
    notesSection: string
    recentExpenses: string
    /** Template with `{count}` placeholder. */
    timelineEntries: string
    addOtherExpense: string
    refuel: string
    relatedInsurance: string
    linkedVehicleSection: string
    emptyCarLine1: string
    emptyCarLine2: string
    emptyDefaultLine1: string
    emptyDefaultLine2: string
    typeLabels: {
      car: string
      house: string
      child: string
      pet: string
      plant: string
      insurance: string
      item: string
    }
    age: {
      label: string
      yearsSuffix: string
      monthsSuffix: string
    }
    money: {
      thisMonth: string
      cumulative: string
    }
    hint: {
      title: string
      cta: string
      itemsPet: string
      itemsChild: string
      itemsPlant: string
      itemsHouse: string
      itemsCar: string
      itemsItem: string
    }
    /** Shared labels used by the `RevealableRow` shared component (#826).
     *  Card-detail PII rows (plate, address, child full name, national ID, NHI)
     *  all render through the same component and pull their toggle copy from
     *  here so labels stay consistent across asset types. */
    reveal: {
      show: string
      hide: string
      loading: string
      error: string
    }
    car: {
      avgEcon: string
      avgEconNoLog: string
      avgEconNeedMore: string
      avgEconRecent: string
      /** #826 — label for the encrypted plate row. */
      plate: string
      /** #826 — section header above the masked plate reveal row. */
      plateSection: string
    }
    child: {
      sectionId: string
      sectionBody: string
      bornDate: string
      nationalId: string
      nhiNo: string
      bornHospital: string
      bloodType: string
      /** Template with `{type}` placeholder, e.g. "A 型". */
      bloodTypeValue: string
      height: string
      weight: string
      /** #826 — label for the encrypted full-name row (display name lives in
       *  `Assets.name`; the real full name is revealed here on tap). */
      fullName: string
      revealShow: string
      revealHide: string
      revealLoading: string
      revealError: string
      genderMale: string
      genderFemale: string
    }
    pet: {
      sectionAtHome: string
      sectionHealth: string
      birthDate: string
      adoptedDate: string
      purchaseCost: string
      weight: string
      chipNo: string
      vet: string
      sexMale: string
      sexFemale: string
      sexUnknown: string
    }
    plant: {
      sectionRecord: string
      sproutedAt: string
      cost: string
      location: string
      waterEvery: string
      /** Template with `{n}` placeholder. */
      waterEveryValue: string
      companionDays: string
      daysSuffix: string
      sproutedSuffix: string
      /** Template with `{n}` placeholder. */
      waterEveryFooter: string
    }
    house: {
      sectionInfo: string
      address: string
      purchasedAt: string
      purchasePrice: string
      livingDays: string
      daysSuffix: string
      livingSuffix: string
    }
    insurance: {
      sectionContract: string
      sectionMaturity: string
      kind: string
      insured: string
      insurer: string
      policyNo: string
      payCycle: string
      expectedMaturity: string
      /** #166 — current account value for investment-linked savings policies. */
      accountValue: string
      startsAt: string
      endsAt: string
      /** Template with `{n}` placeholder. */
      termYearsParen: string
      /** Template with `{n}` placeholder. */
      termYearsLine: string
      expired: string
      coverageRemaining: string
      yearSuffix: string
      daysSuffix: string
      annualPremiumLabel: string
      /** Template with `{amount}` placeholder. */
      annualPremiumPrefix: string
      contractProgress: string
      /** Template with `{years}` placeholder. */
      yearsLeft: string
      matured: string
      /** Template with `{n}` and `{sum}` placeholders. */
      termAndSumLine: string
      kindLabels: {
        medical: string
        life: string
        accident: string
        cancer: string
        illness: string
        car: string
        savings: string
      }
      payCycleLabels: {
        annual: string
        semi: string
        quarterly: string
        monthly: string
      }
    }
    savings: {
      sectionPremium: string
      sectionReturn: string
      addReturn: string
      paymentEmpty: string
      returnEmptyBefore: string
      returnEmptyAwaiting: string
      /** Template with `{date}`. */
      heroNotStartedWithDate: string
      heroNotStarted: string
      /** Template with `{pct}` and `{years}`. */
      heroPartialWithYears: string
      /** Template with `{pct}`. */
      heroPartial: string
      /** Template with `{total}`. */
      heroMatured: string
      heroAwaitingMaturity: string
      /** Template with `{date}`. */
      heroNotYetActive: string
      heroLabelIn: string
      heroLabelOut: string
      heroPaymentLabel: string
      heroReturnLabel: string
      heroExpectedTag: string
      /** Template with `{received}`. */
      heroNoExpectedBar: string
      heroNoExpectedCta: string
      /** v0.15.0 #132 — Prefix for the per-bucket breakdown line under the
       *  「出」 progress bar, shown when at least two of
       *  maturity/dividend/survival_annuity have non-zero totals.
       *  The component appends bucket labels + NT$ amounts itself. */
      heroBreakdownPrefix: string
      /** Template with `{date}`. */
      maturingSoonTitle: string
      maturingSoonSubtitle: string
      maturingSoonCta: string
      /** Template with `{date}`. */
      maturedAwaitingTitle: string
      maturedAwaitingStatus: string
      maturedAwaitingCta: string
      /** Template with `{total}` and `{count}`. */
      maturedAwaitingPremiumNote: string
      /** #166 — informational hero row for investment-linked policies. */
      accountValueLabel: string
      accountValueEditCta: string
      /** #166 — RecurringIncome integration from SavingsView. */
      recurringSectionTitle: string
      recurringEmptyHint: string
      recurringAddCta: string
      /** Template with `{day}` and `{interval}`. */
      recurringRuleSummary: string
      recurringRuleNextDate: string
      recurringRulePaused: string
      recurringManageCta: string
    }
  }

  recurringExpense: {
    title: string
    back: string
    empty: {
      hint: string
      cta: string
    }
    rule: {
      pausedHint: string
      pausedAssetDeletedHint: string
      intervalEveryMonth: string
      intervalEveryQuarter: string
      intervalEveryHalfYear: string
      intervalEveryYear: string
      intervalEveryNMonths: string
      dayLabel: string
    }
    pending: {
      sectionLabel: string
      primaryAction: string
      editAction: string
      skipAction: string
      skipConfirm: string
      expandAll: string
      collapse: string
      /** Template with `{payer}` and `{splitType}` placeholders. */
      payerLine: string
    }
    sheet: {
      titleNew: string
      titleEdit: string
      amountLabel: string
      payerPrompt: string
      splitTypeLabel: string
      categoryLabel: string
      intervalLabel: string
      dayOfMonthLabel: string
      dayOfMonthFallbackHint: string
      dayAriaLabel: string
      dayFallbackTitle: string
      descriptionLabel: string
      descriptionPlaceholder: string
      startsOnLabel: string
      endsOnLabel: string
      assetLabel: string
      assetNone: string
      pauseAction: string
      resumeAction: string
      deleteRuleAction: string
      deleteConfirmTitle: string
      deleteConfirmDescription: string
    }
    errors: {
      amountRequired: string
      descriptionRequired: string
      saveFailed: string
      operationFailed: string
      deleteFailed: string
    }
    raceMessage: string
  }

  comingSoon: {
    /** Template with `{feature}` placeholder. */
    title: string
    subtitle: string
    backToHome: string
    features: {
      list: string
      fallback: string
    }
  }

  invite: {
    errorTitle: string
    backToHome: string
    /** Template with `{group}` placeholder, shown above invitee bilateral heading. */
    joiningGroupLabel: string
    /** Used when the inviter has no display name set. */
    fallbackInviter: string
    errors: {
      invalidOrExpired: string
      alreadyUsed: string
      revoked: string
      expired: string
      groupNotFound: string
      groupFull: string
      alreadyMember: string
      unknown: string
    }
  }

  offlineBanner: {
    text: string
  }

  offlinePage: {
    title: string
    subtitle: string
    linkDashboard: string
    linkRecords: string
    linkAssets: string
    footer: string
    /** HTML <title> for /offline (also surfaces in PWA cache fallback). */
    metadataTitle: string
  }

  termsPage: {
    heading: string
    /** Localized "Last updated: <date>" line. */
    lastUpdated: string
    intro: string
    /** Bullet list following the intro. */
    bullets: readonly string[]
    outro: string
    contactLinkLabel: string
    backHome: string
    privacyLink: string
  }

  privacyPage: {
    heading: string
    /** Localized "Last updated: <date>" line. */
    lastUpdated: string
    intro: string
    sectionCollectTitle: string
    sectionCollectItems: readonly string[]
    sectionPurposeTitle: string
    sectionPurposeItems: readonly string[]
    sectionStorageTitle: string
    sectionStorageBody: string
    sectionRetentionTitle: string
    sectionRetentionBody: string
    sectionThirdPartyTitle: string
    sectionThirdPartyItems: readonly string[]
    sectionRightsTitle: string
    sectionRightsBody: string
    outro: string
    contactLinkLabel: string
    backHome: string
    termsLink: string
  }

  monthlyReview: {
    /** Template with `{year}` `{month}`. */
    pageTitle: string
    backAriaLabel: string
    closeAriaLabel: string
    /** Banner heading template with `{month}` (1..12). */
    bannerHeading: string
    /** Banner heading when no message exists, with `{month}`. */
    bannerHeadingNoMessage: string
    /** Banner CTA template with `{month}`. */
    bannerCta: string
    /** Solo-mode banner heading variant with `{month}`. */
    bannerHeadingSolo: string
    /** Solo-mode banner heading no-message variant with `{month}`. */
    bannerHeadingSoloNoMessage: string
    /** Solo-mode CTA with `{month}`. */
    bannerCtaSolo: string
    /** Past-month read-only message section title. */
    pastMessagesTitle: string
    /** Author label fallback for past-month messages when display name absent. */
    pastMessageAuthorFallback: string
    /** Editor section heading. */
    editorTitle: string
    /** Solo-mode editor heading variant. */
    editorTitleSolo: string
    /** Editor textarea placeholder. */
    editorPlaceholder: string
    /** Counter template with `{n}` and `{max}`. */
    editorCounter: string
    /** Footer text shown when message is locked, with `{date}`. */
    lockedFooter: string
    /** Footer text shown while saving. */
    savingFooter: string
    /** Footer text shown after successful save. */
    savedFooter: string
    /** Footer error template, with `{message}`. */
    errorFooter: string
    /** Card 1 heading. */
    card1Title: string
    /** Card 1 body template with `{category}`, `{amount}`. */
    card1Body: string
    /** Card 1 solo body variant with `{category}`, `{amount}`. */
    card1BodySolo: string
    /** Card 2 heading. */
    card2Title: string
    /** Card 2 body template with `{name}`, `{description}`, `{amount}`. */
    card2Body: string
    /** Card 3 heading. */
    card3Title: string
    /** Card 3 expense total template with `{amount}`. */
    card3ExpenseTotal: string
    /** Card 3 income total template with `{amount}`. */
    card3IncomeTotal: string
    /** Card 4 heading. */
    card4Title: string
    /** Empty-card body lines (zero transactions). */
    emptyCardBody: string
    /** Empty-card CTA. */
    emptyCardCta: string
    /** Empty recurring events line. */
    emptyRecurring: string
    /** Empty asset breakdown line. */
    emptyAssetBreakdown: string
    /** Carousel page indicator template with `{current}` `{total}`. */
    carouselIndicator: string
    /** Direction label for income events in card 3. */
    incomeLabel: string
    /** Direction label for expense events in card 3. */
    expenseLabel: string
    /** Snapshot-not-yet-computed message (rare race). */
    snapshotNotReady: string
    /** Errors. */
    errors: {
      messageRequired: string
      messageTooLong: string
      saveFailed: string
      locked: string
    }
  }

  quiz: {
    /** Invitation card heading when no session exists yet. */
    cardHeadingInvitation: string
    /** Card heading when partner has answered but viewer hasn't. */
    cardHeadingSelfPendingPartnerDone: string
    /** Card heading when neither has answered yet (session exists). */
    cardHeadingSelfPendingPartnerPending: string
    /** Card heading when viewer is waiting on partner; uses `{partnerName}`. */
    cardHeadingSelfDonePartnerPending: string
    /** Card heading after both reveal — uses {partnerName}. */
    cardHeadingRevealed: string
    /** CTA on the invitation / pending-self card variants. */
    cardCtaStart: string
    /** CTA on the revealed card variant. */
    cardCtaReveal: string
    /** Eyebrow above the question on the answer page. */
    answerEyebrow: string
    /** Progress indicator template with `{current}` `{total}`. */
    answerProgress: string
    /** Continue button on Q1/Q2 of the answer page. */
    answerCta: string
    /** Submit button on the final question. */
    answerCtaFinal: string
    /** Inline error when user tries to continue without selecting. */
    answerErrorChooseOne: string
    /** Back link / aria label on the answer page. */
    answerBack: string
    /** Page heading on the waiting (self-done, partner-pending) screen. */
    waitingHeading: string
    /** Body line on the waiting screen. */
    waitingBody: string
    /** Link back to review page from waiting / reveal. */
    waitingBackToReview: string
    /** Reveal page heading. */
    revealHeading: string
    /** Reveal time line — template with `{date}`. */
    revealedAtLine: string
    /** Caption shown when both members chose the same option. */
    revealSameAnswer: string
    /** Closing 60–80 char framing paragraph on the reveal screen. */
    revealFraming: string
    /** Header label for member A column. */
    revealHeaderA: string
    /** Header label for member B column. */
    revealHeaderB: string
    /** Fallback rendered when viewer is solo (member_b IS NULL). */
    soloFallback: string
    /** Generic error: session doesn't exist or doesn't belong to viewer. */
    errorNotFound: string
    /** Errors thrown by submitPartnerQuizAnswers / startPartnerQuizSession. */
    errors: {
      submitFailed: string
      alreadyAnswered: string
      solo: string
    }
    /** Question pool — 6 keys, each with prompt + 3 lettered choices. */
    questions: {
      impulse:           { prompt: string; choices: { a: string; b: string; c: string } }
      risk:              { prompt: string; choices: { a: string; b: string; c: string } }
      transparency:      { prompt: string; choices: { a: string; b: string; c: string } }
      big_purchase:      { prompt: string; choices: { a: string; b: string; c: string } }
      future:            { prompt: string; choices: { a: string; b: string; c: string } }
      recording_motive:  { prompt: string; choices: { a: string; b: string; c: string } }
    }
  }

  inAppBrowser: {
    /** Heading on the full-screen blocker. */
    title: string
    /** Body explaining why we block (Google login + offline don't work in WebViews). */
    description: string
    /** Section label above the URL block. */
    urlLabel: string
    /** Default state of the copy button. */
    copy: string
    /** State of the copy button after success. */
    copied: string
    /** iOS-only: button that tries `x-safari-https://` to jump to Safari. */
    openInSafari: string
    /** Generic hint shown below the copy/jump action. */
    instructionGeneric: string
    /** iOS-specific hint (Safari is the only supported browser for OAuth). */
    instructionIos: string
    /** Android-specific hint. */
    instructionAndroid: string
  }

  /** Platform-aware "Add to Home Screen" bottom sheet. Surfaced after the
   *  first /setup completion (if not already a PWA) and re-openable from
   *  /settings → 加到主畫面. */
  installGuide: {
    /** Sheet header — matches the settings row label. */
    title: string
    /** Header left button. */
    close: string
    /** Intro paragraph above the platform-specific steps. */
    intro: string
    /** iOS Safari (the only iOS browser that supports A2HS). Step 1 ends with
     *  the share-icon JSX; the icon is rendered by the component, not the
     *  string, so the text here intentionally has no trailing space. */
    iosSafari: {
      step1: string
      /** Contains `<strong>` — rendered via dangerouslySetInnerHTML. */
      step2Html: string
      /** Contains `<strong>` — rendered via dangerouslySetInnerHTML. */
      step3Html: string
    }
    /** iOS users in non-Safari browsers — we can't install from here, so we
     *  show a copy-link affordance and instructions to switch to Safari. */
    iosOther: {
      /** Contains `<strong>` — rendered via dangerouslySetInnerHTML. */
      bodyHtml: string
      copy: string
      copied: string
    }
    /** Android (Chrome / Edge / Samsung). */
    android: {
      step1: string
      /** Contains `<strong>` — rendered via dangerouslySetInnerHTML. */
      step2Html: string
      step3: string
    }
    /** Desktop (Chrome / Edge install button in the URL bar). */
    desktop: {
      step1: string
      step2: string
      step3: string
    }
    /** Unknown platform — generic instruction. Contains `<strong>`. */
    fallbackHtml: string
  }

  /** Shared shell + tool strings for the /migrate/<source> SEO landing pages.
   *  Per-source SEO copy (title / h1 / body) lives in seo.migrate.* below;
   *  this block is the upload / preview / CTA scaffolding reused across all
   *  three pages. Anonymous + client-side — no bytes leave the browser. */
  migrate: {
    /** Top-bar back link to the main Futari landing. */
    backToHome: string
    upload: {
      /** Drag-drop zone prompt (mobile shows just the button). */
      prompt: string
      /** File-picker button. */
      button: string
      /** Footnote under the picker — emphasizes privacy. */
      constraint: string
      /** Status shown while parsing. */
      parsing: string
      /** Generic parse failure message. */
      error: string
      /** Reset link after error or successful preview. */
      retry: string
    }
    preview: {
      /** Section heading above the stats. */
      title: string
      /** Label for the detected source row. Replace `{source}` with sources.*. */
      sourceLabel: string
      /** Label for detected encoding row. Replace `{encoding}` literally. */
      encodingLabel: string
      /** Total parsed rows. Replace `{count}`. */
      totalRowsLabel: string
      /** Estimated expense rows (negative-amount heuristic). Replace `{count}`. */
      expenseRowsLabel: string
      /** Date span. Replace `{first}` / `{last}` with raw date strings. */
      dateRangeLabel: string
      /** Heading for the top-categories list. */
      topCategoriesLabel: string
      /** Empty state — file parsed but has zero rows. */
      empty: string
    }
    cta: {
      /** Primary button → sign-in with `?from=<source>` query. */
      button: string
      /** Sub-copy under the CTA — what happens after sign-up. */
      hint: string
      /** Reassurance line shown below upload + CTA. */
      privacyNote: string
    }
    sources: {
      /** Fallback shown when header sniffer + page hint both fail. */
      unknown: string
    }
    /** Section kicker above the "Why Futari" differentiators block. */
    differentiatorsHeading: string
    /** Heading above the FAQ block on every /migrate/<source> page (#599). */
    faqHeading: string
    /** Heading template for the comparison table. Contains `{other}` —
     *  replaced with the source brand name per page. e.g. "Futari vs {other}". */
    comparisonHeading: string
    /** Closing trust block — narrative + 3 items, mounted between
     *  steps and footer on every /migrate/<source> page (#578). */
    trust: {
      heading: string
      items: readonly [
        { title: string; body: string },
        { title: string; body: string },
        { title: string; body: string },
      ]
    }
    /** Slim footer trust copy (mirrors landing footer). */
    footerTrust: string
    /** Cross-link block shown above the trust block on every /migrate/<source>
     *  page (#612). Each source page renders the *other two* as cards so users
     *  who landed on the wrong page can pivot without going back through search. */
    otherSources: {
      /** Section kicker above the two cards. */
      heading: string
      /** Per-source CTA label (same string reused on all cards). */
      cta: string
      /** Per-source short blurb used in both the card body and the
       *  ItemList JSON-LD description. */
      items: {
        honeydue: { name: string; description: string }
        spendee: { name: string; description: string }
        cwmoney: { name: string; description: string }
        moneybook: { name: string; description: string }
        andromoney: { name: string; description: string }
        mobills: { name: string; description: string }
        manebo: { name: string; description: string }
        'simple-daily-money': { name: string; description: string }
        'fortune-city': { name: string; description: string }
        cashman: { name: string; description: string }
        '1money': { name: string; description: string }
        icost: { name: string; description: string }
        suishouji: { name: string; description: string }
      }
    }
    /** Shared screenshot→ChatGPT→CSV walkthrough (#839 P2) — used by
     *  /migrate/simple-daily-money and any future non-CSV-export source. */
    chatgptWorkflow: {
      heading: string
      intro: string
      substeps: readonly [string, string, string, string]
      promptLabel: string
      prompt: string
      copy: string
      copied: string
      formatLabel: string
      formatExample: string
      note: string
    }
    /** Per-source landing page copy — hero + 3-step walkthrough + optional
     *  per-source extras (e.g. honeydue.intro, cwmoney.templateDownloadLabel).
     *  Hero h1 / steps live here; SEO `<title>`/`<meta>` live in seo.migrate.*. */
    pages: Record<import('@/lib/migrate/sources').MigrateSlug, MigrateBasePageCopy>
  }

  /** Per-page SEO strings — title / description / ogDescription used by
   *  generateMetadata in each app/[locale]/*\/page.tsx. Not rendered in UI. */
  seo: {
    landing: {
      title: string
      description: string
      ogDescription: string
    }
    signIn: {
      title: string
      description: string
      ogDescription: string
    }
    terms: {
      title: string
      description: string
    }
    privacy: {
      title: string
      description: string
    }
    /** SEO copy for the per-source /migrate landing pages. */
    migrate: Record<import('@/lib/migrate/sources').MigrateSlug, {
      title: string
      description: string
      ogDescription: string
    }>
    /** SEO copy for /use-case/* situational landing pages (#851). */
    useCase: Record<import('@/lib/use-case/cases').UseCaseSlug, {
      title: string
      description: string
      ogDescription: string
    }>
  }

  /** Shared shell + per-slug copy for /use-case/* situational SEO pages (#851).
   *  80% shared structure; slug-specific fields are heroTitle, heroSubtitle,
   *  painPoints, features copy, faq. */
  useCase: {
    /** Top-bar back link. */
    backToHome: string
    /** Feature highlight labels — shared across all slugs. */
    features: {
      split: { title: string; body: string }
      trip: { title: string; body: string }
      asset: { title: string; body: string }
      realtime: { title: string; body: string }
      encrypt: { title: string; body: string }
      history: { title: string; body: string }
    }
    /** Shared section headings. */
    featuresHeading: string
    faqHeading: string
    ctaLabel: string
    otherCases: {
      heading: string
      cardAriaLabel: string
    }
    /** Per-slug copy. */
    pages: Record<import('@/lib/use-case/cases').UseCaseSlug, {
      heroKicker: string
      heroTitle: string
      heroSubtitle: string
      painPoints: readonly [
        { heading: string; body: string },
        { heading: string; body: string },
        { heading: string; body: string },
      ]
      faq: readonly [
        { question: string; answer: string },
        { question: string; answer: string },
        { question: string; answer: string },
      ]
    }>
  }
}

export const zhTW: Translations = {
  signIn: {
    tagline: '帳本準備好了，邀請對方一起。',
    continueWithGoogle: '以 Google 帳號繼續',
    termsPrefix: '繼續即表示您同意我們的',
    termsLink: '服務條款',
    termsAnd: '與',
    privacyLink: '隱私權政策',
    // intentionally empty — 中文句子在「政策」名詞處自然收尾，無需 SOV 收尾詞
    termsSuffix: '',
    about: {
      s1Heading: '情侶 AA 制記帳，到底有沒有更好的辦法？',
      s1Body: [
        '我和太太在結婚前就開始 AA 了。那幾年試過不少 app——有的介面很漂亮，有的功能很齊全，但用到後來都有點卡。不是功能不夠，是每次打開來，都感覺那個 app 是設計給一個人用的。你得自己建群組、自己設分帳、自己追誰欠誰多少，像是把一個個人記帳工具硬拗成雙人用途。',
        '後來我就想，要不自己做一個。不是要做什麼偉大的產品，只是想要一個從一開始就假設「使用者是兩個人」的記帳工具。這就是 Futari 的起點。',
      ],
      s2Heading: '新婚夫妻的生活費怎麼分攤才不傷感情？',
      s2Body: [
        '每對伴侶的收入結構都不一樣，分攤方式也不會只有一種答案。',
        '有些人習慣對半切，一人一半，乾淨俐落；有些人薪水差距比較大，按比例比較公平——這個月你賺比較多，你多出一點，不是什麼大事，就是現實。也有人輪流結帳，「這頓我的，下頓你的」，或是某一方習慣負擔某類支出，另一方負擔另一類。',
        '我和太太現在是混用的：固定開銷按比例，出去吃飯有時候對半，出遊就另立帳本。沒有哪種方式最好，只有哪種方式最適合你們現在的狀態。Futari 支援這四種模式，不是要幫你決定怎麼分，而是讓你們選定之後，帳能記清楚。',
      ],
      s3Heading: '我們以前用 Excel 記旅行帳，直到有了旅行子帳本',
      s3Body: [
        '出國旅行是最容易讓帳亂掉的場景。平常 AA 已經記得差不多了，一出國，訂房他付、計程車我付、行程中間各種零碎消費——回來之後不知道誰多出了多少，要對帳就得翻回去一筆一筆找。',
        '我們以前的解法是開一個旅行專用的 Excel，回國再手動整理。有用，但麻煩，而且有幾次根本懶得整理就算了。',
        '旅行子帳本是我在做 Futari 的過程中最興奮的功能之一。旅行的錢跟日常帳分開，回來之後清楚看到這趟誰出了多少、差多少，一目瞭然。下次計畫旅行，還可以翻回來看上次的開銷大概是什麼量級，很實用。',
      ],
      s4Heading: '車輛費用怎麼跟日常帳分開又不失聯？',
      s4Body: [
        'PTT 的記帳版偶爾會看到有人問：車輛相關的費用要怎麼記？油錢、停車、保養、保險——這些支出的頻率和金額都不規律，混在日常帳裡很快就看不清楚，但又不想開太多帳本搞得更複雜。',
        'Futari 的設計是讓每筆支出可以關聯車輛，油耗也可以順手記下來。日常帳和車輛帳不是完全切開的兩件事，而是同一筆支出多了一個標記。想看這個月車花了多少，篩一下就出來了；不想特別管，正常記帳就好。',
        '如果你們有一台共同的車，這個設計應該會讓你鬆一口氣。',
      ],
      s5Heading: '每一筆支出背後，都是一個「我記得」',
      s5Body: [
        '幫對方買的那罐面膜、順路加的油、繳掉的網路費——這些事情如果只是數字，幾天後就什麼都不剩了。',
        'Futari 的每筆帳都可以留一句話。不需要很長，就是讓那筆帳有一點點重量。「妳說要試試看的」、「下雨天出去買的」、「你去出差那週」。記帳的人知道為什麼記，看帳的人也看得見那個當下。',
        '月底的帳目回顧，我比較不想把它叫做「對帳」。對帳聽起來像是在找問題、分配責任。我更想把它理解成：這個月你們一起做了什麼、去了哪裡、為彼此花了什麼。那些數字串起來，是一段共同生活的記錄。',
        '為你花的錢，我想讓你看見。',
      ],
      s6Heading: '記帳 app 會不會突然消失？我們的資料怎麼辦？',
      s6Body: [
        '這個擔心很合理。Honeydue 這幾年慢慢式微，Spendee 曾經讓用戶的資料憑空消失——如果你被這些事嚇過，你的警覺是對的。',
        'Futari 是我自己每天在用的工具，這是最直接的「有人在維護」的證明。不是說它永遠不會出問題，而是說背後有一個真實的人在意它能不能用。',
        '資料方面，Futari 支援 CSV 匯出。任何時候你想把資料帶走，都可以。我不想用「我們不會消失」這種話來說服你，但我可以告訴你：你的資料不會被綁住。',
      ],
      s7Heading: 'Futari 是什麼，也是什麼不是',
      s7Body: [
        'Futari 是雙人優先的記帳工具。進來的就是兩個人共同的帳，沒有「我的帳」和「你的帳」的能見度分級，也沒有誰有權限、誰沒有權限的設計。這個選擇是刻意的——伴侶之間的帳，應該是共同的。',
        'Futari 不評判你們怎麼花錢。它不會推播「你這個月超支了」，不會給你消費評分，不會建議你少喝一杯咖啡。你們的消費習慣是你們自己的事。',
        '它也不是一個要幫你們「優化財務」的工具。它只是想陪著你們記下共同生活的每一筆帳，不多，也不少。',
      ],
      moreStoriesHint: 'Futari 還有 6 個故事，下次再來會是另一個。',
    },
    features: {
      c1Title: '今天誰付的？',
      c1Body: '日常 AA 不用靠記憶。每筆帳記下來，餘額自動算，誰欠誰多少一眼就清楚。',
      c2Title: '出國帳不跟日常混',
      c2Body: '旅行子帳本獨立記帳，回來清楚看這趟誰多付了多少，不用再翻聊天記錄對帳。',
      c3Title: '這筆是幫你買的',
      c3Body: '每筆帳可以留一句話。讓那個「順手幫你繳的」不只是數字，是一句記得。',
      c4Title: '你們的帳，只有你們看得到',
      c4Body: '沒有「我的帳」跟「你的帳」之分。進來的就是共同的，沒有能見度分級。',
    },
    blog: {
      heading: '開發日誌',
    },
    srTagline: ' · 兩個人的家計簿｜伴侶／夫妻共享記帳 PWA',
    srDescription:
      '專為伴侶、夫妻設計的雙人共享帳本。一起記錄日常開銷、自動分攤費用與 AA 制結算，掌握家庭預算、資產盤點、保險與愛車油耗紀錄。',
    installHint: {
      cta: '也可以先加到主畫面',
      iosStep1: '點底部正中間的分享按鈕',
      iosStep2: '往下捲動，選「加入主畫面」',
    },
  },

  landing: {
    heroKicker: 'A COUPLE\'S LEDGER',
    taglineHtml: '兩個人，<br />一本帳。',
    bodyHtml: '為伴侶與夫妻設計的共同記帳。<br />日子一天天記下來，回頭看會很暖。',
    cta: '一起記錄',
    ctaHint: '免費 · 不需註冊就能體驗 · 兩人共同使用',
    alreadyHaveAccount: '已經有帳號 · 登入',
    trustEncrypted: '端對端加密',
    trustFree: '免費使用',
    trustPwa: 'iOS / Android / Web PWA',
    trust: {
      narrative: '你的記錄只屬於你們兩個人。我們不靠廣告，不賣資料。',
      encryption: {
        title: '端對端加密',
        body: '資料傳輸與儲存全程加密，連我們自己也讀不到內容。',
      },
      portability: {
        title: '隨時帶走',
        body: 'CSV 匯出，資料永遠是你的。想離開時不會被綁在這裡。',
      },
      forever: {
        title: '永久免費',
        body: '核心功能不收費，沒有隱藏條款。',
      },
    },
    featuresKicker: 'INSIDE ──',
    featuresTitle: '一本帳，承接生活的四種光',
    featuresSubtitleHtml: '從第一筆共同支出，到一起照顧的房子、車與每年保單，<br />都收進同一本帳裡。',
    f1Title: '雙人記帳',
    f1Body: '一筆一筆共同記下，自動分攤，可以對半也可以依比例。每月清楚結算，不必再對帳。',
    f2Title: '我們的愛物',
    f2Body: '家、車、孩子、寵物、植物，一起照顧的，都收進同一本帳，每筆相關支出自動歸戶。',
    f3Title: '守護保險',
    f3Body: '保護型、儲蓄型保單分頁，被保人、受益人、續期日，一頁看完每一份為對方留下的安排。',
    f4Title: '記帳統計',
    f4Body: '月度回顧、分類分佈、章節歷史。讓花過的錢自己說故事，一起回頭看走過的日子。',
    useCaseSection: {
      kicker: 'MADE FOR YOU ──',
      title: 'Futari 是為哪些人做的？',
      subtitle: '不只是記帳工具，而是你們生活情境的陪伴。',
      cohabitationTitle: '同居情侶',
      cohabitationBody: '同居生活費怎麼分最不傷感情？AA、按比例、任你選。',
      newlywedsTitle: '新婚夫妻',
      newlywedsBody: '結婚之後從日常帳本到愛物，一起看見兩個人的生活全貌。',
      petOwnersTitle: '寵物家庭',
      petOwnersBody: '毛孩的每一筆費用都值得被記住，清楚看見兩個人的心意。',
      cardAriaLabel: '了解 {slug} 情境',
    },
    migrateSection: {
      kicker: 'FROM ELSEWHERE ──',
      title: '本來在用別的記帳工具？',
      subtitle: '原本記過的不用再記一次，把資料帶過來繼續寫。',
      honeydueTitle: '從 Honeydue 搬過來',
      honeydueBody: '更新節奏放緩了？把這幾年的記錄整批帶過來。',
      spendeeTitle: '從 Spendee 搬過來',
      spendeeBody: '雙人共享是內建免費的，不必再解鎖付費方案。',
      cwmoneyTitle: '從 CWMoney 搬過來',
      cwmoneyBody: '附上 Excel → CSV 範本，幾分鐘就能搬完。',
      cardAriaLabel: '從 {source} 搬到 Futari',
    },
    footerTrust: '端對端加密 · 資料只屬於你們兩個',
    jsonLdAppName: 'Futari · ふたり',
    jsonLdAlternateNames: ['Futari 家計簿', '情侶記帳 app', '夫妻記帳', '兩個人的家計簿', 'ふたり 家計簿', "Futari · couple's ledger"],
    jsonLdAppDescription:
      '專為伴侶、夫妻設計的雙人共享帳本。一起記錄日常開銷、自動分攤費用與 AA 制結算，掌握家庭預算、資產盤點、保險與愛車油耗紀錄。',
    jsonLdFeatureList: [
      '雙人共享記帳',
      '費用自動分攤與 AA 結算',
      '家庭資產盤點',
      '保險方案（保護型／儲蓄型）',
      '汽車與油耗紀錄',
      '定期收入',
      '離線瀏覽 PWA',
    ],
    jsonLdFaq: [
      {
        question: 'Futari 是什麼？',
        answer:
          'Futari 是專為夫妻、伴侶設計的雙人共享記帳 PWA，支援自動分攤、AA 結算、家庭資產盤點與愛車油耗紀錄。',
      },
      {
        question: '如何開始使用？',
        answer:
          '用 Google 帳號登入後建立兩人帳本，邀請伴侶加入即可一起記帳。可加到手機主畫面當 PWA 使用，完全免費。',
      },
      {
        question: '資料安全嗎？',
        answer:
          '所有資料儲存於 Supabase 加密資料庫，僅你和伴侶兩人能存取。我們不會分享或販售你的記帳內容。',
      },
    ],
    phoneMockBalanceCaption: 'YOU OWE T',
    phoneMockBalancePeriod: '本月 · 5 月',
    phoneMockFeed1Title: '晚餐 · 麻辣鍋',
    phoneMockFeed1Sub: '今天',
    phoneMockFeed2Title: '電費',
    phoneMockFeed2Sub: '昨天',
    phoneMockFeed3Title: '小白看醫生',
    phoneMockFeed3Sub: '5/11',
  },

  common: {
    cancel: '取消',
    save: '儲存',
    update: '更新',
    saving: '儲存中…',
    processing: '處理中…',
    delete: '刪除',
    confirm: '確認',
    done: '完成',
    me: '我',
    partner: '對方',
    you: '你',
    all: '全部',
    error: '發生錯誤',
    offlineError: '目前離線中，等網路回來再試一次',
    back: '返回',
    edit: '編輯',
    shared: '共用',
    none: '無',
    deleteSoftDescription: '這個動作無法復原，但帳本歷史會保留 30 天可由開發者還原。',
    toast: {
      recorded: '已記錄 NT${amount}',
      updated: '已更新 NT${amount}',
      deleted: '已刪除這筆',
    },
    navigation: {
      next: '下一步',
      back: '上一步',
      confirm: '確認',
      cancel: '取消',
      retry: '重試',
    },
  },

  splitType: {
    even: '平分',
    allMine: '全部我的',
    allPartners: '全部對方的',
    mine: '我的',
    theirs: '對方的',
    weighted: '依比例分',
  },

  category: {
    dining: '飲食',
    clothing: '服飾',
    housing: '居住',
    transit: '交通',
    education: '教育',
    entertainment: '娛樂',
    health: '醫療',
    financial: '金融',
    other: '其他',
    settle: '還款',
  },

  incomeCategory: {
    salary: '薪水',
    bonus: '獎金',
    maturity: '滿期還本',
    dividend: '分紅',
    survival_annuity: '生存金',
    claim: '保險理賠',
    gift: '紅包禮金',
    refund: '退稅',
    sidehustle: '副業',
    other: '其他',
  },

  feed: {
    header: '最近紀錄',
    noFiltered: '沒有符合條件的紀錄',
    noRecordsTitle: '還沒有紀錄',
    noRecordsHint: '從第一筆開始 ─ 一杯咖啡、一頓晚餐都算數。日子一天天記下來，回頭看會很暖。',
    addFirst: '記第一筆',
    noIncome: '還沒記過家裡的收入',
    noFilteredAddHint: '這裡還沒有紀錄，按下方 + 開始記吧。',
  },

  firstRecordCard: {
    headline: '你們的第一筆。這是個開始，不是考試。',
    dismiss: '明白了',
    closeAriaLabel: '關閉提示',
  },

  modeToggle: {
    expense: '支出模式',
    income: '收入模式',
  },

  payerToggle: {
    label: '誰付的？',
  },

  dashboard: {
    soloHint: '目前是你一個人在記',
    inviteCta: '邀請對方 →',
    addExpense: '新增一筆',
    addIncome: '記一筆收入',
    filterLabel: '篩選',
    filterAriaLabel: '開啟篩選',
    burdenMe: '算我的',
    burdenPartner: '算對方的',
    headerHint: {
      trip: '旅行',
      settings: '設定',
    },
    activeTripBanner: {
      kicker: '旅行進行中',
      singleStartedAt: '{date} 起 · 點開看這趟',
      singleStartedAtWithCurrency: '{date} 起 · {currency} · 點開看這趟',
      singleAriaLabel: '進入旅行：{name}',
      multipleHeading: '{count} 段旅行進行中',
      multipleCta: '一起翻 ›',
      multipleAriaLabel: '查看 {count} 段進行中的旅行',
      emptyCta: '開始一段旅行',
      addAriaLabel: '新增旅行',
      collapseAriaLabel: '收合旅行卡',
      expandAriaLabel: '展開旅行卡',
    },
  },

  balanceHero: {
    monthlyIncome: '本月收入',
    countLabel: '筆數',
    countSuffix: '筆',
    recent: '最近',
    noRecord: '尚無紀錄',
    manage: '查看 ›',
    settleAriaLabel: '記錄還款 / 收款',
    settleLabel: '結算',
    partnerOwesYou: '待還你',
    youOwePartner: '待還對方',
    currentlyEven: '打平',
    currentlyLabel: '目前',
    modeSettledLabel: '現在',
    modeIncludePendingLabel: '結算後',
    modeToggleAriaLabel: '切換 顯示「現在」或「結算後」金額',
  },

  soloBanner: {
    waiting: '帳本準備好了，邀請對方一起',
    sendInviteHint: '把連結傳給對方',
    dismissAriaLabel: '關閉提示',
    generating: '產生中…',
    sendInvite: '傳送邀請',
    sharedAndCopied: '已分享，連結也已複製',
    copied: '已複製連結',
  },

  addSheet: {
    title: '新增紀錄',
    titleEdit: '編輯紀錄',
    amount: '金額',
    descPlaceholder: '描述（例：晚餐、雜貨）',
    descSuggestions: '描述建議',
    category: '分類',
    assetLink: '關聯愛物（選填）',
    splitMethod: '分攤方式',
    date: '日期',
    notesLabel: '備註（選填，兩人都看得到）',
    notesPlaceholder: '寫一句留給對方的話，或之後想記得的事',
    statusLabel: '狀態',
    statusSettled: '已付清',
    statusPending: '待結算',
    statusPendingHint: '待結算的紀錄不會算進兩個人的結算，確認付款後再改為已付清。',
    deleteOne: '刪除這筆',
    deleteConfirmTitle: '刪除這筆紀錄？',
    currency: '幣別',
    trip: '旅行',
    noTrip: '無旅行',
    errors: {
      amountRequired: '請輸入金額',
      amountTooLarge: '金額不能超過 {max}',
      descriptionRequired: '請輸入描述',
      noPartner: '伴侶尚未加入',
    },
  },

  compactRow: {
    pendingBadge: '待結算',
    iSettled: '我還款',
    partnerSettled: '{name} 還款',
    youIncome: '你收入',
    partnerIncome: '{name} 收入',
    youPaid: '你付',
    partnerPaid: '{name} 付',
    trillion: '兆',
    hundredMillion: '億',
  },

  transactionFeed: {
    loading: '載入中…',
    loadMore: '載入更多',
    endOfFeed: '已是最早的紀錄',
    closeAriaLabel: '關閉',
    settlementFallback: '還款',
  },

  partnerToast: {
    recordedExpense: '{name} 剛剛記了一筆',
    recordedIncome: '{name} 剛剛記了一筆進帳',
  },

  bottomNav: {
    home: '首頁',
    records: '紀錄',
    assets: '愛物',
    settings: '設定',
    addAriaLabel: '新增一筆',
    navAriaLabel: '主要導覽',
  },

  miniCalendar: {
    prevMonth: '上個月',
    nextMonth: '下個月',
    prevYear: '上一年',
    nextYear: '下一年',
    prevDecade: '上一個十年',
    nextDecade: '下一個十年',
    selectMonth: '選擇月份',
    selectYear: '選擇年份',
    splitRatioAriaLabel: '分擔比例',
    dayViewTitle: '{year} 年 {month} 月 ˅',
    monthViewTitle: '{year} 年 ˅',
    monthLabel: '{month} 月',
    weekdays: ['日', '一', '二', '三', '四', '五', '六'],
  },

  splitTypeSelector: {
    groupAriaLabel: '分擔方式',
    ratioAriaLabel: '分擔比例',
    evenSub: '各付一半',
    partnerOwesYouAmount: '對方待還你 {amount}',
    youOwePartnerAmount: '你待還對方 {amount}',
    ratioNoAmount: '我 {me}%・對方 {other}%',
    allMineSelfPaid: '你自己花的，不會欠款',
    allMinePartnerPaid: '對方自己花的，不會欠款',
    allTheirsNoAmount: '對方欠你全額',
    allTheirsPartnerNoAmount: '你欠對方全額',
    allTheirsYouPaid: '對方欠你 {amount}',
    allTheirsPartnerPaid: '你欠對方 {amount}',
    meRatio: '我 {ratio}%',
    partnerRatio: '對方 {ratio}%',
  },

  pendingIncomeStack: {
    heading: '這幾筆等你看看',
    collapse: '收合',
    expand: '展開全部（還有 {count} 筆）',
  },

  pendingIncomeCard: {
    confirm: '就這樣',
    edit: '改一下',
    skip: '跳過',
    skipTitle: '跳過 {date} {name}？',
    skipDescription: '這一期就不會出現在帳上，下一期照常提醒。',
    confirmError: '確認失敗',
    skipError: '跳過失敗',
  },

  logoutButton: {
    label: '登出',
    pending: '登出中…',
    title: '登出 Futari？',
    description: '下次需要重新用 Google 登入。未邀請對方加入的紀錄不會遺失。',
  },

  splitRatioSection: {
    meSuffix: '（我）',
    partnerSuffix: '（對方）',
  },

  errorPage: {
    retry: '重試',
    subtitle: '請稍後再試一次',
    dashboard: '載入儀表板失敗',
    records: '載入紀錄失敗',
    settings: '載入設定失敗',
    trips: '載入旅行失敗',
    assets: '載入愛物失敗',
    review: '載入月度回顧失敗',
    refLabel: '錯誤代碼',
  },

  assetListItem: {
    savingsBadge: '儲蓄',
    thisMonth: '本月',
    insuranceGroups: {
      shortTermProtection: '保護型 · 一年期',
      longTermProtection: '保護型 · 多年期',
      savings: '儲蓄型',
    },
  },

  tripList: {
    title: '旅行',
    subtitle: '一趟一趟收下來，這段路就有自己的章節。',
    sectionActive: '進行中',
    sectionPast: '過去的旅行',
    endedTag: '已結束',
    dateRangeActive: '{startDate} 起,進行中',
    backAriaLabel: '返回旅行列表',
    empty: {
      heading: '還沒有旅行紀錄',
      body: '建一趟旅行，這段日子裡的每筆支出，就會自動收進來，回來再一起翻。',
    },
  },

  tripSheet: {
    titleNew: '建立旅行',
    titleEdit: '編輯旅行',
    saveNew: '開始這趟',
    saveEdit: '保存變更',
    errors: {
      createFailed: '建立失敗',
      updateFailed: '更新失敗',
      codeBlank: '請輸入幣別代碼',
      codeDuplicate: '幣別不可重複',
      rateInvalid: '匯率必須是正數',
      rateInvalidInline: '請輸入大於 0 的匯率',
      maxCurrencies: '最多 {max} 個幣別',
    },
    nameLabel: '名稱',
    namePlaceholder: '例：東京 5 日',
    startDateLabel: '起始日',
    endDateLabel: '結束日（可選）',
    endBeforeStart: '結束日不可早於起始日',
    currenciesSectionTitle: '幣別與匯率',
    currenciesHint: '勾選這趟用得到的幣別。每行填「1 個此幣別 = 幾個基礎貨幣」(例：1 JPY ≈ 0.2 TWD)。改了匯率，舊紀錄保留當時的金額，只影響之後新增的紀錄。',
    currencyCountFormat: '{n} / {max}',
    addCustomCta: '+ 自訂幣別',
    footerNote: '這趟期間記錄的支出，會自動掛在這次旅行底下。',
    rateInverseFormat: '≈ 1 {default} = {inverse} {code}',
    basePill: '基礎貨幣',
    usedCountNote: '已記過 {n} 筆；改匯率不影響舊紀錄',
    customRow: {
      codeAriaLabel: '幣別代碼',
      codePlaceholder: 'VND',
      labelAriaLabel: '顯示名稱',
      labelPlaceholder: '越南盾（可選）',
      removeAriaLabel: '移除幣別',
    },
    presetLabels: {
      TWD: '台幣',
      CNY: '人民幣',
      USD: '美元',
      JPY: '日圓',
    },
  },

  tripDetail: {
    emptyActive: '這趟還沒有任何紀錄。點右下角的加號從這裡開始記。',
    emptyEnded: '這趟沒有留下任何紀錄。',
    currencyBreakdown: '幣別分擔',
    recordsSuffix: '筆',
    perSideContribution: '誰付了多少',
    youPaid: '你付了',
    partnerPaid: '{name} 付了',
    share: '分擔',
    perSideHint: '只計入已落地的紀錄;待結算的還沒進結算。',
    endTitle: '結束這趟旅行',
    endBody: '結束之後這趟還會留在列表裡,只是不再接新的紀錄。日期之後還能再編輯。',
    endDateLabel: '結束日',
    endConfirm: '確認結束',
    endDateBeforeStart: '結束日不可早於起始日({date})',
    endFailure: '結束失敗',
    editAriaLabel: '編輯這趟旅行',
    endIrreversibleNote: '結束之後無法復原。這趟的支出會以總結算的形式回到主帳本。',
    totalLabel: '這趟一共花了',
    baseCurrencyTag: '基礎貨幣 {code}',
    baseCurrencyTagTitle: '這趟以這個幣別結算',
    recordsCountLabel: '這趟的紀錄 · {n} 筆',
  },

  incomeSheet: {
    title: '記一筆收入',
    titleEdit: '編輯這筆收入',
    amountLabel: '收入金額',
    recipientPrompt: '誰的收入？',
    categoryLabel: '類別',
    policyLink: '關聯保單',
    selectPolicy: '選擇對應保單',
    maturityHint: '此筆會記入該保單的「拿回」累計',
    claimHint: '此筆會記入該保單的「理賠」紀錄',
    noPolicy: '尚無保單',
    insuranceBadge: '保險',
    noteLabel: '備註（選填）',
    notePlaceholder: '寫一句留給對方的話，或之後想記得的事',
    deleteIncome: '刪除這筆收入',
    deleteConfirmTitle: '刪除這筆收入？',
    errors: {
      amountRequired: '請輸入金額',
      amountTooLarge: '金額不能超過 {max}',
      saveFailed: '儲存失敗',
      missingPendingId: '缺少待確認收入 id',
    },
  },

  settlement: {
    debtorTitle: '我還多少？',
    creditorTitle: '{name} 還了 多少？',
    primaryRepay: '記錄還款',
    primaryReceive: '記錄收款',
    amountAriaLabel: '還款金額',
    editTitle: '編輯還款',
    amountLabel: '金額',
    dateLabel: '日期',
    deleteOne: '刪除這筆',
    deleteConfirmTitle: '刪除這筆還款？',
    errors: {
      exceedsDebt: '金額不能超過欠款',
      amountRequired: '請輸入金額',
      noPartner: '伴侶尚未加入',
    },
  },

  editTextSheet: {
    errorEmpty: '不能為空',
    saveFailed: '儲存失敗',
  },

  assetPickerSheet: {
    title: '選擇愛物',
    tablistAriaLabel: '選擇愛物',
    noneTitle: '不關聯',
    noneSubtitle: '這筆與任何愛物無關',
    loading: '載入中…',
    loadFailed: '載入失敗',
    emptyAibutsu: '還沒有愛物，先到「愛物」分頁新增。',
    emptyGuardian: '還沒有保單，先到「愛物 > 守護」分頁新增。',
  },

  records: {
    title: '紀錄',
    tabExpense: '支出',
    tabIncome: '收入',
    manageRecurringIncome: '定期收入',
    manageRecurringExpense: '定期支出',
    recurringShortcut: '定期',
    offlineMoreNeedsNetwork: '再多紀錄需連線取得',
    monthPicker: {
      triggerLabel: '選擇月份',
      dialogLabel: '月份選擇器',
      prevYear: '前一年',
      nextYear: '下一年',
    },
    stats: {
      title: '支出統計',
      titleAll: '收支統計',
      titleIncome: '收入統計',
      empty: '這個月還沒有支出紀錄',
      emptySub: '翻翻其他月看看',
      viewByCategory: '分類',
      viewByAsset: '愛物',
      otherSpend: '其他支出',
      prevMonth: '上一月',
      nextMonth: '下一月',
      collapse: '收合統計',
      expand: '展開統計',
      summaryExpense: '支出 {amount}',
      summaryIncome: '收入 {amount}',
      summaryNetIncome: '淨收入 +{amount}',
      summaryNetExpense: '淨支出 {amount}',
      summaryNetEven: '持平',
      drillFilterLabel: '只看「{label}」',
      drillClearLabel: '取消篩選「{label}」',
      drillChipPrefix: '只看',
      drillChipClear: '取消篩選',
      drillAssetUnknown: '未命名',
      donutCenterTotal: '總計',
      trendExpense: '支出',
      trendIncome: '收入',
      trendNet: '累計結餘',
      trendChartLabel: '每日收支趨勢',
    },
  },

  filterSheet: {
    reset: '重設',
    title: '篩選',
    apply: '套用',
    payerSection: '誰付的',
    splitSection: '分攤',
    categorySection: '支出分類（可多選）',
    incomeCategorySection: '收入分類（可多選）',
    dateSection: '日期',
    dateThisMonth: '本月',
    dateLastMonth: '上月',
    dateAll: '全部',
    dateCustom: '自訂',
    dateCustomStart: '開始日期',
    dateCustomEnd: '結束日期',
    dateRangeAll: '全部時間',
    dateRangeChipPrefix: '日期',
    dateRangeClear: '清除日期範圍',
    assetSection: '愛物（可多選）',
    assetNone: '未歸屬',
    assetGroupSelectAll: '全選',
    assetGroup: {
      car: '車輛',
      house: '房子',
      living: '生命',
      item: '物品',
      coverage: '守護',
    },
    amountSection: '金額範圍',
    amountMinPlaceholder: '最低',
    amountMaxPlaceholder: '最高',
    amountMinLabel: '金額下限',
    amountMaxLabel: '金額上限',
    statusSection: '狀態',
    statusPending: '待結算',
    statusSettled: '已扣款',
    shareLink: '複製分享連結',
    shareCopied: '已複製到剪貼簿',
    shareFailed: '複製失敗，請稍後再試',
  },

  settings: {
    title: '設定',
    subtitle: '帳號 · 應用 · 資料',
    sectionGroup: '帳本',
    groupName: '帳本名稱',
    sectionMember: '成員',
    youSuffix: '（你）',
    sectionPersonal: '個人',
    addToHomeScreen: '加到主畫面',
    displayName: '顯示名稱',
    soloLockHint: '單人狀態下固定為「全部我的」，邀請對方加入後可調整。',
    defaultSplitLabel: '預設分攤方式',
    inviteCta: '邀請對方加入',
    quickAccessRow: '個人與帳本設定',
    currency: '幣別',
    sectionApp: '應用',
    offlineBrowsing: '離線瀏覽',
    offlineHintOff: '在無網路時看不到歷史記錄。開啟後，最近瀏覽過的頁面會存在這台裝置上。',
    offlineHintOn: '無網路時可看最近一次連線時的記錄。資料只存在這台裝置，登出時會自動清除。',
    offlineToggling: '處理中…',
    offlineToggleError: '無法切換，請稍後再試',
    offlineUnsupported: '目前的瀏覽器不支援離線瀏覽',
    recurringIncome: '定期收入',
    recurringExpense: '定期支出',
    recurringSettings: '定期支出/收入設定',
    sectionData: '資料',
    trust: '資料安全',
    support: '請開發者喝杯咖啡',
    exportData: '匯出資料（CSV）',
    pastTimes: '過去的時光',
    trips: '旅行',
    tripsRow: {
      active: '{active} 段進行中',
      past: '過去 {past} 段',
      both: '{active} 段進行中 · 過去 {past} 段',
    },
    guardianBeta: {
      title: '開啟守護',
      description: '守護是把保單與保障好好收下的地方，還在 Beta 中。未來會成為訂閱功能，現在先體驗。隨時可以關掉，已經記下的保單會留著。',
    },
    dangerZone: {
      sectionTitle: '離開帳本',
      leaveCta: '我想離開這本帳本',
      swapBanner: {
        yourProposal: '你提出了身份互換，等對方確認',
        partnerProposal: '{partner} 提出了身份互換，等你確認',
        expiresOn: '{date} 前未確認會自動失效',
        cancelCta: '撤回',
        rejectCta: '拒絕',
        acceptCta: '接受並互換',
        processing: '處理中…',
        errorPrefix: '操作失敗：',
      },
      flow: {
        step: '第 {current} / {total} 步',
        back: '上一步',
        next: '下一步',
        close: '關閉',
        roleA: '主帳號',
        roleB: '副帳號',
        card1: {
          titleA: '你目前是這本帳本的「主帳號」',
          titleB: '你目前是這本帳本的「副帳號」',
          bodyA: '主帳號是建立這本帳本的人。為了保留兩人共同的歷史，主帳號不能直接離開——你需要先跟 {partner} 互換身份，才能以副帳號的身份離開。',
          bodyB: '副帳號是後來加入的人。如果你決定離開，可以直接離開，{partner} 會繼續持有這本帳本。',
        },
        card2: {
          title: '如果 {memberA}（主帳號）離開會發生什麼',
          body: '主帳號不能直接離開。如果 {memberA} 想離開，必須先發起身份互換，{memberB} 同意後兩人身份對調，{memberA} 才能以副帳號的身份離開。',
        },
        card3: {
          title: '如果 {memberB}（副帳號）離開會發生什麼',
          intro: '離開不可復原。離開時：',
          bullets: [
            '帳目要先結清為 0，才能離開',
            '{memberB} 名下的車、保單、房子會跟著走',
            '孩子、寵物、植物沒有歸屬欄位，會留在原帳本',
            '收支記錄依「誰付的／誰收的」分配',
            '尚未接受的邀請連結會失效',
            '原帳本變回單人狀態，由 {memberA} 繼續使用',
          ],
        },
        card4: {
          title: '確定這些都是你跟對方一起想要的嗎？',
          body: '離開帳本是兩個人的事。再聊聊也沒關係——這個按鈕，永遠都在。',
          yesB: '是的，我要離開',
          yesASwap: '是的，先發起身份互換',
          no: '還沒，先回去',
        },
        finalConfirm: {
          title: '最後一步',
          balanceOk: '帳目已結清，可以離開',
          balanceNotZero: '還有 NT$ {amount} 沒結清。要先在主畫面結算為 0，才能離開。',
          settleCta: '前往主畫面結算',
          typePromptPrefix: '請輸入「',
          typePromptSuffix: '」來確認',
          typePlaceholder: '離開',
          confirmText: '離開',
          leaveButton: '確定離開',
          leaving: '處理中…',
        },
        swapProposed: {
          title: '已送出互換邀請',
          body: '等 {partner} 確認後，再回到設定走一次離開流程。提議 7 天內有效，你也可以在「離開帳本」面板隨時撤回。',
          ok: '知道了',
        },
      },
      errors: {
        swapAlreadyPending: '已經有一個身份互換提議了',
        noPendingSwap: '沒有等待中的互換提議',
        swapExpired: '這個提議已過期',
        cannotConfirmOwnProposal: '不能自己接受自己的提議',
        notAMember: '你不是這本帳本的成員',
        onlyMemberBCanLeave: '只有副帳號可以離開，請先發起身份互換',
        balanceNotZero: '還有差額沒結清，無法離開',
        soloGroup: '已經是單人帳本',
        fallback: '操作失敗，請稍後再試',
      },
    },
    import: {
      navLabel: '從其他 app 匯入',
      navSecondary: '把過去的紀錄帶過來',
      pageTitle: '從其他 app 匯入',
      pageSubtitle: '把過往的記錄一起帶進來',
      back: '返回設定',
      stepLabel: '第 {current} / {total} 步',
      step1: {
        title: '選擇來源並上傳檔案',
        subtitle: '檔案會在這台裝置上解析，原始資料不會上傳',
        sourceLabel: '匯出來源',
        sources: {
          honeydue: 'Honeydue',
          spendee: 'Spendee',
          cwmoney: 'CWMoney',
          generic: '通用 CSV',
        },
        uploadPrompt: '拖檔案到這裡，或點選下方按鈕',
        uploadButton: '選擇 CSV 檔案',
        parsing: '解析中…',
        fileSelected: '已選：{name}',
        summary: '共 {total} 筆 · 有效 {valid} 筆 · 失敗 {invalid} 筆',
        sourceDetected: '偵測到來源：{source}',
        invalidNote: '失敗的列會略過匯入，並保留在錯誤紀錄供日後修正',
        retryCta: '換一個檔案',
        parseError: '解析失敗，請確認檔案格式或換一個檔案重試',
      },
      step2: {
        title: '類別對照',
        subtitle: '把來源的類別，對應到家計簿裡的類別',
        sourceColumn: '來源類別',
        targetColumn: '對應到',
        rowCount: '{count} 筆',
        keepOriginal: '其他',
      },
      step3: {
        title: '付款人與分攤方式',
        subtitle: '為這次匯入的紀錄統一指定預設值',
        payerLabel: '預設付款人',
        payerHint: '可在匯入完成後逐筆修改',
        splitLabel: '預設分攤方式',
        splitOptions: {
          all_mine: '全部我的',
          all_theirs: '全部對方的',
          half: '一人一半',
        },
        soloHint: '單人狀態下固定為「全部我的」',
      },
      step4: {
        title: '預覽並確認',
        subtitle: '先看一下前幾筆，沒問題就把它們留下來',
        tableHeader: {
          date: '日期',
          description: '說明',
          category: '類別',
          amount: '金額',
          type: '類型',
        },
        typeExpense: '支出',
        typeIncome: '收入',
        moreRows: '還有 {count} 筆未顯示',
        confirmCta: '確認匯入 {count} 筆',
        confirming: '匯入中…',
        summary: '預計寫入 {count} 筆 · 失敗 {invalid} 筆會保留紀錄',
      },
      result: {
        successHeading: '匯入完成',
        successBody: '已寫入 {count} 筆紀錄',
        rollbackHint: '24 小時內可一鍵復原這次匯入',
        rollbackCta: '復原這次匯入',
        rollbackConfirm: '確定要復原嗎？所有這次匯入的紀錄會一起撤回',
        rollbacking: '復原中…',
        doneCta: '回到設定',
      },
      history: {
        title: '最近的匯入',
        empty: '還沒有匯入過任何資料',
        rolledBack: '已復原',
        completed: '已完成',
        rollbackableTag: '24 小時內可復原',
        expiredTag: '已超過復原時效',
      },
      errors: {
        parseFailed: '解析檔案時遇到問題',
        submitFailed: '寫入時遇到問題，請稍後再試',
        rollbackFailed: '復原失敗，請稍後再試',
        noValidRows: '這個檔案沒有可匯入的紀錄',
      },
    },
  },

  postLeave: {
    partnerLeftHeading: '⟂ {partner} 已離開',
    partnerLeftBody: '到目前為止的記錄都還在。從這裡開始，是你一個人的時光。',
    welcomeSoloHeading: '歡迎回到一個人',
    welcomeSoloBody: '帳本完整地跟著你過來。從今天起，可以慢慢來。',
    dismissAria: '關閉',
  },

  pastTimes: {
    title: '過去的時光',
    back: '返回',
    intro: '這本帳本有過好幾段時光。每一段都是當時的你們留下來的。',
    currentChapter: '現在 · 跟 {partner}',
    currentChapterSolo: '現在 · 一個人',
    chapterRange: '{start} – {end}',
    withPartner: '跟 {partner}',
    soloLabel: '一個人',
    enterCta: '看看那段時光',
    bannerHeading: '你正在看 {start} – {end} 的過去',
    bannerExitCta: '回到現在',
    empty: '還沒有過去的時光。第一段才剛開始。',
  },

  csvExport: {
    preparing: '準備中…',
    failed: '匯出失敗，請稍後再試',
    filenamePrefix: 'futari-transactions',
    columns: {
      date: '日期',
      description: '描述',
      amount: '金額',
      category: '分類',
      paidBy: '誰付的',
      splitType: '分攤',
      notes: '備註',
    },
  },

  contextStrip: {
    partnerLeftLine: '夥伴已離開帳本。之前的紀錄都還在。',
  },

  assets: {
    title: '愛物',
    empty: {
      title: '還沒有愛物',
      body: '新增一台車、寵物、孩子或保單，開始記錄花在他們身上的時間與心意。',
    },
    section: {
      property: '財產',
      living: '生命體',
      coverage: '保障',
      items: '物品',
    },
    tabs: {
      aibutsu: '愛物',
      guardian: '守護',
    },
    tabEmpty: {
      aibutsuHint: '還沒有愛物。從右下角開始記下第一個。',
      guardianHint: '還沒有保單。守護愛物的保障也可以一起記下。',
    },
    guardianGated: {
      title: '守護還在 Beta',
      body: '保單與保障的紀錄都收在這裡。在設定中開啟「守護（Beta）」，就能一起照顧。',
      cta: '前往設定開啟',
    },
    addCar: '新增車輛',
    addSecondCar: '加入第二輛車',
    addHouse: '新增房屋',
    addChild: '新增孩子',
    addPet: '新增寵物',
    addPlant: '新增植物',
    addItem: '新增物品',
    typeFilterAll: '全部',
    insuranceList: {
      insuredPrefix: '被保人 {name}',
      annualPremium: '年繳 NT$ {amount}',
      savingsCumulative: '累積投入 NT$ {amount}',
      savingsForeignNote: '保額 USD',
      savingsMaturedBadge: '繳費期滿',
      activeBadge: '繳費中',
      sumInsuredShort: '保額 NT$ {amount}',
      yearsLeft: '剩 {n} 年',
      expired: '已到期',
      singleYearLabel: '單年期',
      daysLeftWarning: '剩 {n} 天',
      daysLeftUrgent: '剩 {n} 天',
      expiredBadge: '已到期',
      nextPaymentBadge: '繳費剩 {n} 天',
      renewAction: '已續保',
      lapseAction: '已停止',
      renewTitle: '已續保？',
      renewDescription: '保單迄會 +1 年。若有新的保單號可順便更新，沒有就留空。',
      renewPolicyNoLabel: '新保單號（選填）',
      renewPolicyNoPlaceholder: '沿用原號可留空',
      renewConfirm: '已續保',
      lapseTitle: '已停止這份保單？',
      lapseDescription: '保單將從列表中移除，仍可從詳細頁找回。',
      lapseConfirm: '已停止',
    },
  },

  recurringIncome: {
    title: '定期收入',
    back: '返回',
    empty: {
      hint: '還沒設定定期收入',
      cta: '新增第一個',
    },
    rule: {
      pausedHint: '已暫停',
      intervalEveryMonth: '每月',
      intervalEveryQuarter: '每季',
      intervalEveryHalfYear: '每半年',
      intervalEveryYear: '每年',
      intervalEveryNMonths: '每 {n} 個月',
      dayLabel: '{day} 號',
    },
    pending: {
      sectionLabel: '這幾筆等你看看',
      primaryAction: '就這樣',
      editAction: '改一下',
      skipAction: '跳過',
      skipConfirm: '跳過 {date} 的 {description}？',
      expandAll: '展開全部（還有 {n} 筆）',
      collapse: '收合',
    },
    sheet: {
      titleNew: '新增定期收入',
      titleEdit: '編輯定期收入',
      amountLabel: '固定金額',
      recipientPrompt: '誰的收入？',
      categoryLabel: '類別',
      intervalLabel: '週期',
      dayOfMonthLabel: '每月幾號',
      dayOfMonthFallbackHint: '2 月或月份天數不足時，自動 fallback 到月底。',
      dayAriaLabel: '{day} 號',
      dayFallbackTitle: '若當月無此日，自動 fallback 到月底',
      sourceLabel: '來源名稱（選填）',
      sourcePlaceholder: '公司名稱或薪資來源',
      startsOnLabel: '開始日期',
      endsOnLabel: '結束日期（選填）',
      assetLabel: '關聯保單（選填）',
      assetNone: '無',
      pauseAction: '暫停',
      resumeAction: '恢復',
      deleteRuleAction: '刪除規則',
      deleteConfirmTitle: '刪除這個定期規則？',
      deleteConfirmDescription: '已存在的待確認卡片也會一起清掉，此動作無法復原。',
    },
    errors: {
      amountRequired: '請輸入金額',
      saveFailed: '儲存失敗',
      operationFailed: '操作失敗',
      deleteFailed: '刪除失敗',
    },
    raceMessage: '對方剛剛確認了這筆',
  },

  trust: {
    title: '資料安全',
    back: '返回',
    pageHeading: '你們的資料，屬於你們倆',
    pageSubtitle: '我們的承諾，寫在這裡。',
    encryption: {
      heading: '只有你們倆能看到',
      body: '我們用 AES-256-GCM 為你們的紀錄加密。連我們自己，也讀不到內容。',
    },
    portability: {
      heading: '隨時都能整包帶走',
      body: '我們不會把你們綁在這裡。日後想離開，所有紀錄都能整批帶走。',
      comingSoonHint: '匯出功能即將推出',
    },
    backup: {
      heading: '我們替你們守著',
      body: '每一筆紀錄，我們都備份保管。即使你們忘了，我們也替你們留著。',
    },
    onboarding: {
      line1: '資料只屬於你們倆',
      line2: '隨時都能整包帶走',
      line3: '每一筆我們都替你們守著',
    },
    bilateral: {
      inviter: {
        heading: '在邀請對方之前',
        subtitle: '讀一下我們對你們倆的承諾。如果你願意，再把連結傳出去。',
        cta: '這是我希望的',
      },
      invitee: {
        heading: '{name} 已經承諾了這些',
        subtitle: '你呢？想不想一起？',
        cta: '我也是',
        confirming: '正在加入…',
      },
    },
  },

  support: {
    title: '請開發者喝杯咖啡',
    back: '返回',
    pageHeading: '請開發者喝杯咖啡',
    pageSubtitle: 'Futari 是一個人慢慢做的小東西。若它替你們留住了什麼，這裡可以留下一杯咖啡的距離。',
  },

  currencyPage: {
    title: '貨幣',
    back: '返回',
    pageHeading: '兩人之間的一把尺',
    pageSubtitle: '主體幣別是這本帳本的母語。',
    base: {
      sectionTitle: '主體幣別',
      sectionHint: '這本帳本的母語。所有結算與顯示，都以它為基準。',
      locked: {
        heading: '這個章節已經開始記錄了',
        body: '當前章節已經有紀錄，主體幣別在章節中固定不變——這樣以前寫下的金額，就一直站得住。',
        bodyNext: '想換主體幣別的話，可以等開始下一個章節時重新選。',
      },
    },
    tripsHint: {
      heading: '心理匯率搬家了',
      body: '出國的時候用得到的幣別與匯率，現在跟著旅行一起設定——每一趟自己一把尺，不會互相影響。',
      linkLabel: '看看旅行',
    },
    errors: {
      baseChangeFailed: '無法切換主體幣別',
    },
  },

  assetSheet: {
    titleNew: '新增愛物',
    titleEdit: '編輯{type}',
    typeFallback: '愛物',
    saveChanges: '儲存變更',
    deleteConfirm: {
      title: '確認刪除？',
      description: '這個愛物與所有關聯支出將從列表中移除。',
      confirmLabel: '刪除',
    },
    type: {
      label: '類型',
      car: '車',
      child: '孩子',
      pet: '寵物',
      plant: '植物',
      house: '房子',
      insurance: '保險',
      item: '物品',
      more: '更多',
    },
    name: {
      label: '名稱',
      placeholderCar: '例：我的車',
      placeholderChild: '例：小明',
      placeholderPet: '例：米嚕',
      placeholderPlant: '例：陽台上的植物們',
      placeholderHouse: '例：我們家',
      placeholderInsurance: '例：南山醫療終身險',
    },
    notes: {
      label: '備註',
      placeholder: '自由填寫，例：上次健檢心跳偏快、保單折扣到 2027 等',
    },
    car: {
      color: '顏色',
      colorNoneAriaLabel: '不指定顏色',
      plate: '車牌',
      platePlaceholder: '例：ABC-1234',
      year: '年份',
      yearPlaceholder: '例：2019',
      brand: '品牌',
      brandPlaceholder: '例：Toyota',
      model: '型號',
      modelPlaceholder: '例：Altis',
      purchasedAt: '購入日期（選填）',
      pickDate: '選擇日期',
      purchasePrice: '購入價格（選填）',
      initialOdometer: '目前里程（選填）',
      initialOdometerPlaceholder: '例：50000',
      fuelType: '油種',
      fuelTypeDiesel: '柴油',
      primaryUser: '主要使用人',
    },
    child: {
      nickname: '小名',
      nicknamePlaceholder: '元寶',
      fullName: '全名',
      fullNamePlaceholder: '陳小白',
      gender: '性別',
      genderMale: '男孩',
      genderFemale: '女孩',
      birthday: '出生日期',
      sectionId: '身分證件',
      nationalId: '身分證號',
      nationalIdPlaceholder: 'A123456789',
      nhiNo: '健保卡號',
      nhiNoPlaceholder: '0000 0000 0000',
      encryptedHint: '已加密儲存，留空即不變更',
      pendingClearHint: '已標記清除（儲存後生效）',
      clear: '清除',
      cancelClear: '取消',
      bloodType: '血型',
      hospital: '出生醫院',
      hospitalPlaceholder: '臺大醫院',
      sectionBody: '身體紀錄（可之後補）',
      height: '身高',
      heightPlaceholder: '102',
      weight: '體重',
      weightPlaceholder: '16.4',
    },
    pet: {
      species: '種類',
      speciesCat: '貓',
      speciesDog: '狗',
      speciesRabbit: '兔',
      speciesBird: '鳥',
      speciesFish: '魚',
      speciesOther: '其他',
      breed: '品種 / 品名',
      breedPlaceholder: '美短',
      sex: '性別',
      sexMale: '男孩',
      sexFemale: '女孩',
      sexUnknown: '不明',
      birthDate: '出生日',
      adoptedDate: '到家日',
      purchaseCost: '領養金額',
      purchaseCostPlaceholder: '12000',
      weight: '體重',
      weightPlaceholder: '4.2',
      sectionHealth: '健康 / 證件',
      chipNo: '晶片號',
      chipNoPlaceholder: '900141001234567',
      vet: '獸醫院',
      vetPlaceholder: '永和動物醫院',
    },
    plant: {
      species: '種類',
      speciesPlaceholder: '例：龜背芋',
      location: '位置',
      locationPlaceholder: '北向陽台',
      sproutedAt: '入手日',
      cost: '入手金額',
      costPlaceholder: '1850',
      sectionCare: '照顧週期',
      waterEvery: '多久澆一次水',
      waterEverySuffix: '天',
    },
    house: {
      address: '地址',
      addressPlaceholder: '例：台北市大安區某路1號',
      purchasedAt: '購入日期',
      pickDate: '選擇日期',
      purchasePrice: '購入金額',
      purchasePricePlaceholder: '例：15000000',
    },
    insurance: {
      kind: '險種',
      kindMedical: '醫療',
      kindLife: '壽險',
      kindAccident: '意外',
      kindCancer: '癌症',
      kindIllness: '重大傷病',
      kindCar: '汽車',
      kindSavings: '儲蓄',
      insured: '被保人',
      insuredPlaceholder: '小元',
      insuredFreeform: '自行輸入',
      policyHolder: '要保人',
      insurer: '保險公司',
      insurerPlaceholder: '南山人壽',
      policyNo: '保單號',
      policyNoPlaceholder: 'NSL-2022-0814-001',
      sectionPremium: '保費與保額',
      annualPremium: '年繳保費',
      annualPremiumPlaceholder: '24960',
      sumInsured: '保額',
      sumInsuredPlaceholder: '3000000',
      expectedMaturityAmount: '預估滿期金',
      expectedMaturityAmountPlaceholder: '600000',
      accountValue: '目前帳戶價值',
      accountValuePlaceholder: '520000',
      payCycle: '繳費週期',
      payCycleAnnual: '年繳',
      payCycleSemi: '半年',
      payCycleQuarterly: '季繳',
      payCycleMonthly: '月繳',
      sectionContract: '合約期間',
      startsAt: '保單起',
      endsAt: '保單迄',
      termYears: '年期',
      termYearsPlaceholder: '20',
      termYearsSuffix: '年',
      sectionLinkedVehicle: '關聯車輛（選填）',
      linkedVehicle: '關聯車輛',
      noLink: '不關聯',
    },
  },

  assetTemplate: {
    namePlaceholder: '例：相機、單車、紀念物',
    detailSection: '基本資料',
  },

  assetDetail: {
    backAriaLabel: '返回',
    editAriaLabel: '編輯',
    switcherAriaLabel: '切換愛物',
    siblingRailAriaLabel: '其他愛物',
    switcher: {
      emptyGroup: '（無）',
      currentLabel: '目前',
    },
    notesSection: '備註',
    recentExpenses: '近期支出',
    timelineEntries: '時間軸 · {count} 筆',
    addOtherExpense: '其他支出',
    refuel: '加油',
    relatedInsurance: '相關保險',
    linkedVehicleSection: '關聯車輛',
    emptyCarLine1: '還沒有為這台車記下任何支出。',
    emptyCarLine2: '戳右下角 + 開始',
    emptyDefaultLine1: '還沒有記下任何支出。',
    emptyDefaultLine2: '戳右下角 + 開始',
    typeLabels: {
      car: '車',
      house: '房',
      child: '孩子',
      pet: '寵物',
      plant: '植物',
      insurance: '保險',
      item: '物品',
    },
    age: {
      label: '年齡',
      yearsSuffix: '歲',
      monthsSuffix: '個月',
    },
    money: {
      thisMonth: '本月',
      cumulative: '累計',
    },
    hint: {
      title: '✦ 可以記什麼？',
      cta: '記第一筆 →',
      itemsPet: '飼料 · 看診 · 洗澡美容 · 玩具 · 年度疫苗',
      itemsChild: '尿布奶粉 · 看診 · 課後安親 · 玩具 · 學費',
      itemsPlant: '介質 · 盆器 · 肥料 · 買新苗 · 防蟲',
      itemsHouse: '房貸 · 水電 · 管理費 · 維修 · 裝潢 · 清潔',
      itemsCar: '加油 · 停車 · 定期保養 · 保險 · 過路費',
      itemsItem: '保養 · 耗材 · 維修 · 配件',
    },
    reveal: {
      show: '顯示',
      hide: '隱藏',
      loading: '…',
      error: '無法顯示',
    },
    car: {
      avgEcon: '平均油耗',
      avgEconNoLog: '加第一筆油看油耗',
      avgEconNeedMore: '需要至少 2 次加油記錄',
      avgEconRecent: '近 6 個月',
      plate: '車牌',
      plateSection: '車輛資訊',
    },
    child: {
      sectionId: '身分證件',
      sectionBody: '身體紀錄',
      bornDate: '出生日',
      nationalId: '身分證號',
      nhiNo: '健保卡號',
      bornHospital: '出生醫院',
      bloodType: '血型',
      bloodTypeValue: '{type} 型',
      height: '身高',
      weight: '體重',
      fullName: '全名',
      revealShow: '顯示',
      revealHide: '隱藏',
      revealLoading: '…',
      revealError: '無法顯示',
      genderMale: '男',
      genderFemale: '女',
    },
    pet: {
      sectionAtHome: '來到家裡',
      sectionHealth: '健康 / 證件',
      birthDate: '出生日',
      adoptedDate: '到家日',
      purchaseCost: '領養金額',
      weight: '目前體重',
      chipNo: '晶片號',
      vet: '獸醫院',
      sexMale: '男孩',
      sexFemale: '女孩',
      sexUnknown: '不明',
    },
    plant: {
      sectionRecord: '植物紀錄',
      sproutedAt: '入手日',
      cost: '入手金額',
      location: '位置',
      waterEvery: '澆水週期',
      waterEveryValue: '每 {n} 天',
      companionDays: '陪伴天數',
      daysSuffix: '天',
      sproutedSuffix: ' 入手',
      waterEveryFooter: ' · 每 {n} 天澆水',
    },
    house: {
      sectionInfo: '房子資訊',
      address: '地址',
      purchasedAt: '購入日',
      purchasePrice: '購入金額',
      livingDays: '入住天數',
      daysSuffix: '天',
      livingSuffix: ' 入住',
    },
    insurance: {
      sectionContract: '合約資訊',
      sectionMaturity: '到期資訊',
      kind: '險種',
      insured: '被保人',
      insurer: '保險公司',
      policyNo: '保單號',
      payCycle: '繳費週期',
      expectedMaturity: '預估滿期金',
      accountValue: '目前帳戶價值',
      startsAt: '保單起',
      endsAt: '保單迄',
      termYearsParen: '（{n} 年期）',
      termYearsLine: '共 {n} 年期',
      expired: '已到期',
      coverageRemaining: '保障剩餘',
      yearSuffix: '年',
      daysSuffix: '天',
      annualPremiumLabel: '年繳保費',
      annualPremiumPrefix: '年繳 NT$ {amount}',
      contractProgress: '合約進度',
      yearsLeft: '還剩 {years} 年',
      matured: '已滿期',
      termAndSumLine: '{n} 年期 · 保額 NT$ {sum}',
      kindLabels: {
        medical: '醫療',
        life: '壽險',
        accident: '意外',
        cancer: '癌症',
        illness: '重大傷病',
        car: '汽車',
        savings: '儲蓄',
      },
      payCycleLabels: {
        annual: '年繳',
        semi: '半年繳',
        quarterly: '季繳',
        monthly: '月繳',
      },
    },
    savings: {
      sectionPremium: '繳費紀錄',
      sectionReturn: '拿回紀錄',
      addReturn: '記滿期金',
      paymentEmpty: '還沒記過這份保單的保費 · 戳右下角 +',
      returnEmptyBefore: '滿期日還沒到 · 請耐心',
      returnEmptyAwaiting: '滿期日已到 · 滿期金到帳了嗎？',
      heroNotStartedWithDate: '這筆每年放進去的，{date} 會回來',
      heroNotStarted: '這筆每年放進去的，未來會回來',
      heroPartialWithYears: '已拿回 {pct}% · 距滿期還有 {years} 年',
      heroPartial: '已拿回 {pct}%',
      heroMatured: '滿期了 · 共拿回 NT$ {total}',
      heroAwaitingMaturity: '滿期日已到 · 等候滿期金到帳',
      heroNotYetActive: '保單將於 {date} 生效',
      heroLabelIn: '入',
      heroLabelOut: '出',
      heroPaymentLabel: '累計繳',
      heroReturnLabel: '已拿回',
      heroExpectedTag: '估',
      heroNoExpectedBar: '已拿回 NT$ {received} · 預估金額未設定',
      heroNoExpectedCta: '設定預估金額',
      heroBreakdownPrefix: '含',
      maturingSoonTitle: '{date} 即將到期',
      maturingSoonSubtitle: '別忘了滿期金到帳要記',
      maturingSoonCta: '記滿期金 →',
      maturedAwaitingTitle: '滿期日已到 · {date}',
      maturedAwaitingStatus: '待入帳',
      maturedAwaitingCta: '我已經收到滿期金了 →',
      maturedAwaitingPremiumNote: '累計繳 NT$ {total} 已記入 {count} 筆',
      accountValueLabel: '目前帳戶價值',
      accountValueEditCta: '更新',
      recurringSectionTitle: '定期進帳',
      recurringEmptyHint: '分紅或生存金每年都會回來，設成定期進帳就不必再記',
      recurringAddCta: '建立定期進帳',
      recurringRuleSummary: '每月 {day} 號 · {interval}',
      recurringRuleNextDate: '下次 {date}',
      recurringRulePaused: '已暫停',
      recurringManageCta: '查看',
    },
  },

  recurringExpense: {
    title: '定期支出',
    back: '返回',
    empty: {
      hint: '還沒設定定期支出',
      cta: '新增第一個',
    },
    rule: {
      pausedHint: '已暫停',
      pausedAssetDeletedHint: '已暫停（關聯愛物已刪除）',
      intervalEveryMonth: '每月',
      intervalEveryQuarter: '每季',
      intervalEveryHalfYear: '每半年',
      intervalEveryYear: '每年',
      intervalEveryNMonths: '每 {n} 個月',
      dayLabel: '{day} 號',
    },
    pending: {
      sectionLabel: '這幾筆等你看看',
      primaryAction: '就這樣',
      editAction: '改一下',
      skipAction: '跳過',
      skipConfirm: '跳過 {date} 的 {description}？',
      expandAll: '展開全部（還有 {n} 筆）',
      collapse: '收合',
      payerLine: '{payer}・{splitType}',
    },
    sheet: {
      titleNew: '新增定期支出',
      titleEdit: '編輯定期支出',
      amountLabel: '固定金額',
      payerPrompt: '誰付的？',
      splitTypeLabel: '分攤方式',
      categoryLabel: '類別',
      intervalLabel: '週期',
      dayOfMonthLabel: '每月幾號',
      dayOfMonthFallbackHint: '2 月或月份天數不足時，自動 fallback 到月底。',
      dayAriaLabel: '{day} 號',
      dayFallbackTitle: '若當月無此日，自動 fallback 到月底',
      descriptionLabel: '描述',
      descriptionPlaceholder: '例：房租、訂閱',
      startsOnLabel: '開始日期',
      endsOnLabel: '結束日期（選填）',
      assetLabel: '關聯愛物（選填）',
      assetNone: '無',
      pauseAction: '暫停',
      resumeAction: '恢復',
      deleteRuleAction: '刪除規則',
      deleteConfirmTitle: '刪除這個定期規則？',
      deleteConfirmDescription: '已存在的待確認卡片也會一起清掉，此動作無法復原。',
    },
    errors: {
      amountRequired: '請輸入金額',
      descriptionRequired: '請輸入描述',
      saveFailed: '儲存失敗',
      operationFailed: '操作失敗',
      deleteFailed: '刪除失敗',
    },
    raceMessage: '對方剛剛確認了這筆',
  },

  comingSoon: {
    title: '{feature} 即將推出',
    subtitle: '先回首頁記一筆吧。',
    backToHome: '回首頁',
    features: {
      list: '紀錄',
      fallback: '此功能',
    },
  },

  invite: {
    errorTitle: '無法加入帳本',
    backToHome: '回到首頁',
    joiningGroupLabel: '加入「{group}」',
    fallbackInviter: '對方',
    errors: {
      invalidOrExpired: '邀請連結無效或已過期',
      alreadyUsed: '邀請連結已被使用',
      revoked: '邀請連結已失效',
      expired: '邀請連結已過期',
      groupNotFound: '找不到群組',
      groupFull: '此帳本已有兩位成員',
      alreadyMember: '你已經是此帳本的成員',
      unknown: '無法加入帳本',
    },
  },

  offlineBanner: {
    text: '離線中・顯示最近一次連線的資料',
  },

  offlinePage: {
    title: '這裡需要連線才看得到',
    subtitle: '先看看下面這些已經存著的吧。',
    linkDashboard: '回首頁',
    linkRecords: '紀錄',
    linkAssets: '愛物',
    footer: '等連線回來會自動更新',
    metadataTitle: '離線中 · Futari',
  },

  termsPage: {
    heading: '服務條款',
    lastUpdated: '最後更新：2026 年 5 月 31 日',
    intro: '使用 Futari（以下簡稱「本服務」）即表示您同意以下條款。請在使用前詳閱。',
    bullets: [
      '本服務提供雙人共用記帳功能，包含交易紀錄、結算與共同財物管理。所有結算結果僅供使用者自行參考，本服務不對其正確性負責。',
      '您的資料屬於您。本服務僅為顯示與計算目的使用您輸入的資料，不會出售或對外分享您的個人資料。',
      '請勿記錄高度敏感的身分資訊（例如身分證字號、信用卡號等）。本服務的設計目的是記帳，不是機密文件保存。',
      '使用 Google 登入即表示您同意 Google 將您的基本帳號資訊（姓名、頭像、Email）提供給本服務，作為帳號識別之用。',
      '您可隨時透過設定頁登出或刪除帳號。帳號刪除後，所有相關資料將於 14 個工作天內從伺服器移除。',
      '本服務保留因維護、安全或系統需求暫停或調整服務的權利，並將在可能的情況下提前告知。',
      '本服務條款適用中華民國法律，如有爭議以臺灣臺北地方法院為第一審管轄法院。',
    ],
    outro: '如有任何疑問，',
    contactLinkLabel: '歡迎到 GitHub 開 Issue 告訴我們',
    backHome: '← 回首頁',
    privacyLink: '隱私權政策',
  },

  privacyPage: {
    heading: '隱私權政策',
    lastUpdated: '最後更新：2026 年 5 月 31 日',
    intro: '本頁說明 Futari 如何蒐集、使用與保護您的個人資料。',
    sectionCollectTitle: '蒐集的資料',
    sectionCollectItems: [
      'Google OAuth 提供的基本帳號資訊：姓名、頭像、Email 地址。',
      '您手動輸入的記帳資料，包含交易紀錄、結算紀錄、分攤偏好、共同財物資訊等。',
      '邀請連結與接受時間（用於連結雙方帳號）。',
      '操作行為與錯誤資訊（用於改善服務品質，詳見第三方服務說明）。',
    ],
    sectionPurposeTitle: '資料用途',
    sectionPurposeItems: [
      '顯示您與伴侶共用的記帳介面並計算雙方餘額。',
      '提供定期收支、月度回顧等功能所需的計算。',
      '偵測並修復服務錯誤（透過 Sentry 錯誤追蹤）。',
      '分析功能使用情況以改善產品體驗（透過 PostHog，不含個人識別資訊）。',
    ],
    sectionStorageTitle: '資料儲存',
    sectionStorageBody: '資料儲存於 Supabase 的伺服器，位於日本東京區，採加密傳輸與存取控制保護。愛物中的機敏欄位（寶寶本名、身分證字號、健保卡號、車牌號碼、房屋地址）在寫入資料庫前以 AES-256-GCM 加密，資料庫中不存明文，唯有透過應用程式操作才能解密讀取。',
    sectionRetentionTitle: '資料保留期限',
    sectionRetentionBody: '您的帳號資料在帳號存續期間持續保存。您刪除的交易紀錄會保留軟刪除標記最多 1 年，之後由系統自動物理刪除。帳號刪除後，所有相關資料將於 14 個工作天內從伺服器移除。',
    sectionThirdPartyTitle: '第三方服務',
    sectionThirdPartyItems: [
      'Google（OAuth 登入）',
      'Supabase（後端、資料庫、即時同步）',
      'Vercel（網站託管）',
      'Sentry（錯誤追蹤，收集匿名錯誤堆疊，不含個人識別資訊）',
      'PostHog（產品分析，收集匿名操作事件，不含個人識別資訊）',
    ],
    sectionRightsTitle: '您的權利',
    sectionRightsBody: '您可隨時透過設定頁登出或刪除帳號。如需匯出或查詢您的個人資料，',
    outro: '本政策若有變更，將在本頁更新並修改日期。如有任何疑問，',
    contactLinkLabel: '歡迎到 GitHub 開 Issue 告訴我們',
    backHome: '← 回首頁',
    termsLink: '服務條款',
  },

  monthlyReview: {
    pageTitle: '{year} 年 {month} 月．我們的記帳回顧',
    backAriaLabel: '返回',
    closeAriaLabel: '關閉',
    bannerHeading: '你們在 {month} 月寫下：',
    bannerHeadingNoMessage: '上個月的回顧整理好了',
    bannerCta: '→ 一起看看 {month} 月',
    bannerHeadingSolo: '你在 {month} 月寫下：',
    bannerHeadingSoloNoMessage: '上個月的回顧整理好了',
    bannerCtaSolo: '→ 看看 {month} 月',
    pastMessagesTitle: '上個月寫給這個月的話',
    pastMessageAuthorFallback: '對方',
    editorTitle: '給下個月的我們',
    editorTitleSolo: '給下個月的我',
    editorPlaceholder: '寫一句話給下個月的你們',
    editorCounter: '{n}/{max}',
    lockedFooter: '已於 {date} 鎖定',
    savingFooter: '儲存中…',
    savedFooter: '已儲存',
    errorFooter: '儲存失敗：{message}',
    card1Title: '最常一起花的類別',
    card1Body: '這個月你們最常一起花在 {category}，共 NT$ {amount}',
    card1BodySolo: '這個月你最常花在 {category}，共 NT$ {amount}',
    card2Title: '本月最大筆',
    card2Body: '最大一筆：{name} 付的「{description}」，NT$ {amount}',
    card3Title: '定期入帳事件',
    card3ExpenseTotal: '本月定期支出共 NT$ {amount}',
    card3IncomeTotal: '本月定期進帳共 NT$ {amount}',
    card4Title: '愛物進度',
    emptyCardBody: '這個月沒留下花費紀錄',
    emptyCardCta: '現在去補登 →',
    emptyRecurring: '本月沒有定期事件',
    emptyAssetBreakdown: '本月沒有為任何愛物花費',
    carouselIndicator: '{current} / {total}',
    incomeLabel: '進',
    expenseLabel: '支',
    snapshotNotReady: '這個月的回顧還在整理中，等一下再進來看看吧。',
    errors: {
      messageRequired: '請寫一句話',
      messageTooLong: '留言最長 200 字',
      saveFailed: '儲存失敗',
      locked: '這個月的留言已鎖定',
    },
  },

  quiz: {
    cardHeadingInvitation: '我們還不太認識彼此，來回答 3 題',
    cardHeadingSelfPendingPartnerDone: '對方答完了，輪你了',
    cardHeadingSelfPendingPartnerPending: '來回答 3 題，看看你們對錢的想像',
    cardHeadingSelfDonePartnerPending: '答完了，等 {partnerName} 一起揭曉',
    cardHeadingRevealed: '看看你們的理財組合',
    cardCtaStart: '→ 開始',
    cardCtaReveal: '→ 看揭曉',
    answerEyebrow: '了解彼此',
    answerProgress: '{current} / {total}',
    answerCta: '繼續',
    answerCtaFinal: '送出這 3 題',
    answerErrorChooseOne: '選一個吧，再繼續',
    answerBack: '返回回顧',
    waitingHeading: '答完了，等對方一起揭曉',
    waitingBody: '你的答案會先收著，等對方也答完了，我們會一起打開。',
    waitingBackToReview: '回到回顧頁',
    revealHeading: '你們的理財組合',
    revealedAtLine: '揭曉於 {date}',
    revealSameAnswer: '在這件事上你們同方向',
    revealFraming: '你們一個是日出、一個是月光。不同的時刻，照同一個家。沒有誰的答案比較對，記住對方在意的就好。',
    revealHeaderA: '你',
    revealHeaderB: '對方',
    soloFallback: '兩個人才能一起回答這 3 題。等對方加入家計簿，再回來吧。',
    errorNotFound: '找不到這次的問答',
    errors: {
      submitFailed: '送出失敗，等一下再試',
      alreadyAnswered: '你已經答完了',
      solo: '一個人的時候還沒辦法答題',
    },
    questions: {
      impulse: {
        prompt: '看到很想要、但不一定需要的東西，我通常…',
        choices: {
          a: '先放著兩天，看會不會冷下來',
          b: '喜歡就買，這種感覺不多',
          c: '等下次需要時再一起入手',
        },
      },
      risk: {
        prompt: '想到突然要用上一筆大錢，我的第一個感覺是…',
        choices: {
          a: '還好，我平常有備一份',
          b: '緊張，但會想辦法',
          c: '先別想，到時候再說',
        },
      },
      transparency: {
        prompt: '彼此的錢，我比較希望…',
        choices: {
          a: '大小事都知道，比較安心',
          b: '大筆的知道就好，小開銷不必報',
          c: '各自有空間，需要時再對',
        },
      },
      big_purchase: {
        prompt: '想買一個比較貴的東西，我會…',
        choices: {
          a: '先跟對方說，一起想想',
          b: '自己決定後再告訴對方',
          c: '看是什麼，分情況',
        },
      },
      future: {
        prompt: '想到 10 年後的我們，我腦中浮現的是…',
        choices: {
          a: '存到一個目標，安心慢慢過',
          b: '想去的地方都去過了',
          c: '一個我們都喜歡的家',
        },
      },
      recording_motive: {
        prompt: '我想記帳，比較像是…',
        choices: {
          a: '想知道日子怎麼過的',
          b: '想為以後存下一些什麼',
          c: '想跟對方有個共同的地方',
        },
      },
    },
  },

  inAppBrowser: {
    title: '請在外部瀏覽器開啟',
    description: '你目前在聊天軟體的內建瀏覽器裡。為了讓 Google 登入與離線功能正常運作，請改用 Safari 或 Chrome 開啟。',
    urlLabel: '網址',
    copy: '複製連結',
    copied: '已複製',
    openInSafari: '在 Safari 開啟',
    instructionGeneric: '複製上方網址，貼到 Safari 或 Chrome 開啟。',
    instructionIos: '點上方按鈕跳到 Safari，或複製網址後手動貼到 Safari。',
    instructionAndroid: '點右上角選單，選「在瀏覽器中開啟」，或複製網址貼到 Chrome。',
  },

  installGuide: {
    title: '加到主畫面',
    close: '關閉',
    intro: '把 Futari 加到主畫面後，會像一個 app 一樣全螢幕開啟，不會再看到網址列。',
    iosSafari: {
      step1: '點底部正中間的分享按鈕',
      step2Html: '往下捲動，找到「<strong>加入主畫面</strong>」',
      step3Html: '點右上角「<strong>加入</strong>」就完成了',
    },
    iosOther: {
      bodyHtml: '在 iOS 上只有 <strong>Safari</strong> 可以把網頁加到主畫面。請複製下方網址，貼到 Safari 開啟之後再回到這個教學。',
      copy: '複製',
      copied: '已複製',
    },
    android: {
      step1: '點右上角的選單',
      step2Html: '找「<strong>安裝應用程式</strong>」或「<strong>加到主畫面</strong>」',
      step3: '確認後，icon 會出現在你的主畫面',
    },
    desktop: {
      step1: '看網址列右側，會有一個小小的安裝按鈕',
      step2: '點下去，確認安裝',
      step3: 'Futari 會像一個獨立的 app 開啟',
    },
    fallbackHtml: '在你的瀏覽器選單裡找「<strong>加到主畫面</strong>」或「<strong>安裝應用程式</strong>」。不同瀏覽器位置不太一樣，但通常都在右上的選單裡。',
  },

  migrate: {
    backToHome: '← 回 Futari 首頁',
    upload: {
      prompt: '把 CSV 拖到這裡，或選擇檔案',
      button: '選擇 CSV',
      constraint: '檔案只會在你的瀏覽器解析，不會上傳。',
      parsing: '解析中⋯',
      error: '讀不懂這個檔案。確認是 CSV 後再試一次。',
      retry: '換一個檔案',
    },
    preview: {
      title: '看一下你的資料長什麼樣',
      sourceLabel: '來源 · {source}',
      encodingLabel: '編碼 · {encoding}',
      totalRowsLabel: '{count} 筆紀錄',
      expenseRowsLabel: '約 {count} 筆支出',
      dateRangeLabel: '{first} ~ {last}',
      topCategoriesLabel: '常出現的分類',
      empty: '這個檔案沒有可預覽的內容。',
    },
    cta: {
      button: '建立帳號，把這些搬進來',
      hint: '建立完帳號再把這份 CSV 匯入，原本記過的不用再記一次。',
      privacyNote: '預覽只在你的瀏覽器跑，沒有東西被傳出去。',
    },
    sources: {
      unknown: '其他',
    },
    differentiatorsHeading: '為什麼選 Futari',
    faqHeading: '常見問題',
    comparisonHeading: 'Futari vs {other}',
    trust: {
      heading: '為什麼可以放心搬過來',
      items: [
        {
          title: '端對端加密',
          body: '你們之外，沒有人能看見這本帳的內容。',
        },
        {
          title: '隨時可以帶走',
          body: '不喜歡的話，整本帳隨時匯出 CSV，搬家不是綁約的起點。',
        },
        {
          title: '免費長期使用',
          body: '核心記帳永遠免費，不靠廣告或拍賣資料生活。',
        },
      ],
    },
    footerTrust: '端對端加密 · 資料只屬於你們兩個',
    otherSources: {
      heading: '從其他工具搬過來',
      cta: '看搬遷指南',
      items: {
        honeydue: {
          name: 'Honeydue',
          description: '伴侶記帳 App，2024 年後更新放緩。',
        },
        spendee: {
          name: 'Spendee',
          description: '共享帳本要解鎖才用得到，匯出 CSV 帶過來。',
        },
        cwmoney: {
          name: 'CWMoney',
          description: '台灣常見的單人記帳工具，用模板轉成 CSV 即可。',
        },
        moneybook: {
          name: '麻布記帳',
          description: '台灣的自動同步記帳 App，匯出 CSV 帶過來。',
        },
        andromoney: {
          name: 'AndroMoney',
          description: '老牌的單人記帳 App，匯出 CSV 帶過來。',
        },
        mobills: {
          name: 'Mobills',
          description: '國際個人理財 App，匯出 CSV 帶過來。',
        },
        manebo: {
          name: 'Manebo',
          description: '台灣熱門的情侶記帳 App，匯出 CSV 帶過來。',
        },
        'simple-daily-money': {
          name: '簡單記帳',
          description: '台灣常用的個人記帳 App，截圖請 ChatGPT 整理成 CSV 帶過來。',
        },
        'fortune-city': {
          name: '記帳城市',
          description: '把記帳變成蓋城市的遊戲，截圖請 ChatGPT 整理成 CSV 帶過來。',
        },
        cashman: {
          name: 'CashMan',
          description: '老牌的台灣個人記帳 App，截圖請 ChatGPT 整理成 CSV 帶過來。',
        },
        '1money': {
          name: '1Money',
          description: '介面簡潔的記帳 App，截圖請 ChatGPT 整理成 CSV 帶過來。',
        },
        icost: {
          name: 'iCost',
          description: 'iOS 上人氣的記帳 App，截圖請 ChatGPT 整理成 CSV 帶過來。',
        },
        suishouji: {
          name: '隨手記',
          description: '兩岸用戶眾多的記帳 App，截圖請 ChatGPT 整理成 CSV 帶過來。',
        },
      },
    },
    chatgptWorkflow: {
      heading: '沒有 CSV 匯出？用截圖換',
      intro: '如果原本的 App 沒有 CSV 匯出，可以用截圖請 ChatGPT 幫你整理成 CSV，再上傳。免費版的 ChatGPT 就能做。',
      substeps: [
        '打開原本的記帳 App，把你想搬遷的交易截圖——往下捲動蓋過所有你要帶走的記錄。',
        '複製下方的提示詞，貼進 ChatGPT，再把截圖一張一張上傳。',
        'ChatGPT 會輸出一個 CSV 程式碼區塊——把全部內容複製，貼進記事本，存成 .csv 檔。',
        '把 .csv 上傳到下方的匯入工具，預覽無誤後建立帳號完成匯入。',
      ],
      promptLabel: '提示詞（點擊複製）',
      prompt: `請幫我把這些截圖裡的記帳資料整理成 CSV 格式。

要求：
- CSV 第一列為 header：date,category,amount,description,currency,kind
- date 用 YYYY-MM-DD；如果截圖只顯示月/日（例如 5/30），假設年份為當年
- amount 用正整數（不要負號、不要小數）；如果原本顯示為支出或紅字／負號，kind 填 "expense"；如果是收入或綠字，kind 填 "income"
- category 保留原始截圖上的分類文字（中文／英文都原樣）
- description 保留商家名或備註欄文字；如果沒有，留空白
- currency 用 ISO 4217 三位代碼（TWD／USD／JPY／CNY⋯）；如果截圖沒寫，預設 TWD
- 同一筆交易（相同日期＋金額＋描述）若在多張截圖重複出現，只保留一筆
- 輸出時，只在一個 \`\`\`csv 程式碼區塊內輸出 CSV 內容，前後不要加任何說明文字

確認後我會上傳截圖。`,
      copy: '複製提示詞',
      copied: '已複製',
      formatLabel: 'CSV 會長這樣',
      formatExample: `date,category,amount,description,currency,kind
2026-05-30,飲食,150,星巴克,TWD,expense
2026-05-30,薪水,50000,五月,TWD,income`,
      note: 'currency 不是 TWD 的會照原數字先匯入，換算可以在匯入後逐筆調整。重複出現的同一筆（相同日期＋金額＋描述）會自動去掉。',
    },
    pages: {
      honeydue: {
        heroKicker: 'HONEYDUE → FUTARI',
        heroTitle: '你的 Honeydue 資料，可以帶走',
        heroSubtitle: '從 Honeydue 搬遷到 Futari 只要三分鐘——上傳 CSV，這幾年的記帳完整保留。',
        intro: 'Honeydue 自 2024 年起已由原團隊轉手，更新節奏放緩、客服回覆變慢。如果你在找一個還在持續維護的雙人記帳工具，Futari 是從 Honeydue 搬過來的好選擇——免費、無廣告、資料加密。',
        differentiators: [
          {
            title: '仍在持續迭代',
            body: '每兩週都有新版本，bug 看得到、回饋有人讀。',
          },
          {
            title: '兩個人都看得到所有紀錄',
            body: '沒有「分開帳戶」的不對稱能見度，從一開始就為共同的家設計。',
          },
          {
            title: '免費、無廣告',
            body: '核心記帳永遠免費，不靠廣告或資料變現。',
          },
        ],
        stepsHeading: '搬遷三步',
        step1: '在 Honeydue App → 設定 → 匯出資料，下載 CSV。',
        step2: '把 CSV 上傳到這裡，預覽你的記帳歷史。',
        step3: '建立 Futari 帳號，一鍵完成搬遷。',
        faq: [
          {
            question: '匯入後資料需要再整理嗎？',
            answer: '類別可在匯入流程中對照調整，一次完成，不需要事後手動修改。',
          },
          {
            question: '匯入需要付費嗎？',
            answer: 'Futari 完全免費，沒有隱藏費用。',
          },
          {
            question: '原本的記帳記錄能全部帶過來嗎？',
            answer: '支援 CSV 格式匯入，大部分記錄都能轉移。特殊類型（如轉帳）會標記供你確認。',
          },
          {
            question: 'Honeydue 的共同帳本功能，Futari 有嗎？',
            answer: '有。Futari 就是為兩個人設計的，所有記錄都在同一個帳本，可以各自查看與新增。',
          },
        ],
      },
      spendee: {
        heroKicker: 'SPENDEE → FUTARI',
        heroTitle: '你的 Spendee 資料，可以帶走',
        heroSubtitle: '從 Spendee 匯入記帳記錄到 Futari，上傳 CSV 預覽完整紀錄再決定要不要搬。',
        differentiators: [
          {
            title: '雙人是核心，不是付費才解鎖',
            body: '共享帳本不在訂閱牆後面，從第一天就免費共用。',
          },
          {
            title: '即時同步',
            body: '一個人記下，另一個人馬上看見，不用等對方刷新。',
          },
          {
            title: '免費、無廣告',
            body: '不靠廣告或拍賣資料生活，記帳就是記帳。',
          },
        ],
        stepsHeading: '搬遷三步',
        step1: '在 Spendee → More → Export Data，下載 CSV。',
        step2: '把 CSV 上傳到這裡，預覽你的記帳歷史。',
        step3: '建立 Futari 帳號，一鍵完成搬遷。',
        formatHintLabel: 'Spendee CSV 的欄位長這樣',
        formatHintHeaders: 'Date,Wallet,Type,Category name,Amount,Currency,Note',
        formatHintNote: 'Type 欄位是「Expense / Income / Transfer」。Transfer（帳戶間轉帳）匯入時會被標記為錯誤——Futari 不存轉帳，請在預覽階段刪除這幾列。',
        faq: [
          {
            question: '匯入後資料需要再整理嗎？',
            answer: '類別可在匯入流程中對照調整，一次完成，不需要事後手動修改。',
          },
          {
            question: '匯入需要付費嗎？',
            answer: 'Futari 完全免費，沒有隱藏費用。',
          },
          {
            question: '原本的記帳記錄能全部帶過來嗎？',
            answer: '支援 CSV 格式匯入，大部分記錄都能轉移。特殊類型（如轉帳）會標記供你確認。',
          },
          {
            question: 'Spendee 的分攤功能，Futari 支援嗎？',
            answer: '支援。Futari 內建多種分攤方式：各付各、全由一方負擔、對半分、自訂比例。',
          },
        ],
      },
      cwmoney: {
        heroKicker: 'CWMONEY → FUTARI',
        heroTitle: '你的 CWMoney 資料，可以帶走',
        heroSubtitle: 'CWMoney 資料匯出匯入指南：用轉換模板把 Excel 整理成 CSV，再上傳到 Futari。',
        differentiators: [
          {
            title: '雙人帳本是預設',
            body: '不必再靠折衷的工作流接合兩本各自的帳。',
          },
          {
            title: '台幣整數金額',
            body: '數字直接就是新台幣，不用再換算分位。',
          },
          {
            title: '紀錄不評判',
            body: '沒有評分、不打分數、不暗示誰花得太多。',
          },
        ],
        stepsHeading: '搬遷三步',
        step1: '在 CWMoney 匯出 Excel 格式的記帳資料（需 VIP）。',
        step2: '下載下方的轉換模板，把資料貼進去。',
        step3: '上傳轉換後的 CSV，預覽並建立帳號匯入。',
        templateDownloadLabel: '下載轉換模板',
        templateNote: '模板會把 CWMoney 的欄位對應到 Futari 支援的格式。',
        faq: [
          {
            question: '匯入後資料需要再整理嗎？',
            answer: '類別可在匯入流程中對照調整，一次完成，不需要事後手動修改。',
          },
          {
            question: '匯入需要付費嗎？',
            answer: 'Futari 完全免費，沒有隱藏費用。',
          },
          {
            question: '原本的記帳記錄能全部帶過來嗎？',
            answer: '支援 CSV 格式匯入，大部分記錄都能轉移。特殊類型（如轉帳）會標記供你確認。',
          },
          {
            question: 'CWMoney 的資產功能，Futari 有對應嗎？',
            answer: 'Futari 有「愛物」功能，可以記錄車、房子、保險等共同資產的相關支出。',
          },
        ],
      },
      moneybook: {
        heroKicker: 'MONEYBOOK → FUTARI',
        heroTitle: '你的麻布記帳資料，可以帶走',
        heroSubtitle: '從麻布記帳搬到 Futari：匯出交易明細 CSV，上傳預覽後，和伴侶一起把這些記錄接著寫下去。',
        differentiators: [
          {
            title: '兩個人的帳，不是一個人的工具',
            body: '麻布記帳是為個人對帳設計的；Futari 從第一天就假設使用者是兩個人，共同的帳一起記、一起看。',
          },
          {
            title: '分攤算給你看',
            body: '誰付的、怎麼分、現在誰欠誰，餘額自動算清楚，不用自己在心裡記。',
          },
          {
            title: '免費、無廣告',
            body: '核心記帳永遠免費，不靠廣告或拍賣資料生活。',
          },
        ],
        stepsHeading: '搬遷三步',
        step1: '在麻布記帳匯出交易明細，下載 CSV 檔。',
        step2: '把 CSV 上傳到這裡，預覽你的記帳歷史。',
        step3: '建立 Futari 帳號，一鍵完成搬遷。',
        faq: [
          {
            question: '麻布記帳的欄位和 Futari 一樣嗎？',
            answer: '不完全一樣。上傳後會先預覽解析結果，正式匯入時可以對照調整分類與欄位，不會直接寫進帳本。',
          },
          {
            question: '匯入需要付費嗎？',
            answer: 'Futari 完全免費，沒有隱藏費用。',
          },
          {
            question: '原本的記帳記錄能全部帶過來嗎？',
            answer: '支援 CSV 格式匯入，大部分記錄都能轉移。格式特殊或無法辨識的列會標記出來，供你確認。',
          },
          {
            question: '麻布記帳會自動同步銀行，Futari 也會嗎？',
            answer: 'Futari 目前以手動記帳為主，專注在兩個人一起記下每筆共同支出；自動同步銀行不在現階段範圍。',
          },
        ],
      },
      andromoney: {
        heroKicker: 'ANDROMONEY → FUTARI',
        heroTitle: '你的 AndroMoney 資料，可以帶走',
        heroSubtitle: '從 AndroMoney 搬到 Futari：匯出 CSV，上傳預覽後，把多年的記帳和伴侶一起接著寫。',
        differentiators: [
          {
            title: '雙人帳本是預設',
            body: 'AndroMoney 是單人記帳的好手；Futari 則是為兩個人共用一本帳設計，記錄彼此都看得到。',
          },
          {
            title: '即時同步',
            body: '一個人記下，另一個人馬上看見，不用互傳截圖或檔案對帳。',
          },
          {
            title: '免費、無廣告',
            body: '核心記帳永遠免費，不靠廣告或資料變現。',
          },
        ],
        stepsHeading: '搬遷三步',
        step1: '在 AndroMoney → 設定 → 匯出，把資料輸出成 CSV。',
        step2: '把 CSV 上傳到這裡，預覽你的記帳歷史。',
        step3: '建立 Futari 帳號，一鍵完成搬遷。',
        faq: [
          {
            question: '匯入後資料需要再整理嗎？',
            answer: '類別可在匯入流程中對照調整，一次完成，不需要事後手動修改。',
          },
          {
            question: '匯入需要付費嗎？',
            answer: 'Futari 完全免費，沒有隱藏費用。',
          },
          {
            question: '原本的記帳記錄能全部帶過來嗎？',
            answer: '支援 CSV 格式匯入，大部分記錄都能轉移。特殊類型（如轉帳）會標記供你確認。',
          },
          {
            question: 'AndroMoney 的多帳戶，Futari 有對應嗎？',
            answer: 'Futari 是一本共同帳本，專注在兩個人的共同收支；不分多帳戶，而是用分攤模式記下每筆是誰付、怎麼分。',
          },
        ],
      },
      mobills: {
        heroKicker: 'MOBILLS → FUTARI',
        heroTitle: '你的 Mobills 資料，可以帶走',
        heroSubtitle: '從 Mobills 搬到 Futari：匯出 CSV，上傳預覽後，和伴侶一起把記錄接著寫下去。',
        differentiators: [
          {
            title: '雙人共用，不是各記各的',
            body: 'Mobills 以個人理財為主；Futari 是兩個人共用的一本帳，共同支出記一次，兩邊都看得到。',
          },
          {
            title: '分攤與結算內建',
            body: '對半、依比例、各付各、由一方負擔——選好之後，誰欠誰自動算清。',
          },
          {
            title: '免費、無廣告',
            body: '核心記帳永遠免費，不靠廣告或拍賣資料生活。',
          },
        ],
        stepsHeading: '搬遷三步',
        step1: '在 Mobills 匯出交易紀錄，下載 CSV 檔。',
        step2: '把 CSV 上傳到這裡，預覽你的記帳歷史。',
        step3: '建立 Futari 帳號，一鍵完成搬遷。',
        faq: [
          {
            question: '匯入後資料需要再整理嗎？',
            answer: '類別可在匯入流程中對照調整，一次完成，不需要事後手動修改。',
          },
          {
            question: '匯入需要付費嗎？',
            answer: 'Futari 完全免費，沒有隱藏費用。',
          },
          {
            question: '原本的記帳記錄能全部帶過來嗎？',
            answer: '支援 CSV 格式匯入，大部分記錄都能轉移。特殊類型（如轉帳）會標記供你確認。',
          },
          {
            question: 'Mobills 有預算功能，Futari 有嗎？',
            answer: 'Futari 不做預算上限，也不會提醒你超支——它記下你們花過的錢，呈現結果，但不替你們打分數。',
          },
        ],
      },
      manebo: {
        heroKicker: 'MANEBO → FUTARI',
        heroTitle: '你的 Manebo 資料，可以帶走',
        heroSubtitle: '從 Manebo 搬到 Futari：匯出交易 CSV，上傳預覽後，和伴侶一起把記錄接著寫下去。',
        differentiators: [
          {
            title: '兩個人共用，不是各記各的',
            body: 'Manebo 以個人記帳為核心；Futari 從第一天就假設使用者是兩個人，共同支出記一次、兩邊都看得到。',
          },
          {
            title: '分攤與結算內建',
            body: '對半、依比例、各付各、由一方負擔——選好之後，誰欠誰自動算清，不用再傳 LINE 對帳。',
          },
          {
            title: '免費、無廣告',
            body: '核心記帳永遠免費，不靠廣告或拍賣資料生活。',
          },
        ],
        stepsHeading: '搬遷三步',
        step1: '在 Manebo → 設定 → 匯出，把記帳資料輸出成 CSV。',
        step2: '把 CSV 上傳到這裡，預覽你的記帳歷史。',
        step3: '建立 Futari 帳號，一鍵完成搬遷。',
        faq: [
          {
            question: 'Manebo 的欄位和 Futari 一樣嗎？',
            answer: '不完全一樣。上傳後會先預覽解析結果，正式匯入時可以對照調整分類與欄位，不會直接寫進帳本。',
          },
          {
            question: '匯入需要付費嗎？',
            answer: 'Futari 完全免費，沒有隱藏費用。',
          },
          {
            question: '原本的記帳記錄能全部帶過來嗎？',
            answer: '支援 CSV 格式匯入，大部分記錄都能轉移。格式特殊或無法辨識的列會標記出來，供你確認。',
          },
          {
            question: 'Manebo 支援多帳本，Futari 怎麼處理？',
            answer: 'Futari 是一本兩人共用的帳，不分多帳本；用分攤模式記下每筆是誰付、怎麼分，餘額自動算清。',
          },
        ],
      },
      'simple-daily-money': {
        heroKicker: 'SIMPLE DAILY MONEY → FUTARI',
        heroTitle: '你的簡單記帳資料，可以帶走',
        heroSubtitle: '簡單記帳沒有 CSV 匯出，但用截圖請 ChatGPT 整理成 CSV，一樣能把記錄搬到 Futari，和伴侶一起接著寫。',
        differentiators: [
          {
            title: '兩個人一起記，不是各記各的',
            body: '簡單記帳很適合一個人快速記；Futari 則是兩個人共用一本帳，每筆共同支出記一次，兩邊都看得到。',
          },
          {
            title: '分攤與結算內建',
            body: '對半、依比例、各付各、由一方負擔——選好之後，誰欠誰自動算清。',
          },
          {
            title: '雲端同步、隨時帶走',
            body: '記錄存在雲端，換手機不怕不見；想離開時 CSV 匯出，資料是你們的。',
          },
        ],
        stepsHeading: '搬遷三步',
        step1: '在簡單記帳把要搬的交易截圖（下方有完整做法）。',
        step2: '用 ChatGPT 把截圖整理成 CSV——下方有可直接複製的提示詞。',
        step3: '把 CSV 上傳到這裡，預覽後建立帳號完成匯入。',
        faq: [
          {
            question: '簡單記帳沒有匯出功能，資料真的搬得過來嗎？',
            answer: '可以。用截圖請 ChatGPT 整理成 CSV 再上傳——下方有完整步驟和可複製的提示詞，免費版 ChatGPT 就能做。',
          },
          {
            question: '要截幾張圖？',
            answer: '建議 5–10 張，往下捲動蓋過你想搬的時間範圍即可。同一筆重複出現的會自動去掉。',
          },
          {
            question: '匯入需要付費嗎？',
            answer: 'Futari 完全免費，沒有隱藏費用。',
          },
          {
            question: 'ChatGPT 整理的分類會不會跑掉？',
            answer: '分類文字會原樣保留，上傳後先預覽，正式匯入時可以對照調整成 Futari 的分類。',
          },
        ],
      },
      'fortune-city': {
        heroKicker: 'FORTUNE CITY → FUTARI',
        heroTitle: '你的記帳城市資料，可以帶走',
        heroSubtitle: '記帳城市把記帳變成遊戲；想把記錄搬到 Futari 和伴侶一起記？用截圖請 ChatGPT 整理成 CSV 就行。',
        differentiators: [
          {
            title: '兩個人一起記，不是各記各的',
            body: '記帳城市是一個人的城市；Futari 是兩個人共用一本帳，每筆共同支出記一次，兩邊都看得到。',
          },
          {
            title: '分攤與結算內建',
            body: '對半、依比例、各付各、由一方負擔——選好之後，誰欠誰自動算清。',
          },
          {
            title: '把記錄帶著走',
            body: '想離開時 CSV 匯出，資料是你們的，不會被鎖在某一座城市裡。',
          },
        ],
        stepsHeading: '搬遷三步',
        step1: '在記帳城市把要搬的交易截圖（下方有完整做法）。',
        step2: '用 ChatGPT 把截圖整理成 CSV——下方有可直接複製的提示詞。',
        step3: '把 CSV 上傳到這裡，預覽後建立帳號完成匯入。',
        faq: [
          {
            question: '記帳城市沒有匯出功能，資料真的搬得過來嗎？',
            answer: '可以。把交易畫面截圖請 ChatGPT 整理成 CSV 再上傳——下方有完整步驟和可複製的提示詞，免費版 ChatGPT 就能做。',
          },
          {
            question: '要截幾張圖？',
            answer: '建議 5–10 張，往下捲動蓋過你想搬的時間範圍即可。重複出現的同一筆會自動去掉。',
          },
          {
            question: '匯入需要付費嗎？',
            answer: 'Futari 完全免費，沒有隱藏費用。',
          },
          {
            question: '記帳城市的遊戲進度會一起搬嗎？',
            answer: '不會，搬過來的是你的記帳資料（日期、金額、分類）；遊戲進度留在原 App，Futari 專注在兩個人的帳本本身。',
          },
        ],
      },
      cashman: {
        heroKicker: 'CASHMAN → FUTARI',
        heroTitle: '你的 CashMan 資料，可以帶走',
        heroSubtitle: '用了很久的 CashMan，想換成兩個人一起記？用截圖請 ChatGPT 整理成 CSV，就能把記錄搬到 Futari。',
        differentiators: [
          {
            title: '雙人帳本是預設',
            body: 'CashMan 是單人記帳的老幫手；Futari 一開始就為兩個人共用一本帳設計，記錄彼此都看得到。',
          },
          {
            title: '分攤算給你看',
            body: '誰付的、怎麼分、現在誰欠誰，餘額自動算清楚，不用自己記。',
          },
          {
            title: '雲端同步、隨時帶走',
            body: '記錄存在雲端，換手機不怕不見；想離開時 CSV 匯出，資料是你們的。',
          },
        ],
        stepsHeading: '搬遷三步',
        step1: '在 CashMan 把要搬的交易截圖（下方有完整做法）。',
        step2: '用 ChatGPT 把截圖整理成 CSV——下方有可直接複製的提示詞。',
        step3: '把 CSV 上傳到這裡，預覽後建立帳號完成匯入。',
        faq: [
          {
            question: 'CashMan 沒有匯出功能，資料真的搬得過來嗎？',
            answer: '可以。把交易畫面截圖請 ChatGPT 整理成 CSV 再上傳——下方有完整步驟和可複製的提示詞，免費版 ChatGPT 就能做。',
          },
          {
            question: '要截幾張圖？',
            answer: '建議 5–10 張，往下捲動蓋過你想搬的時間範圍即可。重複出現的同一筆會自動去掉。',
          },
          {
            question: '匯入需要付費嗎？',
            answer: 'Futari 完全免費，沒有隱藏費用。',
          },
          {
            question: '用很久了，幾年的記錄都能搬嗎？',
            answer: '可以，只要截圖蓋到的範圍都能整理成 CSV；筆數多的話分批截圖、分批上傳即可。',
          },
        ],
      },
      '1money': {
        heroKicker: '1MONEY → FUTARI',
        heroTitle: '你的 1Money 資料，可以帶走',
        heroSubtitle: '喜歡 1Money 的簡潔，但想兩個人一起記？用截圖請 ChatGPT 整理成 CSV，就能搬到 Futari。',
        differentiators: [
          {
            title: '兩個人共用一本帳',
            body: '1Money 以個人記帳為主；Futari 是兩個人共用的一本帳，共同支出記一次，兩邊都看得到。',
          },
          {
            title: '分攤與結算內建',
            body: '對半、依比例、各付各、由一方負擔——選好之後，誰欠誰自動算清。',
          },
          {
            title: '多幣別也記得清楚',
            body: '出國或跨幣別的支出照樣記，回頭看帳目一樣清楚。',
          },
        ],
        stepsHeading: '搬遷三步',
        step1: '在 1Money 把要搬的交易截圖（下方有完整做法）。',
        step2: '用 ChatGPT 把截圖整理成 CSV——下方有可直接複製的提示詞。',
        step3: '把 CSV 上傳到這裡，預覽後建立帳號完成匯入。',
        faq: [
          {
            question: '1Money 沒有完整匯出，資料真的搬得過來嗎？',
            answer: '即使沒有完整匯出，把交易截圖請 ChatGPT 整理成 CSV 一樣能搬——下方有完整步驟和可複製的提示詞，免費版 ChatGPT 就能做。',
          },
          {
            question: '要截幾張圖？',
            answer: '建議 5–10 張，往下捲動蓋過你想搬的時間範圍即可。重複出現的同一筆會自動去掉。',
          },
          {
            question: '匯入需要付費嗎？',
            answer: 'Futari 完全免費，沒有隱藏費用。',
          },
          {
            question: '多幣別的記錄會跑掉嗎？',
            answer: '幣別會一起整理進 CSV；非台幣的會照原數字先匯入，換算可以在匯入後逐筆調整。',
          },
        ],
      },
      icost: {
        heroKicker: 'ICOST → FUTARI',
        heroTitle: '你的 iCost 資料，可以帶走',
        heroSubtitle: 'iCost 只有 iOS，想兩個人跨平台一起記？用截圖請 ChatGPT 整理成 CSV，就能搬到 Futari。',
        differentiators: [
          {
            title: '兩個人、跨平台一起記',
            body: 'iCost 限 iOS；Futari 是 iOS／Android／Web 都能用的雙人帳本，另一半用什麼手機都行。',
          },
          {
            title: '分攤與結算內建',
            body: '對半、依比例、各付各、由一方負擔——選好之後，誰欠誰自動算清。',
          },
          {
            title: '免費、無廣告',
            body: '核心記帳永遠免費，不靠廣告或拍賣資料生活。',
          },
        ],
        stepsHeading: '搬遷三步',
        step1: '在 iCost 把要搬的交易截圖（下方有完整做法）。',
        step2: '用 ChatGPT 把截圖整理成 CSV——下方有可直接複製的提示詞。',
        step3: '把 CSV 上傳到這裡，預覽後建立帳號完成匯入。',
        faq: [
          {
            question: 'iCost 沒有匯出功能，資料真的搬得過來嗎？',
            answer: '可以。把交易畫面截圖請 ChatGPT 整理成 CSV 再上傳——下方有完整步驟和可複製的提示詞，免費版 ChatGPT 就能做。',
          },
          {
            question: '要截幾張圖？',
            answer: '建議 5–10 張，往下捲動蓋過你想搬的時間範圍即可。重複出現的同一筆會自動去掉。',
          },
          {
            question: '匯入需要付費嗎？',
            answer: 'Futari 完全免費，沒有隱藏費用。',
          },
          {
            question: '另一半用 Android，也能一起用嗎？',
            answer: '可以。Futari 是跨平台的 PWA，iOS、Android、瀏覽器都能開，兩個人用不同手機也能共用同一本帳。',
          },
        ],
      },
      suishouji: {
        heroKicker: 'SUISHOUJI → FUTARI',
        heroTitle: '你的隨手記資料，可以帶走',
        heroSubtitle: '隨手記用戶很多；想要一個一開始就為兩個人設計的帳本？用截圖請 ChatGPT 整理成 CSV，就能搬到 Futari。',
        differentiators: [
          {
            title: '雙人是預設，不用另設共享',
            body: '隨手記要另外開共享帳本；Futari 進來就是兩個人的帳，不必額外設定。',
          },
          {
            title: '分攤與結算內建',
            body: '對半、依比例、各付各、由一方負擔——選好之後，誰欠誰自動算清。',
          },
          {
            title: '免費、無廣告',
            body: '核心記帳永遠免費，不靠廣告或拍賣資料生活。',
          },
        ],
        stepsHeading: '搬遷三步',
        step1: '在隨手記把要搬的交易截圖（下方有完整做法）。',
        step2: '用 ChatGPT 把截圖整理成 CSV——下方有可直接複製的提示詞。',
        step3: '把 CSV 上傳到這裡，預覽後建立帳號完成匯入。',
        faq: [
          {
            question: '隨手記的資料怎麼搬到 Futari？',
            answer: '把交易畫面截圖請 ChatGPT 整理成 CSV 再上傳——下方有完整步驟和可複製的提示詞，免費版 ChatGPT 就能做。',
          },
          {
            question: '要截幾張圖？',
            answer: '建議 5–10 張，往下捲動蓋過你想搬的時間範圍即可。重複出現的同一筆會自動去掉。',
          },
          {
            question: '匯入需要付費嗎？',
            answer: 'Futari 完全免費，沒有隱藏費用。',
          },
          {
            question: '隨手記有共享帳本，跟 Futari 一樣嗎？',
            answer: 'Futari 不需要另外開共享——進來就是兩個人的共同帳，還內建分攤與結算，這是它和單人 App 加共享功能最不一樣的地方。',
          },
        ],
      },
    },
  },

  seo: {
    landing: {
      title: 'Futari · 兩個人，一本帳｜伴侶共享記帳 PWA',
      description: 'Futari 是為夫妻、情侶設計的共同記帳 PWA，兩個人一起記帳、自動分攤花費、AA 結算，從日常開銷到旅行、愛車與資產，輕鬆看見兩個人的生活全貌。',
      ogDescription: 'Futari 是為夫妻、伴侶設計的共同帳本——一起記帳、自動分攤、AA 結算，看見兩個人的生活全貌。',
    },
    signIn: {
      title: '登入 Futari · 開始兩個人的記帳生活',
      description: '用 Google 帳號登入 Futari，開始與伴侶共享家計、紀錄日常開銷與愛車油耗、照看保險與愛物的雙人記帳 PWA。',
      ogDescription: '用 Google 一鍵登入，開始兩個人的家計簿。',
    },
    terms: {
      title: '服務條款 · Futari',
      description: 'Futari alpha 測試版本的服務條款與使用者注意事項。',
    },
    privacy: {
      title: '隱私權政策 · Futari',
      description: 'Futari alpha 測試版本的資料蒐集與隱私權處理方式。',
    },
    migrate: {
      honeydue: {
        title: '從 Honeydue 搬家到 Futari｜資料匯入',
        description: 'Honeydue 替代方案首選。Futari 是專為夫妻、伴侶設計的共同帳本，3 分鐘完成搬家、繼續一起記帳。免費、無廣告、端對端加密。',
        ogDescription: 'Honeydue 用戶的下一站：3 分鐘搬遷到 Futari，雙人記帳繼續。',
      },
      spendee: {
        title: '從 Spendee 搬家到 Futari｜CSV 匯入',
        description: 'Spendee 伴侶記帳替代方案——把 Spendee 的 CSV 匯入 Futari，這個專為夫妻、伴侶設計的共同帳本，雙人共享免費內建，不必再為解鎖付費。',
        ogDescription: 'Spendee 用戶的雙人記帳新選擇：上傳 CSV，3 分鐘搬完。',
      },
      cwmoney: {
        title: '從 CWMoney 搬家到 Futari｜Excel 匯入',
        description: 'CWMoney 資料匯出後怎麼匯入新工具？用我們提供的 Excel 轉換模板整理成 CSV，再上傳到 Futari 這個專為夫妻、伴侶設計的共同帳本，完成搬家。',
        ogDescription: 'CWMoney 用戶搬家指南：Excel 轉 CSV，搬進 Futari 雙人記帳。',
      },
      moneybook: {
        title: '從麻布記帳搬家到 Futari｜CSV 匯入',
        description: '麻布記帳資料怎麼搬到雙人帳本？把交易明細匯出成 CSV，上傳到 Futari 這個專為夫妻、伴侶設計的共同帳本，和對方一起接著記。免費、無廣告、端對端加密。',
        ogDescription: '麻布記帳用戶的雙人記帳新選擇：匯出 CSV，搬進 Futari。',
      },
      andromoney: {
        title: '從 AndroMoney 搬家到 Futari｜CSV 匯入',
        description: 'AndroMoney 資料匯出後怎麼搬到雙人帳本？把 CSV 匯入 Futari 這個專為夫妻、伴侶設計的共同帳本，和對方一起接著記帳。免費、無廣告、端對端加密。',
        ogDescription: 'AndroMoney 用戶的雙人記帳新選擇：匯出 CSV，搬進 Futari。',
      },
      mobills: {
        title: '從 Mobills 搬家到 Futari｜CSV 匯入',
        description: 'Mobills 資料匯出後怎麼搬到雙人帳本？把 CSV 匯入 Futari 這個專為夫妻、伴侶設計的共同帳本，和對方一起接著記帳。免費、無廣告、端對端加密。',
        ogDescription: 'Mobills 用戶的雙人記帳新選擇：匯出 CSV，搬進 Futari。',
      },
      manebo: {
        title: '從 Manebo 搬家到 Futari｜情侶共同記帳',
        description: 'Manebo 用戶的雙人記帳新選擇。把 Manebo 的 CSV 匯入 Futari——這個專為情侶、夫妻設計的共同帳本，內建分攤結算、免費無廣告，和對方一起接著記。',
        ogDescription: 'Manebo 用戶的下一站：匯出 CSV，搬進 Futari 情侶共同記帳。',
      },
      'simple-daily-money': {
        title: '從簡單記帳搬家到 Futari｜截圖轉 CSV',
        description: '簡單記帳沒有 CSV 匯出？截圖請 ChatGPT 整理成 CSV，上傳到 Futari 這個專為夫妻、伴侶設計的共同帳本，和對方一起接著記。免費、無廣告、端對端加密。',
        ogDescription: '簡單記帳用戶搬家指南：截圖→ChatGPT→CSV，搬進 Futari 雙人記帳。',
      },
      'fortune-city': {
        title: '從記帳城市搬家到 Futari｜截圖轉 CSV',
        description: '記帳城市沒有 CSV 匯出？截圖請 ChatGPT 整理成 CSV，上傳到 Futari 這個專為夫妻、伴侶設計的共同帳本，兩個人一起接著記。免費、無廣告、端對端加密。',
        ogDescription: '記帳城市用戶搬家指南：截圖→ChatGPT→CSV，搬進 Futari 雙人記帳。',
      },
      cashman: {
        title: '從 CashMan 搬家到 Futari｜截圖轉 CSV',
        description: 'CashMan 沒有 CSV 匯出？截圖請 ChatGPT 整理成 CSV，上傳到 Futari 這個專為夫妻、伴侶設計的共同帳本，兩個人一起接著記。免費、無廣告、端對端加密。',
        ogDescription: 'CashMan 用戶搬家指南：截圖→ChatGPT→CSV，搬進 Futari 雙人記帳。',
      },
      '1money': {
        title: '從 1Money 搬家到 Futari｜截圖轉 CSV',
        description: '1Money 沒有完整匯出？截圖請 ChatGPT 整理成 CSV，上傳到 Futari 這個專為夫妻、伴侶設計的共同帳本，兩個人一起接著記。免費、無廣告、端對端加密。',
        ogDescription: '1Money 用戶搬家指南：截圖→ChatGPT→CSV，搬進 Futari 雙人記帳。',
      },
      icost: {
        title: '從 iCost 搬家到 Futari｜截圖轉 CSV',
        description: 'iCost 只有 iOS、沒有 CSV 匯出？截圖請 ChatGPT 整理成 CSV，上傳到 Futari 這個跨平台的雙人共同帳本，兩個人一起接著記。免費、無廣告、端對端加密。',
        ogDescription: 'iCost 用戶搬家指南：截圖→ChatGPT→CSV，搬進 Futari 雙人記帳。',
      },
      suishouji: {
        title: '從隨手記搬家到 Futari｜截圖轉 CSV',
        description: '隨手記想換成雙人帳本？截圖請 ChatGPT 整理成 CSV，上傳到 Futari 這個專為夫妻、伴侶設計的共同帳本，兩個人一起接著記。免費、無廣告、端對端加密。',
        ogDescription: '隨手記用戶搬家指南：截圖→ChatGPT→CSV，搬進 Futari 雙人記帳。',
      },
    },
    useCase: {
      cohabitation: {
        title: '同居 AA 制記帳｜同居生活費怎麼分？Futari',
        description: '同居生活費怎麼分才不傷感情？Futari 是專為伴侶設計的雙人帳本，支援 AA 對半、按比例、全額等多種分攤模式，輕鬆記下每筆同居開銷，清楚看見兩個人的生活。',
        ogDescription: '同居 AA 制最適合的記帳工具——Futari 雙人帳本，免費、無廣告、端對端加密。',
      },
      newlyweds: {
        title: '新婚家計分攤｜夫妻記帳怎麼記？Futari',
        description: '新婚生活費怎麼分攤？Futari 是為夫妻、伴侶設計的共同帳本，結婚後帳怎麼管一看就懂——日常開銷、愛物、旅行，兩個人的生活全都在一本帳裡。',
        ogDescription: '新婚夫妻的家計管理首選——Futari 雙人帳本，從日常到愛物，一起記。',
      },
      'pet-owners': {
        title: '寵物費用記帳｜貓咪醫療費、日常開銷怎麼記？Futari',
        description: '寵物家庭開銷怎麼記帳？Futari 讓你把貓咪、狗狗關聯到每筆支出，醫療費、疫苗、日常用品一目瞭然，兩個人一起照顧、一起記帳，看見毛孩的每一筆心意。',
        ogDescription: '寵物家庭的雙人記帳工具——Futari，把每筆費用關聯到毛孩，清楚看見愛的重量。',
      },
    },
  },
  useCase: {
    backToHome: '回首頁',
    featuresHeading: 'Futari 怎麼幫到你們',
    faqHeading: '常見問題',
    ctaLabel: '免費開始記帳',
    features: {
      split: {
        title: '多種分攤模式',
        body: 'AA 對半、按比例、全額由某一方負擔——選定之後，帳就幫你算好，不用每次手動換算。',
      },
      trip: {
        title: '旅行子帳本',
        body: '出遊的錢和日常帳分開記，回來之後清楚看見這趟誰出了多少，不需要在群組裡對帳。',
      },
      asset: {
        title: '愛物費用追蹤',
        body: '每筆支出可以關聯到你們共同照顧的對象——車、房、小孩、寵物、植物，費用自動歸類。',
      },
      realtime: {
        title: '即時同步',
        body: '其中一個人記下去，另一個人馬上看得到。不需要截圖傳 LINE，帳本就是對話本身。',
      },
      encrypt: {
        title: '端對端加密',
        body: '帳本只有你們兩個人看得到。伺服器不解密，也不讀你們記了什麼。',
      },
      history: {
        title: '章節式記憶',
        body: '同居、結婚、換工作、搬新家——每個人生階段都可以是一個新章節，過去的帳永遠在。',
      },
    },
    otherCases: {
      heading: '其他情境',
      cardAriaLabel: '查看 {slug} 頁面',
    },
    pages: {
      cohabitation: {
        heroKicker: '同居生活費 AA 制',
        heroTitle: '同居了，帳怎麼記才不傷感情？',
        heroSubtitle: '從第一筆房租開始，兩個人的帳就應該一起記。Futari 是從一開始就假設「使用者是兩個人」的帳本——不是個人記帳工具硬拗成雙人用途。',
        painPoints: [
          {
            heading: '「上個月到底誰多出了多少？」',
            body: '房租、水電、生活用品——同居支出很零碎，靠記憶或群組訊息很快就亂掉。Futari 讓每筆支出都清楚標記是誰付的、怎麼分攤，月底不用再對帳。',
          },
          {
            heading: '「AA 制還是按薪水比例比較公平？」',
            body: '沒有一種分法適合所有人。Futari 支援對半、按比例、全額負擔，選定之後帳自動算，換算的事交給工具，你們只需要專注在一起生活。',
          },
          {
            heading: '「搬在一起之後，才發現帳更難記了。」',
            body: '單身的時候自己記自己的，同居之後費用交錯，反而更難看清楚。Futari 讓兩個人的帳放在同一個地方，即時同步，一方記下去另一方馬上看到。',
          },
        ],
        faq: [
          {
            question: '同居記帳 app 有哪些選擇？',
            answer: 'Futari 是專為伴侶設計的雙人帳本，從一開始就預設兩個人一起使用，支援多種分攤模式、即時同步、端對端加密。不需要把個人記帳工具改造成雙人版。',
          },
          {
            question: '同居 AA 制要怎麼記帳比較清楚？',
            answer: '建議把每筆支出記下來並標記分攤方式——對半、按比例、或全額由某人負擔。Futari 會自動累計餘額，讓你隨時看到目前誰多出了多少，不需要月底才對帳。',
          },
          {
            question: 'Futari 要收費嗎？',
            answer: '基本功能完全免費，包含雙人帳本、多種分攤模式、即時同步與端對端加密。',
          },
        ],
      },
      newlyweds: {
        heroKicker: '新婚夫妻家計管理',
        heroTitle: '結婚之後，帳要怎麼一起管？',
        heroSubtitle: '新婚生活的第一本帳，從日常開銷到愛物、旅行，Futari 讓兩個人的生活費用都有地方安放。',
        painPoints: [
          {
            heading: '「結婚後各付各的，還是合在一起記？」',
            body: '新婚家計沒有標準答案。有人全合、有人部分合、有人維持各自 AA。Futari 支援各種模式，不管你們怎麼決定，帳本都能配合。',
          },
          {
            heading: '「車子、保險、未來買房——這些費用怎麼一起追蹤？」',
            body: '婚後的費用不只是日常開銷，還有愛物、保險、大筆支出。Futari 讓每筆支出可以關聯到具體的愛物，車的費用、保險費——各自歸位，不混在一起。',
          },
          {
            heading: '「出遊的錢和日常帳混在一起，回來之後根本算不清楚。」',
            body: '旅行支出另立帳本，回來之後清楚看見這趟誰出了多少。Futari 的旅行子帳本讓你不用在群組裡對帳，一切都已經記好了。',
          },
        ],
        faq: [
          {
            question: '新婚夫妻的家計怎麼管最好？',
            answer: '沒有最好的方式，只有最適合你們的方式。重要的是把帳記下來，讓兩個人都清楚目前的狀況。Futari 提供多種分攤模式，可以隨生活狀態調整。',
          },
          {
            question: '夫妻記帳要分開記還是合在一起？',
            answer: 'Futari 的設計是兩個人共用一本帳本，每筆支出都清楚標記是誰付的、怎麼分攤，而不是把兩個人的帳強制合并。你們可以選擇全額 AA、按比例，或某類支出由某人負擔。',
          },
          {
            question: 'Futari 支援什麼樣的愛物記錄？',
            answer: '目前支援車輛（含油耗紀錄）、房子、小孩、寵物、植物、保險和物品，每筆支出都可以關聯到對應的愛物，讓費用歸類更清晰。',
          },
        ],
      },
      'pet-owners': {
        heroKicker: '寵物家庭費用記帳',
        heroTitle: '毛孩的每一筆費用，都值得被記住。',
        heroSubtitle: '貓咪回診、狗狗疫苗、日常飼料——寵物費用很零碎，又很心疼。Futari 讓你把每筆支出關聯到你們的毛孩，清楚看見每一筆心意。',
        painPoints: [
          {
            heading: '「這個月在貓咪身上花了多少？」',
            body: '醫療費、疫苗、零食、玩具、美容——寵物費用分散在各種類別，很難知道整體花了多少。Futari 讓每筆支出都可以關聯到你們的毛孩，篩一下就看到全貌。',
          },
          {
            heading: '「我付了大部分，對方記得嗎？」',
            body: '兩個人一起養，費用卻可能都由某一方先墊。Futari 的分攤功能讓每筆支出都清楚標記，餘額自動累計，不需要特別去問「這次誰出比較多」。',
          },
          {
            heading: '「多貓家庭的費用怎麼分開追蹤？」',
            body: 'Futari 支援多個愛物——每隻貓、每隻狗都可以是一個獨立的記錄對象，醫療費直接關聯到對應的毛孩，不會混在一起。',
          },
        ],
        faq: [
          {
            question: '寵物費用記帳用什麼 app 比較好？',
            answer: 'Futari 是專為兩個人設計的帳本，支援把每筆支出關聯到你們共同照顧的寵物，讓醫療費、日常用品各自歸位。如果你們是兩個人一起養毛孩，Futari 是少數從設計上就考慮到這個情境的選擇。',
          },
          {
            question: '貓咪、狗狗的醫療費要怎麼記才清楚？',
            answer: '在 Futari 建立你們的毛孩作為「愛物」，每次回診或購買相關用品時關聯到這個愛物，費用就會自動歸類。想看這隻貓這個月花了多少，篩一下就出來了。',
          },
          {
            question: '如果養了兩隻以上，可以分開記嗎？',
            answer: '可以。Futari 支援多個愛物，每隻毛孩都可以獨立建立，各自的費用分開追蹤，不會混在一起。',
          },
        ],
      },
    },
  },
}
