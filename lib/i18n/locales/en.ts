import type { Translations } from './zh-TW'

export const en: Translations = {
  signIn: {
    tagline: 'Days for two, written together.',
    continueWithGoogle: 'Continue with Google',
    termsPrefix: 'By continuing, you agree to our',
    termsLink: 'Terms of Service',
    termsAnd: 'and',
    privacyLink: 'Privacy Policy',
    termsSuffix: '',
  },

  common: {
    cancel: 'Cancel',
    save: 'Save',
    saving: 'Saving…',
    processing: 'Processing…',
    delete: 'Delete',
    me: 'Me',
    partner: 'Partner',
    you: 'You',
    all: 'All',
    error: 'Something went wrong',
    deleteSoftDescription: "This can't be undone, but the ledger keeps a 30-day history a developer can restore.",
  },

  splitType: {
    even: 'Split evenly',
    allMine: 'All mine',
    allPartners: "All partner's",
    mine: 'Mine',
    theirs: 'Theirs',
  },

  category: {
    dining: 'Dining',
    clothing: 'Clothing',
    housing: 'Housing',
    transit: 'Transit',
    education: 'Education',
    entertainment: 'Entertainment',
    health: 'Health',
    financial: 'Financial',
    other: 'Other',
    settle: 'Settle',
  },

  incomeCategory: {
    salary: 'Salary',
    bonus: 'Bonus',
    maturity: 'Policy maturity',
    claim: 'Insurance claim',
    gift: 'Gift money',
    refund: 'Tax refund',
    sidehustle: 'Side hustle',
    other: 'Other',
  },

  feed: {
    header: 'Recent',
    noFiltered: 'No records match these filters',
    noRecordsTitle: 'No records yet',
    noRecordsHint: "Start with one — a coffee, a dinner. Day by day, looking back will feel warm.",
    addFirst: 'Add the first',
    noIncome: 'No household income recorded yet',
    noFilteredAddHint: 'No records yet. Tap + below to add one.',
  },

  modeToggle: {
    expense: 'Expense',
    income: 'Income',
  },

  payerToggle: {
    label: 'Who paid?',
  },

  dashboard: {
    soloHint: "Still tracking on your own",
    inviteCta: 'Invite partner →',
    addExpense: 'Add entry',
    addIncome: 'Add income',
    filterLabel: 'Filter',
    filterAriaLabel: 'Open filter',
  },

  balanceHero: {
    monthlyIncome: 'Income this month',
    countLabel: 'Entries',
    countSuffix: '',
    recent: 'Recent',
    noRecord: 'No records',
    recurring: 'Recurring income',
    manage: 'Manage ›',
    settleAriaLabel: 'Record repayment / receipt',
    partnerOwesYou: 'owes you',
    youOwePartner: 'owe partner',
    currentlyEven: 'all settled',
    currentlyLabel: "You're",
  },

  soloBanner: {
    waiting: 'Still waiting for partner to join',
    sendInviteHint: 'Send them a link to invite',
    dismissAriaLabel: 'Dismiss',
    generating: 'Generating…',
    sendInvite: 'Send invite',
    sharedAndCopied: 'Shared. Link also copied.',
    copied: 'Link copied',
  },

  addSheet: {
    title: 'New entry',
    titleEdit: 'Edit entry',
    amount: 'Amount',
    descPlaceholder: 'Description (e.g., dinner, groceries)',
    category: 'Category',
    assetLink: 'Link to asset (optional)',
    splitMethod: 'Split',
    date: 'Date',
    deleteOne: 'Delete this entry',
    deleteConfirmTitle: 'Delete this entry?',
    errors: {
      amountRequired: 'Enter an amount',
      descriptionRequired: 'Enter a description',
      noPartner: "Partner hasn't joined yet",
    },
  },

  incomeSheet: {
    title: 'Add income',
    amountLabel: 'Income amount',
    recipientPrompt: 'Whose income?',
    categoryLabel: 'Type',
    policyLink: 'Linked policy',
    selectPolicy: 'Select a policy',
    maturityHint: "Counts toward this policy's payouts",
    claimHint: "Counts toward this policy's claim history",
    noPolicy: 'No policies yet',
    insuranceBadge: 'Insurance',
    notePlaceholder: 'Note (optional)',
    deleteIncome: 'Delete this income',
    deleteConfirmTitle: 'Delete this income?',
    errors: {
      amountRequired: 'Enter an amount',
      saveFailed: 'Save failed',
      missingPendingId: 'Missing pending income id',
    },
    raceMessage: 'Your partner just confirmed this entry',
  },

  settlement: {
    debtorTitle: 'How much am I paying back?',
    creditorTitle: 'How much did {name} pay back?',
    primaryRepay: 'Record payback',
    primaryReceive: 'Record receipt',
    amountAriaLabel: 'Repayment amount',
    today: 'Today',
    errors: {
      exceedsDebt: "Amount can't exceed the debt",
    },
  },

  records: {
    title: 'Records',
    tabAll: 'All',
    tabExpense: 'Expense',
    tabIncome: 'Income',
  },

  filterSheet: {
    reset: 'Reset',
    title: 'Filter',
    apply: 'Apply',
    payerSection: 'Paid by',
    splitSection: 'Split',
    categorySection: 'Categories (multi)',
  },

  monthSection: {
    expense: 'Expense',
    net: 'Net',
  },

  settings: {
    title: 'Settings',
    sectionGroup: 'Ledger',
    groupName: 'Ledger name',
    sectionMember: 'Members',
    youSuffix: ' (you)',
    sectionPersonal: 'Personal',
    addToHomeScreen: 'Add to Home Screen',
    displayName: 'Display name',
    defaultSplitTitle: 'Default split for new entries',
    soloLockHint: 'While solo, this is locked to "All mine." Adjust after your partner joins.',
    inviteCta: 'Invite partner',
    legalNotice: 'Legal',
    language: 'Language',
    sectionDevice: 'Device',
    offlineBrowsing: 'Offline browsing',
    offlineHint: 'Browse recent records when offline',
  },

  assets: {
    title: 'Treasures',
    empty: {
      title: 'No treasures yet',
      body: 'Add a car, pet, child, or policy to start recording the time and care you give them.',
    },
    section: {
      property: 'Property',
      living: 'Living',
      coverage: 'Coverage',
    },
    addCar: 'Add a car',
    addSecondCar: 'Add another car',
  },
}
