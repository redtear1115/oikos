import type { Translations } from './zh-TW'

export const zhCN: Translations = {
  signIn: {
    tagline: '两个人的日子，可以一起记下来。',
    continueWithGoogle: '以 Google 账号继续',
    termsPrefix: '继续即表示您同意我们的',
    termsLink: '服务条款',
    termsAnd: '与',
    privacyLink: '隐私权政策',
    termsSuffix: '',
  },

  common: {
    cancel: '取消',
    save: '保存',
    saving: '保存中…',
    processing: '处理中…',
    delete: '删除',
    me: '我',
    partner: '对方',
    you: '你',
    all: '全部',
    error: '发生错误',
    deleteSoftDescription: '此操作无法撤销，但账本历史会保留 30 天可由开发者还原。',
  },

  splitType: {
    even: '平分',
    allMine: '全部我的',
    allPartners: '全部对方的',
    mine: '我的',
    theirs: '对方的',
  },

  category: {
    dining: '饮食',
    clothing: '服饰',
    housing: '居住',
    transit: '交通',
    education: '教育',
    entertainment: '娱乐',
    health: '医疗',
    financial: '金融',
    other: '其他',
    settle: '还款',
  },

  incomeCategory: {
    salary: '工资',
    bonus: '奖金',
    maturity: '满期还本',
    claim: '保险理赔',
    gift: '红包礼金',
    refund: '退税',
    sidehustle: '副业',
    other: '其他',
  },

  feed: {
    header: '最近记录',
    noFiltered: '没有符合条件的记录',
    noRecordsTitle: '还没有记录',
    noRecordsHint: '从第一笔开始 ─ 一杯咖啡、一顿晚餐都算数。日子一天天记下来，回头看会很暖。',
    addFirst: '记第一笔',
    noIncome: '还没记过家里的进账',
    noFilteredAddHint: '还没有记录。按下方 + 记第一笔吧。',
  },

  modeToggle: {
    expense: '支出模式',
    income: '进账模式',
  },

  payerToggle: {
    label: '谁付的？',
  },

  dashboard: {
    soloHint: '你还在独自记账',
    inviteCta: '邀请对方 →',
    addExpense: '新增一笔',
    addIncome: '记一笔进账',
    filterLabel: '筛选',
    filterAriaLabel: '打开筛选',
  },

  balanceHero: {
    monthlyIncome: '本月进账',
    countLabel: '笔数',
    countSuffix: '笔',
    recent: '最近',
    noRecord: '尚无记录',
    recurring: '定期进账',
    manage: '管理 ›',
    settleAriaLabel: '记录还款 / 收款',
    partnerOwesYou: '欠你',
    youOwePartner: '欠对方',
    currentlyEven: '打平',
    currentlyLabel: '目前',
  },

  soloBanner: {
    waiting: '还在等对方加入',
    sendInviteHint: '发链接邀请他',
    dismissAriaLabel: '关闭提示',
    generating: '生成中…',
    sendInvite: '发送邀请',
    sharedAndCopied: '已分享，链接也已复制',
    copied: '已复制链接',
  },

  addSheet: {
    title: '新增记录',
    titleEdit: '编辑记录',
    amount: '金额',
    descPlaceholder: '描述（例：晚餐、杂货）',
    category: '分类',
    assetLink: '关联爱物（选填）',
    splitMethod: '分摊方式',
    date: '日期',
    deleteOne: '删除这笔',
    deleteConfirmTitle: '删除这笔记录？',
    errors: {
      amountRequired: '请输入金额',
      descriptionRequired: '请输入描述',
      noPartner: '伴侣尚未加入',
    },
  },

  incomeSheet: {
    title: '记一笔进账',
    amountLabel: '进账金额',
    recipientPrompt: '进到谁那？',
    categoryLabel: '类别',
    policyLink: '关联保单',
    selectPolicy: '选择对应保单',
    maturityHint: '此笔会记入该保单的「拿回」累计',
    claimHint: '此笔会记入该保单的「理赔」记录',
    noPolicy: '尚无保单',
    insuranceBadge: '保险',
    notePlaceholder: '备注（可选）',
    deleteIncome: '删除这笔进账',
    deleteConfirmTitle: '删除这笔进账？',
    errors: {
      amountRequired: '请输入金额',
      saveFailed: '保存失败',
      missingPendingId: '缺少待确认进账 id',
    },
    raceMessage: '对方刚刚确认了这笔',
  },

  settlement: {
    debtorTitle: '我还多少？',
    creditorTitle: '{name} 还了 多少？',
    primaryRepay: '记录还款',
    primaryReceive: '记录收款',
    amountAriaLabel: '还款金额',
    today: '今天',
    errors: {
      exceedsDebt: '金额不能超过欠款',
    },
  },

  records: {
    title: '记录',
    tabAll: '全部',
    tabExpense: '支出',
    tabIncome: '进账',
  },

  filterSheet: {
    reset: '重置',
    title: '筛选',
    apply: '应用',
    payerSection: '谁付的',
    splitSection: '分摊',
    categorySection: '分类（可多选）',
  },

  monthSection: {
    expense: '支出',
    net: '净',
  },

  settings: {
    title: '设置',
    sectionGroup: '账本',
    groupName: '账本名称',
    sectionMember: '成员',
    youSuffix: '（你）',
    sectionPersonal: '个人',
    addToHomeScreen: '添加到主屏幕',
    displayName: '显示名称',
    defaultSplitTitle: '创建记录时的默认分摊',
    soloLockHint: '单人状态下固定为「全部我的」，邀请对方加入后可调整。',
    inviteCta: '邀请对方加入',
    legalNotice: '法律声明',
    language: '语言',
    sectionDevice: '设备',
    offlineBrowsing: '离线浏览',
    offlineHint: '开启后可在无网络时查看最近记录',
  },

  assets: {
    title: '爱物',
    empty: {
      title: '还没有爱物',
      body: '新增一台车、宠物、孩子或保单，开始记录花在他们身上的时间与心意。',
    },
    section: {
      property: '财产',
      living: '生命体',
      coverage: '保障',
    },
    addCar: '新增车辆',
    addSecondCar: '加入第二辆车',
  },
}
