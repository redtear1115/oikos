---
last_updated: 2026-07-13
status: shipped
first_shipped_in: v0.2.0
related_specs: [solo-mode, transactions, locale-currency]
related_issues: []
---

# Onboarding Flow

> 新人從首次造訪到看到自己的 dashboard 的 3 步流程：歡迎 → 建立帳本 → 邀請對方（或稍後再說）。
> 「稍後再說」會掉進 [solo-mode](solo-mode-design.md)。

---

## 背景與動機

Phase 1 假設使用者一定是雙人組合。但在友人測試階段，部分使用者可能還沒有伴侶、或伴侶不願馬上加入、或想先自己熟悉介面。設計稿在邀請步驟已規劃「稍後再邀請 →」CTA，代表 Solo Mode 是設計師原本就預期的情境——本 spec 把 onboarding 自己 lock 起來，Solo Mode 的執行細節獨立成 [solo-mode](solo-mode-design.md)。

對齊「低門檻進入」設計原則：第一次使用應在 60 秒內完成第一筆紀錄。

---

## 三步流程

對齊設計稿 02 · Onboarding：

### Step 1 — 歡迎畫面（`/sign-in`）

- Futari logo + ふたり 標語 + 副標
- Google 登入按鈕
- 服務條款小字
- 品牌色全螢幕背景
- 頁尾 LanguageSwitcher（footer variant；first-touch 就告訴使用者「這個 app 願意說你的語言」，見 [locale-currency](locale-currency-design.md)）

### Step 2 — 建立群組（`/setup` Step 1）

- 帳本名稱 input（`maxLength=20`，字數計數）
- 建議 chips：「我們倆 / ○○家 / 日日 / Home / 一起」
- 「下一步」disabled 當 name 為空
- **不強推幣別選擇**：新 group 預設 `base_currency = 'twd'`，需要改幣別的使用者到 Settings → 主體貨幣調整（限當前 epoch 無 record 時可改，見 [locale-currency](locale-currency-design.md)）

### Step 3 — 邀請對方（`/setup` Step 2）

- 邀請連結（token-based 7 天 expire，存 `GroupInvites`）
- 複製按鈕
- Web Share API（LINE / 訊息 / 更多）
- 底部「稍後再邀請 →」進入 [solo-mode](solo-mode-design.md)

---

## Locked decisions

| 維度 | 決定 | 理由 |
|---|---|---|
| 強制流程 | 三步必填；不能跳過建立帳本（但可跳邀請） | 帳本是 group 的容器，沒它後面什麼都 wire 不起來 |
| 帳本命名最大長度 | 20 字 | 避免 hero card 排版破版；20 字夠中文 / 短英文 |
| 邀請 token 期限 | 7 天 | 平衡安全 vs 實際分享節奏（朋友常常隔幾天才看到訊息） |
| 「稍後再邀請」出口 | 永遠提供 | 沒有對象的人也能用；不要在第三步擋人 |
| 第二步建議 chips | 5 個固定選項 | 不暴露所有可能，給人「立刻可選」的快感；不喜歡的人 input 自由打 |
| Onboarding 完成後 redirect | `/dashboard` | 直接進主畫面開始記帳 |

### 不採用

- ❌ **加 tutorial overlay / coach mark**：違反「不侵略」陪伴原則；第一筆記帳的 UX 本身就足夠引導
- ❌ **必填邀請對方**：擋掉沒有伴侶 / 不想立刻邀請的場景
- ❌ **建立帳本時要選類型**（共同生活帳本 / 親子帳本 / 同居帳本）：複雜度高，所有類型差異目前由「成員是誰」+ Solo Mode 解決
- ❌ **歡迎畫面顯示 demo data**：違反 brand「不評判」氣質；自己的帳本應該從空白開始

---

## 升級為雙人模式

對方接受邀請後：

1. Server-side accept invite → `OikosGroups.member_b` 從 null 變對方 user_id
2. [realtime](realtime-design.md) 訂閱 `OikosGroups` UPDATE event
3. Event bus 廣播 → Solo banner 消失、BalanceHero 出現、AddSheet 解鎖分攤
4. Solo 期間紀錄一律 `split_type = 'all_mine'`，升雙人後**不 retroactive 處理**（見 [solo-mode](solo-mode-design.md)）

---

## 實作落地點

`app/sign-in/page.tsx`（歡迎畫面）/ `app/setup/`（兩步 wizard）/ `actions/group.ts`（建立 OikosGroups + member_a）/ `actions/groupInvites.ts`（產生 invite token）/ `lib/i18n/LanguageSwitcher.tsx`（footer variant）

---

## Acceptance criteria

- 新使用者登入後若沒 group → redirect 到 `/setup`，不會進 dashboard 看到 broken state
- 建立帳本名稱輸入 20 字達上限 → 鎖輸入
- 邀請步驟「稍後再邀請」→ 進入 [solo-mode](solo-mode-design.md)（`member_b = NULL`）
- 邀請連結 7 天後 expire → 點開顯示「邀請已過期」+ 重新產生新連結
- 對方接受邀請 → A 端 realtime 即時升雙人（無須刷新）

---

## 不在本 spec 範圍

- 月份分析（圓餅圖 + YoY）→ 見 [stats](stats-design.md)
- 邀請到期重新產生連結的 UI → `GroupInvites.expiresAt` 邏輯已存在，UI 暫不處理
- Solo Mode 跨 surface 行為 → 見 [solo-mode](solo-mode-design.md)
