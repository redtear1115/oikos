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
    legalNotice: string
    language: string
    sectionDevice: string
    offlineBrowsing: string
    offlineHint: string
    recurringIncome: string
    recurringExpense: string
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
    noIncome: '還沒記過家裡的進帳',
    noFilteredAddHint: '還沒有紀錄。按下方 + 記第一筆吧。',
  },

  modeToggle: {
    expense: '支出模式',
    income: '進帳模式',
  },

  payerToggle: {
    label: '誰付的？',
  },

  dashboard: {
    soloHint: '你還在獨自記帳',
    inviteCta: '邀請對方 →',
    addExpense: '新增一筆',
    addIncome: '記一筆進帳',
    filterLabel: '篩選',
    filterAriaLabel: '開啟篩選',
  },

  balanceHero: {
    monthlyIncome: '本月進帳',
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
    deleteOne: '刪除這筆',
    deleteConfirmTitle: '刪除這筆紀錄？',
    errors: {
      amountRequired: '請輸入金額',
      descriptionRequired: '請輸入描述',
      noPartner: '伴侶尚未加入',
    },
  },

  incomeSheet: {
    title: '記一筆進帳',
    amountLabel: '進帳金額',
    recipientPrompt: '進到誰那？',
    categoryLabel: '類別',
    policyLink: '關聯保單',
    selectPolicy: '選擇對應保單',
    maturityHint: '此筆會記入該保單的「拿回」累計',
    claimHint: '此筆會記入該保單的「理賠」紀錄',
    noPolicy: '尚無保單',
    insuranceBadge: '保險',
    notePlaceholder: '備註（可選）',
    deleteIncome: '刪除這筆進帳',
    deleteConfirmTitle: '刪除這筆進帳？',
    errors: {
      amountRequired: '請輸入金額',
      saveFailed: '儲存失敗',
      missingPendingId: '缺少待確認進帳 id',
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
    tabIncome: '進帳',
    manageRecurringIncome: '⚙ 設定定期進帳 →',
    manageRecurringExpense: '⚙ 設定定期支出 →',
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
    legalNotice: '法律聲明',
    language: '語言',
    sectionDevice: '裝置',
    offlineBrowsing: '離線瀏覽',
    offlineHint: '開啟後可在無網路時查看最近記錄',
    recurringIncome: '定期進帳',
    recurringExpense: '定期支出',
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
    title: '定期進帳',
    back: '返回',
    add: '+ 新增',
    empty: {
      hint: '還沒設定定期進帳',
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
      titleNew: '新增定期進帳',
      titleEdit: '編輯定期進帳',
      amountLabel: '固定金額',
      recipientPrompt: '進到誰那？',
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
}
