---
last_updated: 2026-07-13
status: shipped
first_shipped_in: v0.17.5
related_specs: [onboarding, solo-mode, locale-currency, guardian]
related_issues: ["#427"]
---

# Avatar Quick Settings — 個人與帳本快捷入口

> Dashboard 右上角的 avatar 變成可點擊；點開 bottom sheet，集中放「個人 + 帳本」相關設定。
> Settings 主頁瘦身成 app + data + 危險區域，跟「我是誰 / 我們是誰」的身份識別分流。

---

## 背景與動機

Settings 頁長到一個程度，使用者要改個顯示名稱、切語言、調分攤比例都得滑進設定列表找。但這些操作其實高頻、屬於「身份識別」層 — 跟「定期收支規則」「過去章節」這種「資料層」操作不該擠在同一頁。

同時 Dashboard 右上角的雙人 avatar 是視覺資產但功能上是死的（只看不點），白白浪費了一個「我們」的識別錨點。

把兩件事接起來：avatar 既然代表「我 + 對方」，那點它應該開「跟我們倆有關的設定」。Settings 主頁因此可以收斂成「app 怎麼用、資料怎麼動、要不要拆夥」。

### 為什麼不是只是搬位置

不是純粹的 IA 微調。底層立場是：

- **身份識別應該離 dashboard 半秒鐘**：高頻、輕量、跟「我們」綁
- **資料 / 危險區應該離 dashboard 三層**：低頻、心理門檻刻意保留（例：swap / leave 不應該隨手一點就能到）

---

## 範疇

### 搬到 avatar sheet（個人 + 帳本身份）

| Section | Items | 歸屬理由 |
|---|---|---|
| 個人 | 顯示名稱、預設分攤方式、語言 | viewer-only，跟「我」綁。語言是 per-user cookie ([locale-currency](locale-currency-design.md))，是「我看世界的角度」 |
| 帳本 | 帳本名稱、預設分攤比例（paired only）、幣別、守護 Beta | group-level identity / opt-in。幣別是 `OikosGroups.base_currency`；守護 Beta 是 per-group opt-in ([guardian](guardian-design.md)) |
| 成員 | 成員列表 + solo invite CTA | group 組成本身；solo 模式下這裡是邀請出口 ([solo-mode](solo-mode-design.md)) |
| 登出 | — | 結束「我」這個 session |

### 留在 Settings 主頁（app + data + 危險）

| Section | Items |
|---|---|
| 應用 | 加到主畫面、離線瀏覽（device / PWA 層） |
| 資料 | 定期收支、過去章節、旅行、信任宣示（資料層進入點） |
| Danger Zone | 換邊（swap）、離開帳本（重操作，刻意保留心理門檻） |
| Footer | 版本號、條款、隱私 |

---

## Locked decisions

| 決策 | 取捨 |
|---|---|
| **互動方式 = bottom sheet**（不是 inline dropdown） | 與既有 sheet pattern 一致（codebase 10+ sheets）；mobile 上 dropdown 從 top-right 彈會撞 safe-area inset；分攤 radio + 比例 slider + 成員列表內容量不小，需要垂直空間 |
| **整個 avatar cluster（viewer + partner 兩顆）都是點擊區，開同一個 sheet** | 對使用者來說「avatar 是我們倆一體的視覺」，不該強迫他先想「我要點哪一顆才對」 |
| **Settings 主頁頂部加可點 entry row**（不是純文字提示） | Settings 主頁沒有 avatar 可點，純文字「→ 點右上角頭像」是死路。Entry row 本身是入口，點下去開**同一個 sheet** |
| **Sheet 是 standalone reusable component**（dashboard / settings 都掛同一個） | 避免實作分裂；兩個入口共用同一份 form state + server action 呼叫 |
| **搬，不是 duplicate** | Issue 描述用「搬」；duplicate 會雙處維護 form 邏輯，且使用者會混淆「哪邊改了會生效」 |
| **DangerZone 不搬進 sheet** | swap / leave 是 group 層重操作；放進「隨手點 avatar」的路徑會降低意外操作的心理門檻。保留「特地去 Settings」這個摩擦是有意的 |

### 不採用

- ❌ **Inline dropdown from top-right**：mobile 空間擠，撞 safe-area；codebase 沒有 dropdown 基礎元件，違反「複用既有 pattern」
- ❌ **Duplicate（兩處都顯示）**：form state 雙處同步成本；使用者改一邊不知另一邊是否同步
- ❌ **只 viewer avatar 可點**：使用者看 avatar cluster 是「我們」不是「我 vs 對方」
- ❌ **Settings 主頁加純文字 hint「→ 點右上角頭像」**：在 settings 路由上沒有 avatar 可點，是死路
- ❌ **把 DangerZone 也搬進 sheet**：降低重操作的心理門檻
- ❌ **把 recurring / past times / trips / trust 搬進 sheet**：這些是資料層進入點，跟身份識別正交，搬進去會讓 sheet 又變回小 Settings

