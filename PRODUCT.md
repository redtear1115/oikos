# Product

## Register

product

## Surface Tiers

The register field above is the project default and governs everything inside the app shell. Three routes groups are **brand** surfaces and must be designed with the brand register instead. Do not treat them as app UI.

**Brand register (design IS the product):**

- `app/[locale]/page.tsx` and `app/[locale]/_landing/*` (landing)
- `app/[locale]/migrate/page.tsx` and `app/[locale]/migrate/[source]/page.tsx` (competitor-migration SEO pages)
- `app/[locale]/use-case/[slug]/page.tsx` (vertical narratives)
- `app/[locale]/sign-in/page.tsx` (the threshold: brand voice, product restraint)
- `app/[locale]/privacy`, `app/[locale]/terms` (legal, brand typography, no app chrome)

**Product register (design SERVES the task):** everything under `app/(dashboard)/*`, plus `app/onboarding`, `app/setup`, `app/invite/[token]`, `app/offline`.

The brand surfaces get the committed cream ground (`--bg-committed`) and Fraunces at full voice. The product surfaces get the working palette and Noto Sans TC. A brand surface that looks like the dashboard has failed; a dashboard screen that looks like the landing page has also failed.

## Users

固定兩人（夫妻／伴侶）共用一本帳。Two people in an established relationship, sharing one ledger from their phones in the small gaps of daily life: at a checkout, in bed before sleep, on the commute. They are not accountants and have no wish to become ones. Usually one partner records more diligently than the other, so the tool has to serve both the self-disciplined type and the needs-a-nudge type without shaming either.

The job to be done: log a shared expense in under a minute, see at a glance who owes whom, settle without awkwardness, and now and then look back and feel the relationship's story rather than just its totals. Sessions are short and frequent.

**One person is a complete state, not a waiting room.** Solo mode (`member_b IS NULL`) is a first-class way to use Futari, whether the partner has not joined yet, has left, or was never coming. Never style, word, or lay out solo mode as a deficiency or an incomplete setup.

**Two is the core; more is an extension.** Group trips (v1.6.0) and multi-way splitting (v1.7.0) let this couple pull other people into one bounded stretch of spending. Those guests are visitors to the pair's ledger, not co-owners of it. When a design decision trades intimacy of the two for generality across N, the two win. The main ledger, the balance hero, the monthly review, and the partner quiz are all two-person surfaces and stay that way.

**Delivery reaches three platforms from one web codebase.** Mobile-first PWA, plus iOS and Android Capacitor shells whose `server.url` points at production, so a web deploy lands on every installed shell immediately. `lib/platform.ts` distinguishes five contexts: `ios_native`, `android_native`, `ios_pwa`, `android_pwa`, `web`. Design for the narrowest of them, not for the browser you are previewing in. See **Platform Constraints** below.

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

**The line between witness and sentimentality.** The most common copy failure is overshooting warmth into 矯情. A witness states what happened and stops: 「這個月你們一起記了 34 筆」. A sentimentalist adds a verdict about how that should feel: 「這個月你們好努力，真是甜蜜的一個月」. When a sentence tells the user what to feel, cut the telling and keep the fact. The warmth comes from noticing, not from adjectives.

## Anti-references

What Futari must NOT look or sound like:

- **Cold fintech.** Navy-and-gold, dense data grids, "wealth management" gravitas. Money here is domestic and emotional, not institutional.
- **Hype SaaS.** Purple gradients, decorative glassmorphism, "boost your productivity," exclamation marks, the big-number hero-metric dashboard. (Exclamation marks are banned in UI copy.)
- **Surveillance or control framing.** The words 管理 (manage), 追蹤 (track), and 監控 (monitor) are banned in product copy. Nothing should imply that the user, or their partner, is being audited.
- **Gamified guilt.** Streaks, budget-exceeded red alarms, "you overspent" verdicts, anxiety used to drive engagement. Solo mode especially must never frame "your partner hasn't joined yet" as a problem state.
- **Generic budgeting-app aesthetic.** The category reflex of teal-and-white pie charts and rows of identical metric cards. Futari's warm-lamp identity exists precisely to escape this.

