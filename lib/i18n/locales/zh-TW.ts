export type Translations = {
  signIn: {
    tagline: string
    continueWithGoogle: string
    termsPrefix: string
    termsLink: string
    termsAnd: string
    privacyLink: string
    termsSuffix: string
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
    /** Trust pills next to the desktop CTA. */
    trustEncrypted: string
    trustFree: string
    trustPwa: string
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
    /** Footer trust note. */
    footerTrust: string
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
    /** Issue #367 — contextual surface shown when there's an active trip. */
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
    }
  }

  balanceHero: {
    monthlyIncome: string
    countLabel: string
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
      descriptionRequired: string
      noPartner: string
    }
  }

  compactRow: {
    /** Small badge appended to a transaction row when its status is 'pending'. */
    pendingBadge: string
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
    /** Tertiary link to /settings/currency — surfaced from trip context only
     *  (issue #366). Settings top-level no longer lists 心理匯率 since it
     *  only matters during a trip. */
    currencyRatesLink: string
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
    errors: {
      exceedsDebt: string
    }
  }

  records: {
    title: string
    tabAll: string
    tabExpense: string
    tabIncome: string
    manageRecurringIncome: string
    manageRecurringExpense: string
    offlineMoreNeedsNetwork: string
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
    sectionGroupSplit: string
    groupName: string
    sectionMember: string
    youSuffix: string
    sectionPersonal: string
    addToHomeScreen: string
    displayName: string
    defaultSplitTitle: string
    soloLockHint: string
    inviteCta: string
    sectionDisplay: string
    language: string
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
    exportData: string
    pastTimes: string
    trips: string
    /** Secondary text under the 旅行 row — counts of active / past trips. */
    tripsRow: {
      active: string
      past: string
      both: string
    }
    sectionGuardian: string
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
    add: string
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

  /** /settings/currency page — base currency + 心理匯率 (issues #322–#326). */
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
    rates: {
      sectionTitle: string
      whyHeading: string
      whyBody: string
      exampleHeading: string
      exampleBody: string
      behaviorHeading: string
      behaviorBody: string
      saving: string
      saved: string
      defaultFallback: string
    }
    errors: {
      baseChangeFailed: string
      rateChangeFailed: string
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

  /** v0.16.0 #222 — 愛物模板系統 v1：只有「物品 (general)」一個模板，純文字追蹤，不接 FuelLog / 守護 等任何自動化。 */
  assetTemplate: {
    namePlaceholder: string
    detailSection: string
  }

  assetDetail: {
    backAriaLabel: string
    editAriaLabel: string
    switcherAriaLabel: string
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
    }
    car: {
      avgEcon: string
      avgEconNoLog: string
      avgEconNeedMore: string
      avgEconRecent: string
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
    add: string
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
}

export const zhTW: Translations = {
  signIn: {
    tagline: '兩個人的日子，可以一起記下來。',
    continueWithGoogle: '以 Google 帳號繼續',
    termsPrefix: '繼續即表示您同意我們的',
    termsLink: '服務條款',
    termsAnd: '與',
    privacyLink: '隱私權政策',
    termsSuffix: '',
  },

  landing: {
    heroKicker: 'A COUPLE\'S LEDGER · 雙人記帳 PWA',
    taglineHtml: '兩個人，<br />一本帳。',
    bodyHtml: '專為伴侶設計的雙人共享帳本。<br />一起記錄日常開銷、自動分攤、看見每筆花費去了哪裡 — 把陪伴留下來。',
    cta: '開始記錄',
    ctaHint: '免費 · 不需註冊就能體驗 · 兩人共同使用',
    alreadyHaveAccount: '已經有帳號 · 登入',
    trustEncrypted: '端對端加密',
    trustFree: '免費使用',
    trustPwa: 'iOS / Android / Web PWA',
    featuresKicker: 'INSIDE ──',
    featuresTitle: '一本帳，承接生活的四種光',
    featuresSubtitleHtml: '從第一筆共同支出，到一起照顧的房子、車與每年保單，<br />都收進同一本帳裡。',
    f1Title: '雙人記帳',
    f1Body: '一筆一筆共同記下，自動分攤，可以對半也可以依比例。每月清楚結算，不必再對帳。',
    f2Title: '愛物管理',
    f2Body: '家、車、孩子、寵物、植物 — 一起照顧的，都收進同一本帳，每筆相關支出自動歸戶。',
    f3Title: '守護保險',
    f3Body: '保護型、儲蓄型保單分頁，被保人、受益人、續期日，一頁看完每一份為對方留下的安排。',
    f4Title: '記帳統計',
    f4Body: '月度回顧、分類分佈、章節歷史。讓花過的錢自己說故事，一起回頭看走過的日子。',
    footerTrust: '端對端加密 · 資料只屬於你們兩個',
  },

  common: {
    cancel: '取消',
    save: '儲存',
    update: '更新',
    saving: '儲存中…',
    processing: '處理中…',
    delete: '刪除',
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
    noFilteredAddHint: '還沒有紀錄。按下方 + 記第一筆吧。',
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
    soloHint: '你還在獨自記帳',
    inviteCta: '邀請對方 →',
    addExpense: '新增一筆',
    addIncome: '記一筆收入',
    filterLabel: '篩選',
    filterAriaLabel: '開啟篩選',
    activeTripBanner: {
      kicker: '旅行進行中',
      singleStartedAt: '{date} 起 · 點開看這趟',
      singleStartedAtWithCurrency: '{date} 起 · {currency} · 點開看這趟',
      singleAriaLabel: '進入旅行：{name}',
      multipleHeading: '{count} 段旅行進行中',
      multipleCta: '一起翻 ›',
      multipleAriaLabel: '查看 {count} 段進行中的旅行',
    },
  },

  balanceHero: {
    monthlyIncome: '本月收入',
    countLabel: '筆數',
    countSuffix: '筆',
    recent: '最近',
    noRecord: '尚無紀錄',
    manage: '管理 ›',
    settleAriaLabel: '記錄還款 / 收款',
    settleLabel: '結算',
    partnerOwesYou: '欠你',
    youOwePartner: '欠對方',
    currentlyEven: '打平',
    currentlyLabel: '目前',
    modeSettledLabel: '現在',
    modeIncludePendingLabel: '結算後',
    modeToggleAriaLabel: '切換 顯示「現在」或「結算後」金額',
  },

  soloBanner: {
    waiting: '還在等對方加入',
    sendInviteHint: '傳連結邀請他',
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
      descriptionRequired: '請輸入描述',
      noPartner: '伴侶尚未加入',
    },
  },

  compactRow: {
    pendingBadge: '待結算',
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
    currencyRatesLink: '調整心理匯率',
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
    errors: {
      exceedsDebt: '金額不能超過欠款',
    },
  },

  records: {
    title: '紀錄',
    tabAll: '全部',
    tabExpense: '支出',
    tabIncome: '收入',
    manageRecurringIncome: '定期收入',
    manageRecurringExpense: '定期支出',
    offlineMoreNeedsNetwork: '再多紀錄需連線取得',
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
    sectionGroupSplit: '預設分攤方式 & 比例',
    groupName: '帳本名稱',
    sectionMember: '成員',
    youSuffix: '（你）',
    sectionPersonal: '個人',
    addToHomeScreen: '加到主畫面',
    displayName: '顯示名稱',
    defaultSplitTitle: '建立紀錄時的預設分攤',
    soloLockHint: '單人狀態下固定為「全部我的」，邀請對方加入後可調整。',
    inviteCta: '邀請對方加入',
    sectionDisplay: '語言 & 幣別',
    language: '語言',
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
    recurringSettings: '定期收入/支出設定',
    sectionData: '資料',
    trust: '資料安全',
    exportData: '匯出資料（CSV）',
    pastTimes: '過去的時光',
    trips: '旅行',
    tripsRow: {
      active: '{active} 段進行中',
      past: '過去 {past} 段',
      both: '{active} 段進行中 · 過去 {past} 段',
    },
    sectionGuardian: '守護（Beta）',
    guardianBeta: {
      title: '開啟守護',
      description: '守護是把保單與保障好好收下的地方，還在 Beta 中。未來會成為訂閱功能，現在先體驗。關閉後既有資料還留在 DB，不會消失。',
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
    add: '+ 新增',
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

  currencyPage: {
    title: '貨幣',
    back: '返回',
    pageHeading: '兩人之間的一把尺',
    pageSubtitle: '主體幣別是這本帳本的母語；心理匯率是你們之間的共識。',
    base: {
      sectionTitle: '主體幣別',
      sectionHint: '這本帳本的母語。所有結算與顯示，都以它為基準。',
      locked: {
        heading: '這個章節已經開始記錄了',
        body: '當前章節已經有紀錄，主體幣別在章節中固定不變——這樣以前寫下的金額，就一直站得住。',
        bodyNext: '想換主體幣別的話，可以等開始下一個章節時重新選。',
      },
    },
    rates: {
      sectionTitle: '心理匯率',
      whyHeading: '為什麼叫「心理」匯率',
      whyBody: '不是看市場跳動的數字，是你們倆之間覺得 1 美金值多少——這把尺只屬於你們。',
      exampleHeading: '舉個例子',
      exampleBody: '比如你們約定 1 USD ≈ 32 TWD，那這趟在美國花的 100 美金，會記成 3,200 元。',
      behaviorHeading: '改了之後',
      behaviorBody: '以前已經記下的金額不會跟著動。只有從現在開始的新紀錄，會用新的匯率。',
      saving: '儲存中…',
      saved: '已存下',
      defaultFallback: '預設值',
    },
    errors: {
      baseChangeFailed: '無法切換主體幣別',
      rateChangeFailed: '無法更新匯率',
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
    notesSection: '備註',
    recentExpenses: '近期支出',
    timelineEntries: '時間軸 · {count} 筆',
    addOtherExpense: '其他支出',
    refuel: '加油',
    relatedInsurance: '相關保險',
    linkedVehicleSection: '關聯車輛',
    emptyCarLine1: '還沒有為這台車記下任何支出 —',
    emptyCarLine2: '戳右下角 + 開始',
    emptyDefaultLine1: '還沒有記下任何支出 —',
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
    },
    car: {
      avgEcon: '平均油耗',
      avgEconNoLog: '加第一筆油看油耗',
      avgEconNeedMore: '需要至少 2 次加油記錄',
      avgEconRecent: '近 6 個月',
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
      recurringEmptyHint: '分紅或生存金每年都會回來 — 設成定期進帳就不必再記',
      recurringAddCta: '建立定期進帳',
      recurringRuleSummary: '每月 {day} 號 · {interval}',
      recurringRuleNextDate: '下次 {date}',
      recurringRulePaused: '已暫停',
      recurringManageCta: '管理',
    },
  },

  recurringExpense: {
    title: '定期支出',
    back: '返回',
    add: '+ 新增',
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
    card2Body: '最大一筆 — {name} 付的「{description}」，NT$ {amount}',
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
    cardHeadingInvitation: '我們還不太認識彼此 — 來回答 3 題',
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
    revealFraming: '你們一個是日出、一個是月光 — 不同的時刻，照同一個家。沒有誰的答案比較對，記住對方在意的就好。',
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
}
