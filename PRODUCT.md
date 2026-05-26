# Product

## Register

product

## Users

固定兩人（夫妻／伴侶）共用一本帳。Two people in an established relationship, sharing one ledger from their phones in the small gaps of daily life: at a checkout, in bed before sleep, on the commute. They are not accountants and have no wish to become ones. Usually one partner records more diligently than the other, so the tool has to serve both the self-disciplined type and the needs-a-nudge type without shaming either.

The job to be done: log a shared expense in under a minute, see at a glance who owes whom, settle without awkwardness, and now and then look back and feel the relationship's story rather than just its totals. Mobile-first PWA; sessions are short and frequent.

(MVP audience is the couple. The wider Freedom Project research covers pets, new parents, and others, but Futari's user is the pair.)

## Product Purpose

Futari (codebase: Oikos) is a two-person household expense tracker that reframes a daily chore as a way of feeling accompanied. It is not a budgeting tool that judges spending; it is a 陪伴式記錄框架 (companion-style recording framework). Records become points of light that, over time, form a shared "life spectrum." The product's symbol is a lamp: present and warm, never intrusive.

Success looks like a couple reaching for Futari without friction, clearing balances without friction or guilt, and at month-end or when revisiting a past chapter feeling warmth instead of scrutiny. Retention comes from the relationship the tool holds, not from streaks or pressure.

## Brand Personality

Three words: 陪伴 (companion), 溫柔的清醒 (gentle clarity), 不評判 (non-judgmental).

Voice shifts by surface tier:

- Landing: warm clarity. Say why these two people record together, not which features exist.
- Sign-in: a quiet invitation. Describe what happens next, not "start now."
- In-app functional (records, settings): plain, neutral, out of the way.
- In-app emotional moments (empty states, first setup, settlement, monthly review): a gentle witness, never preachy.

Never excited, never urgent, never congratulatory about money. The tool witnesses; it does not cheer.

## Anti-references

What Futari must NOT look or sound like:

- **Cold fintech.** Navy-and-gold, dense data grids, "wealth management" gravitas. Money here is domestic and emotional, not institutional.
- **Hype SaaS.** Purple gradients, decorative glassmorphism, "boost your productivity," exclamation marks, the big-number hero-metric dashboard. (Exclamation marks are banned in UI copy.)
- **Surveillance or control framing.** The words 管理 (manage), 追蹤 (track), and 監控 (monitor) are banned in product copy. Nothing should imply that the user, or their partner, is being audited.
- **Gamified guilt.** Streaks, budget-exceeded red alarms, "you overspent" verdicts, anxiety used to drive engagement. Solo mode especially must never frame "your partner hasn't joined yet" as a problem state.
- **Generic budgeting-app aesthetic.** The category reflex of teal-and-white pie charts and rows of identical metric cards. Futari's warm-lamp identity exists precisely to escape this.

Move toward (as feel, not to copy): warm reflective journaling apps such as Day One, Apple Journal, and Stoic for the unhurried personal tone; and the human, approachable end of money apps such as Monarch, Copilot Money, and Cleo for making finance feel like it belongs to people rather than spreadsheets.

## Design Principles

1. **陪伴優先，工具其次 (companionship first, tool second).** Every interaction answers one question: does this make the user feel accompanied? Utility is necessary, never the point.
2. **不評判，不定義好壞 (no judgment, no good or bad).** Never present a record so that it implies the user spent well or badly. Witness; do not score.
3. **低門檻進入 (low barrier to entry).** No forced sign-up to start; the first record should be possible inside 60 seconds. Friction is the enemy of a daily habit.
4. **不自動化取代感受 (automation must not replace feeling).** The system generates the presentation, but the result must not feel mechanical. Warmth is hand-felt, not computed.
5. **兩人對等 (two equals).** Both partners, and both personality types (diligent and needs-a-nudge), are first-class. Never optimize for one at the other's expense, and never shame the less-active partner.

## Accessibility & Inclusion

- Hold WCAG AA contrast across the warm palette, especially on text-on-fill pairs (cream / terracotta / ink).
- Respect `prefers-reduced-motion`: motion is gentle by default and fully removable.
- Support dynamic type and scalable text; the app must stay usable at larger system font sizes.
- Keep touch targets at or above 44px (the `--control-md` token already encodes this).
- Do not rely on color alone for meaning. The credit (sage) versus debit (clay) distinction, and balance direction, need a non-color cue (sign, label, or icon) so the green and red pairing reads for color-blind users.
- Four locales (zh-TW primary, then zh-CN, en, ja): copy and layout must absorb both CJK and Latin lengths without breaking.
