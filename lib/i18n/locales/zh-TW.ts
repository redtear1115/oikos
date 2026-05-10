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

  common: {
    cancel: string
    save: string
    saving: string
    processing: string
    delete: string
    me: string
    partner: string
    you: string
    all: string
    error: string
    back: string
    edit: string
    shared: string
    none: string
    deleteSoftDescription: string
  }

  splitType: {
    even: string
    allMine: string
    allPartners: string
    mine: string
    theirs: string
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
  }

  balanceHero: {
    monthlyIncome: string
    countLabel: string
    countSuffix: string
    recent: string
    noRecord: string
    manage: string
    settleAriaLabel: string
    partnerOwesYou: string
    youOwePartner: string
    currentlyEven: string
    currentlyLabel: string
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
    category: string
    assetLink: string
    splitMethod: string
    date: string
    notesLabel: string
    notesPlaceholder: string
    deleteOne: string
    deleteConfirmTitle: string
    errors: {
      amountRequired: string
      descriptionRequired: string
      noPartner: string
    }
  }

  incomeSheet: {
    title: string
    amountLabel: string
    recipientPrompt: string
    categoryLabel: string
    policyLink: string
    selectPolicy: string
    maturityHint: string
    claimHint: string
    noPolicy: string
    insuranceBadge: string
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
    today: string
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
    stats: {
      title: string
      total: string  // {amount}
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
    }
  }

  filterSheet: {
    reset: string
    title: string
    apply: string
    payerSection: string
    splitSection: string
    categorySection: string
  }

  monthSection: {
    expense: string
    net: string
  }

  settings: {
    title: string
    sectionGroup: string
    groupName: string
    sectionMember: string
    youSuffix: string
    sectionPersonal: string
    addToHomeScreen: string
    displayName: string
    defaultSplitTitle: string
    soloLockHint: string
    inviteCta: string
    language: string
    sectionDevice: string
    offlineBrowsing: string
    offlineHint: string
    recurringIncome: string
    recurringExpense: string
    sectionData: string
    trust: string
    exportData: string
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
    }
    addCar: string
    addSecondCar: string
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
      expired: string
      groupNotFound: string
      groupFull: string
      alreadyMember: string
      unknown: string
    }
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

  common: {
    cancel: '取消',
    save: '儲存',
    saving: '儲存中…',
    processing: '處理中…',
    delete: '刪除',
    me: '我',
    partner: '對方',
    you: '你',
    all: '全部',
    error: '發生錯誤',
    back: '返回',
    edit: '編輯',
    shared: '共用',
    none: '無',
    deleteSoftDescription: '這個動作無法復原，但帳本歷史會保留 30 天可由開發者還原。',
  },

  splitType: {
    even: '平分',
    allMine: '全部我的',
    allPartners: '全部對方的',
    mine: '我的',
    theirs: '對方的',
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
  },

  balanceHero: {
    monthlyIncome: '本月收入',
    countLabel: '筆數',
    countSuffix: '筆',
    recent: '最近',
    noRecord: '尚無紀錄',
    manage: '管理 ›',
    settleAriaLabel: '記錄還款 / 收款',
    partnerOwesYou: '欠你',
    youOwePartner: '欠對方',
    currentlyEven: '打平',
    currentlyLabel: '目前',
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
    category: '分類',
    assetLink: '關聯愛物（選填）',
    splitMethod: '分攤方式',
    date: '日期',
    notesLabel: '備註（選填，兩人都看得到）',
    notesPlaceholder: '寫一句留給對方的話，或之後想記得的事',
    deleteOne: '刪除這筆',
    deleteConfirmTitle: '刪除這筆紀錄？',
    errors: {
      amountRequired: '請輸入金額',
      descriptionRequired: '請輸入描述',
      noPartner: '伴侶尚未加入',
    },
  },

  incomeSheet: {
    title: '記一筆收入',
    amountLabel: '收入金額',
    recipientPrompt: '誰的收入？',
    categoryLabel: '類別',
    policyLink: '關聯保單',
    selectPolicy: '選擇對應保單',
    maturityHint: '此筆會記入該保單的「拿回」累計',
    claimHint: '此筆會記入該保單的「理賠」紀錄',
    noPolicy: '尚無保單',
    insuranceBadge: '保險',
    notePlaceholder: '備註（可選）',
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
    today: '今天',
    errors: {
      exceedsDebt: '金額不能超過欠款',
    },
  },

  records: {
    title: '紀錄',
    tabAll: '全部',
    tabExpense: '支出',
    tabIncome: '收入',
    manageRecurringIncome: '⚙ 設定定期收入 →',
    manageRecurringExpense: '⚙ 設定定期支出 →',
    stats: {
      title: '支出統計',
      total: '總共 {amount} NT$',
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
    },
  },

  filterSheet: {
    reset: '重設',
    title: '篩選',
    apply: '套用',
    payerSection: '誰付的',
    splitSection: '分攤',
    categorySection: '分類（可多選）',
  },

  monthSection: {
    expense: '支出',
    net: '淨',
  },

  settings: {
    title: '設定',
    sectionGroup: '帳本',
    groupName: '帳本名稱',
    sectionMember: '成員',
    youSuffix: '（你）',
    sectionPersonal: '個人',
    addToHomeScreen: '加到主畫面',
    displayName: '顯示名稱',
    defaultSplitTitle: '建立紀錄時的預設分攤',
    soloLockHint: '單人狀態下固定為「全部我的」，邀請對方加入後可調整。',
    inviteCta: '邀請對方加入',
    language: '語言',
    sectionDevice: '裝置',
    offlineBrowsing: '離線瀏覽',
    offlineHint: '開啟後可在無網路時查看最近記錄',
    recurringIncome: '定期收入',
    recurringExpense: '定期支出',
    sectionData: '資料',
    trust: '資料安全',
    exportData: '匯出資料（CSV）',
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
    },
    addCar: '新增車輛',
    addSecondCar: '加入第二輛車',
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
      maturingSoonTitle: '{date} 即將到期',
      maturingSoonSubtitle: '別忘了滿期金到帳要記',
      maturingSoonCta: '記滿期金 →',
      maturedAwaitingTitle: '滿期日已到 · {date}',
      maturedAwaitingStatus: '待入帳',
      maturedAwaitingCta: '我已經收到滿期金了 →',
      maturedAwaitingPremiumNote: '累計繳 NT$ {total} 已記入 {count} 筆',
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
      expired: '邀請連結已過期',
      groupNotFound: '找不到群組',
      groupFull: '此帳本已有兩位成員',
      alreadyMember: '你已經是此帳本的成員',
      unknown: '無法加入帳本',
    },
  },
}