**The gravity problem.** The generic budgeting app is not one mistake, it is the resting state that every unconsidered decision drifts toward. A screen arrives there by accumulation: a card because the content needed a boundary, a shadow because the card needed to separate, a row of stats because the number felt lonely, a colored chart because the categories needed distinguishing. No single step was wrong. Bans alone do not hold, because the drift happens in the gaps between them.

The counter-move is positive, not prohibitive. Before adding a container, ask what the hairline or the tonal step would do instead. Before adding a second number, ask whether the first one is actually the moment. Before reaching for a new component, ask which of the four primitives in `components/ui/` already covers it. The system is deliberately small: `Button`, `TextInput`, `SegmentedToggle`, `Sheet`. If a screen needs a fifth thing, that is a signal to re-read the problem, not a license to invent.

Move toward (as feel, not to copy): warm reflective journaling apps such as Day One, Apple Journal, and Stoic for the unhurried personal tone; and the human, approachable end of money apps such as Monarch, Copilot Money, and Cleo for making finance feel like it belongs to people rather than spreadsheets.

## Design Principles

1. **陪伴優先，工具其次 (companionship first, tool second).** Every interaction answers one question: does this make the user feel accompanied? Utility is necessary, never the point.
2. **不評判，不定義好壞 (no judgment, no good or bad).** Never present a record so that it implies the user spent well or badly. Witness; do not score.
3. **低門檻進入 (low barrier to entry).** No forced sign-up to start; the first record should be possible inside 60 seconds. Friction is the enemy of a daily habit.
4. **不自動化取代感受 (automation must not replace feeling).** The system generates the presentation, but the result must not feel mechanical. Warmth is hand-felt, not computed.
5. **兩人對等 (two equals).** Both partners, and both personality types (diligent and needs-a-nudge), are first-class. Never optimize for one at the other's expense, and never shame the less-active partner.
6. **做到剛好就停 (build to the edge of the ask, then stop).** Futari's surface area is a cost paid by two people on a phone, so scope discipline is a design principle here, not a process note. Implement what was asked, completely. Do not grow a small change into a feature, do not add the adjacent screen nobody requested, and do not invent a new token, font size, spacing step, radius, or `components/ui/` primitive to solve a one-off. When the existing system genuinely cannot express the design, stop and ask. An unrequested addition is not generosity; it is surface area the couple has to navigate around forever.

## Platform Constraints

One codebase, three shells. These are design constraints, not implementation notes: they change what a screen may assume.

**Safe area is not optional.** iPhone notch / Dynamic Island, home indicator, and the Android gesture bar all eat into the viewport inside the native shells, where there is no browser chrome to absorb them. Any fixed, sticky, or absolutely-positioned element (bottom nav, FAB, sheet footers, full-screen confirmation screens, toasts) must respect `env(safe-area-inset-*)`. The `--bottom-nav-offset` token reserves scroll clearance at the bottom; it does not solve the top. A destructive-action screen whose escape route sits under the notch is a trap, and has already shipped once: the cancel-deletion control on the account-deletion screen is unreachable on notched iPhones.

**The same screen is not the same on all three platforms.** iOS shells may not surface external payment or donation links (`components/KofiWidget.tsx` already gates this). Design the paid tier and support entry points so that removing them on iOS leaves a coherent screen, not a hole. Never assume a single visual state across platforms, and never let the iOS variant read as the broken one.

**Native permission prompts are relationship moments.** Push notifications and any future camera use (invoice scanning) trigger an OS dialog that cannot be restyled and can only be asked once in practice. Never fire one on first launch. Ask at the moment the user has just done the thing the permission serves, in plain language, with the value stated before the prompt appears. A denial must leave the feature gracefully closed, never a nagging banner. Guardian, push, and partner-activity surfaces carry the highest risk of turning companionship into surveillance; the permission moment is where that line is crossed or held.

**It is a WebView, and that is fine.** The shells load the production site; they are not native apps wearing a web skin. Do not chase native-feeling choreography (spring page pushes, interactive swipe-back, rubber-band overscroll mimicry) to disguise this. The honest target is a fast, calm, reduced-motion-safe web surface. Also budget for what WebView does worse: the software keyboard covers content without warning, `100vh` lies, and scroll containers stop at boundaries. Sheets and forms must stay usable with the keyboard open.

## Surface Intents