---

## Sheet 結構

### 視覺骨架

跟 `EditTextSheet` 同一家族（bottom sheet、grabber、`SheetBackdrop`、Escape / outside tap 關閉）。Header 顯示一個簡單標題（如 group name + 雙人 avatar 縮影），不是 EditSheet 那種「取消 / title / 完成」三段式。

### Sections 順序

1. **成員（pair / solo 識別）** — 列 viewer + partner 兩列（solo 時只一列 + invite CTA）
2. **個人** — 顯示名稱、預設分攤方式（solo 時鎖 `all_mine`）、語言
3. **帳本** — 帳本名稱、預設分攤比例（paired only）、幣別、守護 Beta
4. **登出**（最底）

Sections 內 row 風格沿用 `SettingsContent` 既有 `<Row>`／radio 風格。

### Solo 模式差異

- 成員 section 只一列 + invite CTA（既有 `handleInvite` 邏輯）
- 預設分攤方式鎖 `all_mine` + 提示文字（既有 `displayedSplit` 處理）
- 預設分攤比例 section 隱藏（沒有對方可分）
- 守護 Beta toggle 仍可看可開（solo 也算合法 group）

---

## Settings 主頁變化

### 新增：頂部 entry row

主頁標題下方第一個 section 加一行 row「個人與帳本設定 ›」，點下去開 `AvatarMenuSheet`。視覺上跟其他 row 不同（稍微強調，例如左側放一個小 avatar pair 縮圖）以暗示「等於右上角 avatar」。

### 移除

- 帳本 section（groupName row）
- 預設分攤方式 & 比例 section
- 成員 section
- 個人 section（displayName row）
- 語言 & 幣別 section

### 保留

- 應用（install / offline）
- 資料（recurring / past times / trips / trust）
- 守護 Beta — **從 Settings 主頁移除**（已搬入 sheet 的帳本 section）
- DangerZone
- Logout — 從這裡移除（已在 sheet 內）；avoid 雙入口
- Footer（版本 + 條款 + 隱私）

> Logout 與守護 Beta 的歸屬決策同邏輯：身份相關 → sheet；資料/應用相關 → settings 主頁。Logout 是身份操作，搬走。

---

## 入口點

| Surface | 觸發 | 結果 |
|---|---|---|
| Dashboard `BrandHeader` 右上 avatar cluster | tap viewer 或 partner avatar（整個 cluster 為 hit area） | 開 AvatarMenuSheet |
| Settings 主頁頂部 entry row | tap row | 開**同一個** AvatarMenuSheet |

Sheet 不論從哪個入口開都是同一個 component instance（同一份 state、同樣關閉行為），確保兩處看到的內容、操作體感完全一致。

---

## Acceptance criteria

- Dashboard 右上 avatar cluster 是 tap target（viewer / partner 任一顆都可，hit area 大於小頭像視覺尺寸）
- Tap avatar → bottom sheet 從下方滑入，含成員 / 個人 / 帳本 / 登出 四 sections
- Sheet 內所有 row 操作（改名 / 切分攤 / 調比例 / 切語言 / 改幣別 / 守護 Beta toggle / 邀請 / 登出）都正常生效，重整後狀態正確
- Solo 模式：成員 section 顯示 invite CTA；分攤方式鎖 `all_mine`；分攤比例 section 隱藏
- Paired 模式：成員 section 顯示雙人；分攤比例 slider 出現
- Settings 主頁頂部新增 entry row「個人與帳本設定 ›」，tap 開同一個 sheet
- Settings 主頁不再顯示：帳本名稱、預設分攤方式、預設分攤比例、成員、個人顯示名稱、語言、幣別、守護 Beta、登出
- Settings 主頁仍顯示：應用、資料、DangerZone、Footer
- Sheet backdrop tap / Escape 鍵 / grabber 拖下都能關 sheet（與既有 sheet 行為一致）
- 4 語 i18n 全到位（既有 `t.settings.*` key 可複用，僅可能新增 sheet header / entry row 文案）

---

## 與其他 spec 的關係

- [solo-mode](solo-mode-design.md) — 成員 section 的 solo 邏輯（invite CTA、分攤鎖 `all_mine`）沿用此 spec 既有規則
- [locale-currency](locale-currency-design.md) — 語言（per-user cookie）放個人；幣別（per-group base）放帳本，與 spec 對「locale ⊥ currency」的分層一致
- [guardian](guardian-design.md) — 守護 Beta toggle 從 Settings 主頁搬入 sheet 的帳本 section；不改 `guardian_beta_enabled` 的閘門語意
- [onboarding](onboarding-design.md) — 不影響 onboarding flow；新用戶第一次進 dashboard 時 avatar 就可點，無須額外引導（hint 留給後續觀察）
