import type { Translations } from './zh-TW'

export const ja: Translations = {
  signIn: {
    tagline: 'ふたりの毎日を、一緒に記そう。',
    continueWithGoogle: 'Google アカウントで続ける',
    termsPrefix: '続行すると、当社の',
    termsLink: '利用規約',
    termsAnd: 'および',
    privacyLink: 'プライバシーポリシー',
    termsSuffix: 'に同意したものとみなされます。',
  },

  common: {
    cancel: 'キャンセル',
    save: '保存',
    saving: '保存中…',
    processing: '処理中…',
    delete: '削除',
    me: '自分',
    partner: '相手',
    you: 'あなた',
    all: 'すべて',
    error: 'エラーが発生しました',
    deleteSoftDescription: 'この操作は取り消せませんが、家計簿の履歴は 30 日間保持され、開発者が復元できます。',
  },

  splitType: {
    even: '折半',
    allMine: 'すべて自分',
    allPartners: 'すべて相手',
    mine: '自分',
    theirs: '相手',
  },

  category: {
    dining: '食事',
    clothing: '衣類',
    housing: '住居',
    transit: '交通',
    education: '教育',
    entertainment: '娯楽',
    health: '医療',
    financial: '金融',
    other: 'その他',
    settle: '精算',
  },

  incomeCategory: {
    salary: '給料',
    bonus: 'ボーナス',
    maturity: '満期返戻',
    claim: '保険給付',
    gift: 'お祝い金',
    refund: '税金還付',
    sidehustle: '副業',
    other: 'その他',
  },

  feed: {
    header: '最近の記録',
    noFiltered: '条件に一致する記録はありません',
    noRecordsTitle: 'まだ記録がありません',
    noRecordsHint: '一杯のコーヒーでも、ひとつの夕食でも。一日ずつ記録すれば、振り返ったとき心が温かくなります。',
    addFirst: '最初の一件を記録',
    noIncome: '家計の収入はまだ記録されていません',
    noFilteredAddHint: 'まだ記録がありません。下の + で最初の一件を記録しましょう。',
  },

  modeToggle: {
    expense: '支出モード',
    income: '収入モード',
  },

  payerToggle: {
    label: '支払い者は？',
  },

  dashboard: {
    soloHint: 'まだひとりで記録中',
    inviteCta: '相手を招待 →',
    addExpense: '記録を追加',
    addIncome: '収入を記録',
    filterLabel: '絞り込み',
    filterAriaLabel: '絞り込みを開く',
  },

  balanceHero: {
    monthlyIncome: '今月の収入',
    countLabel: '件数',
    countSuffix: '件',
    recent: '最近',
    noRecord: 'まだ記録がありません',
    recurring: '定期収入',
    manage: '管理 ›',
    settleAriaLabel: '返済 / 受領を記録',
    partnerOwesYou: 'があなたに貸し中',
    youOwePartner: 'が相手に借り中',
    currentlyEven: '差額なし',
    currentlyLabel: '現在',
  },

  soloBanner: {
    waiting: 'まだ相手の参加を待っています',
    sendInviteHint: 'リンクで招待しましょう',
    dismissAriaLabel: '通知を閉じる',
    generating: '生成中…',
    sendInvite: '招待を送る',
    sharedAndCopied: '共有しました。リンクもコピー済み',
    copied: 'リンクをコピーしました',
  },

  addSheet: {
    title: '記録を追加',
    titleEdit: '記録を編集',
    amount: '金額',
    descPlaceholder: '内容（例: 夕食、買い物）',
    category: 'カテゴリー',
    assetLink: '愛物にリンク（任意）',
    splitMethod: '分担方法',
    date: '日付',
    deleteOne: 'この記録を削除',
    deleteConfirmTitle: 'この記録を削除しますか？',
    errors: {
      amountRequired: '金額を入力してください',
      descriptionRequired: '内容を入力してください',
      noPartner: 'パートナーがまだ参加していません',
    },
  },

  incomeSheet: {
    title: '収入を記録',
    amountLabel: '収入金額',
    recipientPrompt: '誰の収入？',
    categoryLabel: '種類',
    policyLink: 'リンク先の保険',
    selectPolicy: '対応する保険を選ぶ',
    maturityHint: 'この記録はその保険の「払い戻し」累計に加算されます',
    claimHint: 'この記録はその保険の「請求」履歴に加算されます',
    noPolicy: '保険がまだありません',
    insuranceBadge: '保険',
    notePlaceholder: 'メモ（任意）',
    deleteIncome: 'この収入を削除',
    deleteConfirmTitle: 'この収入を削除しますか？',
    errors: {
      amountRequired: '金額を入力してください',
      saveFailed: '保存に失敗しました',
      missingPendingId: '確認待ち収入の id が見つかりません',
    },
    raceMessage: '相手がたった今この記録を確認しました',
  },

  settlement: {
    debtorTitle: 'いくら返す？',
    creditorTitle: '{name} はいくら返した？',
    primaryRepay: '返済を記録',
    primaryReceive: '受領を記録',
    amountAriaLabel: '返済金額',
    today: '今日',
    errors: {
      exceedsDebt: '金額が借入額を超えています',
    },
  },

  records: {
    title: '記録',
    tabAll: 'すべて',
    tabExpense: '支出',
    tabIncome: '収入',
  },

  filterSheet: {
    reset: 'リセット',
    title: '絞り込み',
    apply: '適用',
    payerSection: '支払い者',
    splitSection: '分担',
    categorySection: 'カテゴリー（複数選択可）',
  },

  monthSection: {
    expense: '支出',
    net: '収支',
  },

  settings: {
    title: '設定',
    sectionGroup: '家計簿',
    groupName: '家計簿名',
    sectionMember: 'メンバー',
    youSuffix: '（あなた）',
    sectionPersonal: '個人',
    addToHomeScreen: 'ホーム画面に追加',
    displayName: '表示名',
    defaultSplitTitle: '記録時のデフォルト分担',
    soloLockHint: 'ひとりモードでは「すべて自分」に固定されています。相手が参加すると変更できます。',
    inviteCta: '相手を招待',
    legalNotice: '法的事項',
    language: '言語',
    sectionDevice: 'デバイス',
    offlineBrowsing: 'オフライン閲覧',
    offlineHint: 'オフライン時に最近の記録を閲覧できます',
  },

  assets: {
    title: '愛物',
    empty: {
      title: 'まだ愛物がありません',
      body: '車、ペット、子ども、保険を追加して、彼らに費やした時間と心を記録しはじめましょう。',
    },
    section: {
      property: '財産',
      living: '生命体',
      coverage: '保障',
    },
    addCar: '車を追加',
    addSecondCar: '2 台目の車を追加',
  },
}