Every public surface has a job, and each job has a number that says whether the job is being done. The recurring mistake is not miscounting; it is reading a real number against the wrong intent and concluding that something is broken. What follows is what each surface is for, and — more usefully — which low numbers are expected.

**`/migrate/*` (competitor migration pages).** These are organic-search landing pages for someone typing "how do I move off X". The job ends at sign-up, so the metric is `landing_cta_clicked`. The CSV import widget on the page is a logged-out bonus for the rare visitor who arrives already holding an export file; the real importer lives behind sign-in, in settings. `import_completed` from these pages is therefore not a success metric and never was. In ninety days exactly one person completed an import straight off organic search, and that is the expected shape — the number would sit near zero even if the pages were doing their job perfectly. The measure that actually discriminates is the CTA click: sources without the screenshot workflow convert at 26%, sources with it at 6.5%. That gap is where the friction is.

**`/use-case/*` (scenario landing pages).** Ten pages across four locales, written for people searching a situation rather than a product. Organic arrivals are the metric. Ninety days in, organic arrivals are zero, and the ceiling is search volume, not page count or page quality. The pages do rank — cohabitation 18.5, newlyweds 7.5, aa-split 7.7 — which is Google's own evidence that they are not being treated as thin content. A page that ranks for a term nobody searches is a cheap bet that has not paid off yet. Their share of the sitemap is not a cost to optimize away.

**Invitation flow.** The job is getting the second partner into the ledger, so the metric is acceptance after an invite is sent. Over 120 days, 25 people created a group, 6 tried to send an invite, and 5 succeeded; among those five the gap between creating the group and the partner joining was 2, 4, 6, 19, and 299 minutes. Three of five inside six minutes means the dominant scene is two people in the same room with one phone between them. Design for hand-over, not for delivery across distance. The small number of send attempts describes that scene; it is not evidence that the invite is failing.

**Solo mode.** One person keeping the ledger is a complete state, not a waiting room. It deliberately has no conversion metric. The moment "solo → duo conversion rate" becomes a number someone is asked to move, the design follows it: reminders, nudges, a partner-shaped hole in the UI. That is the Gamified guilt the anti-references already rule out. Judge solo mode on whether one person can do everything the product promises, and leave it there.

## Accessibility & Inclusion

- Hold WCAG AA contrast across the warm palette, especially on text-on-fill pairs (cream / terracotta / ink). `--ink-3` sits at 4.66:1 on cream and is the floor, not a starting point for further lightening.
- Respect `prefers-reduced-motion`: motion is gentle by default and fully removable. Every new animation needs a reduced-motion branch, matching the existing treatment of `.partner-toast` and `.about-article`.
- Support dynamic type and scalable text; the app must stay usable at larger system font sizes.
- Keep touch targets at or above 44px (the `--control-md` token already encodes this), and keep them clear of safe-area insets (see **Platform Constraints**).
- Do not rely on color alone for meaning. The credit (sage) versus debit (clay) distinction, and balance direction, need a non-color cue (sign, label, or icon) so the green and red pairing reads for color-blind users.
- Keyboard focus is handled through `:focus-visible` on `.oik-btn` / `.oik-toggle` / `.oik-chip` / `.oik-segment` and `:focus-within` on `.oik-input-wrapper`. Any new interactive element joins that vocabulary rather than inventing its own ring.
- Four locales (zh-TW primary, then zh-CN, en, ja): copy and layout must absorb both CJK and Latin lengths without breaking.

### Known gap: no dark mode

Futari is currently light-only. There is no `prefers-color-scheme` block in `app/globals.css`, so a user whose phone is in dark mode gets the full cream ground, including inside the native shells where there is no browser UI to soften the transition. This is an unfilled gap, not a design position.

When it is filled, the direction is **the lamp at night, not the lamp switched off**. A dark Futari is a warm low-light room: deep cocoa-brown grounds rather than neutral charcoal, ember still the single accent and still rare, sage and clay held at the same quiet register rather than turned neon to survive a dark background. The failure mode to avoid is the default dark-mode inversion, which would land Futari squarely in the cold-fintech territory the whole identity exists to escape.

Until that work is scoped and approved: do not invent a partial dark palette, do not add `dark:` variants ad hoc, and do not add a theme toggle. Build light-only, and raise the gap rather than patching around it.
