---
last_updated: 2026-08-12
status: shipped
first_shipped_in: v1.4.3
related_specs: []
related_issues: ["#832"]
blocked_on: []
---

# Brand-Surface Committed Register (#832)

## What

Upgrade the **brand-surface tier** (landing, sign-in, migrate/*, terms, privacy) from the current *Restrained* color outfit to a *Committed* one — a deepened morning-cream ground (`--bg-committed: #EFDDC4`) — and introduce an illustration slot in the landing hero that replaces the current PhonePreview-as-sole-visual approach.

This is a **visual register change only**. No behavioral, routing, or data changes.

## Why

The current landing shares the same `--bg` (`#FBEDE0`) as the in-app ledger. Brand surfaces should feel emotionally distinct — warmer, more personal — to do the job of earning trust before the user enters the product. A Committed ground (one clearly owned warm hue covering 30–60% of the surface) achieves this without touching the One Ember Rule inside the app.

The illustration adds human warmth that a phone screenshot alone cannot communicate. The chosen image (two people from behind on a sofa, warm lamp, floating light orbs) directly embodies Futari's "陪伴式記錄" philosophy.

## Scope

### In scope
- New CSS token `--bg-committed`
- Landing hero: add illustration slot, demote PhonePreview, adjust copy column width
- Landing mobile: illustration band leads above wordmark
- Sign-in, migrate/*, terms, privacy: swap `--bg` → `--bg-committed` on their page backgrounds
- `.impeccable/design.json`: add Brand-Surface Exemption rule
- Save illustration asset to `public/`

### Out of scope
- In-app surfaces (dashboard, sheets, settings, onboarding) — unchanged
- Copy changes — unchanged
- Routing, analytics, i18n strings — unchanged
- Future commissioned illustration swap (the slot is ready; replacing the image later is a one-file change)

## Design Tokens

New token `--bg-committed: #EFDDC4`（morning-gentle 深化米色，brand-surface tier 專用；app shell / task surfaces 仍用 `--bg`）。實作見 [app/globals.css](../../../app/globals.css)。其餘沿用既有 token（`--ink`、`--ink-2`、`--ink-3`、`--accent`、`--surface`、`--surface-alt`、`--hairline`），不新增。

## Brand-Surface Exemption Rule

One Ember Rule 原本管的是 PRODUCT 表面（帳本、設定、任務流程）。BRAND-surface tier（landing / sign-in / migrate / terms / privacy）是例外，可以採 Committed 色彩策略：一個暖色（`--bg-committed`）覆蓋 30–60% 表面作為底色。但即使在這裡，Ember（`#E08856`）仍要克制——每個畫面最多一個時刻（主 CTA 或單一暖光點），絕不大面積填色。**Committed 永遠是承諾「底色」，不是承諾「強調色」**——這是這條例外規則不失控的關鍵邊界。

實作為 `.impeccable/design.json` 的 `narrative.rules` 一條規則（name: "The Brand-Surface Exemption"），見 [.impeccable/design.json](../../../.impeccable/design.json)。

## Illustration Asset

**Chosen image**（`public/illustration-hero.png`）：兩人從背後坐在沙發上，靠近看著手機，身後有暖色落地燈，漂浮的光點與光帶（ember/sage/cream 色調），溫馨的夜晚室內、背景有城市窗景。插畫風、暖色調——直接對應 Futari「陪伴式記錄」的品牌哲學，同一張圖靠 CSS object-fit/object-position 供 desktop / mobile 兩種佈局共用裁切。

The illustration slot is isolated in a single `<IllustrationSlot>` component so swapping the image later requires no JSX changes.

## Landing Hero — Desktop / Mobile

Desktop：兩欄式 hero，copy 欄縮窄以讓出插圖欄空間；插圖填滿右欄，PhonePreview 縮小（新增 `scale` prop）疊在插圖右下角，退居次要的「product proof」角色，不再是唯一視覺。Copy（kicker / h1 / body / CTA）不變。

Mobile：插圖 band 移到最前面（wordmark 之前），取代原本 `<FutariMark>` 作為情感開場——理由同上：插圖比單純 logo 更能傳達「陪伴」。kana 行同步從 mobile 移除以維持精簡。

實作見 `app/[locale]/_landing/Landing.tsx`、`app/[locale]/_landing/IllustrationSlot.tsx`（新元件，`alt=""` 因為是裝飾性、意義由文案承載）、`app/[locale]/_landing/PhonePreview.tsx`（新增 `scale` prop）。

## Other Brand-Surface Pages

Sign-in / migrate layout / terms / privacy 的外層背景一律從 `--bg` 換成 `--bg-committed`，其餘不動。

## Interactions & Motion

沒有行為變更，沒有新動畫；`prefers-reduced-motion` 不受影響。
