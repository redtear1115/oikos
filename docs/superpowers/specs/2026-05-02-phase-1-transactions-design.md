# Phase 1 — 核心記帳設計 spec

> Status: design locked, pending user review
> Date: 2026-05-02
> Related: [2026-05-02-oikos-design.md](./2026-05-02-oikos-design.md)（總體 spec）

---

## 0. Overview

Phase 1 交付「核心記帳」MVP：
- 新增 / 編輯 / 刪除 transaction（編輯 = 軟刪 + 新增）
- 即時淨欠額計算（GroupBalance）
- Settlement（部分結清，含智能快選金額）
- 列表 / 篩選 / 月份分組
- Real-time 同步（partner 新增立刻看到）
- 空狀態 / 載入狀態
- 設定頁（基本帳本管理 + 登出）

不在 Phase 1：資產關聯（Phase 2）、自定 category（Phase 2+）、推播、匯出。

---

## 1. Brand & 視覺語言

### 1.1 命名

| 用途 | 名字 |
|---|---|
| 終端使用者看到（UI strings、page title、manifest `name`、marketing） | **Futari** / 「ふたり ・ 家計簿」 |
| 內部 codebase / repo / 技術文件 | **Oikos** |

不混用：UI 不出現 Oikos；codebase 不重命名為 Futari。

### 1.2 色票（從 designer mockup 抽出）

| Token | Value | 用途 |
|---|---|---|
| `--bg` | `#faf1e4` | 主背景（暖奶茶） |
| `--surface` | `#ffffff` | 卡片背景 |
| `--ink` | `#2a1f15` | 主文字 / 主按鈕 / member A avatar |
| `--ink-soft` | `#7a6b5d` | 次文字 |
| `--muted` | `#9a8b7c` | 提示文字 / footer |
| `--accent` | `#c97a4a` | 橘色強調（member B avatar、settlement 主按鈕、CTA） |
| `--accent-soft` | `#e8a978` | 橘色 hover/secondary |
| `--positive` | `#3d8a4f` | 對方欠你 / + 增加（綠） |
| `--negative` | `#c2604c` | 你欠對方 / − 減少（紅） |

> 完整 design tokens（hover、disabled、shadow、radius、spacing）由 designer 補；上表為 Phase 1 實作必需的最小集合。

### 1.3 Member 識別

- **Avatar 字母**：`display_name` 第一個字元
- **Avatar 底色**（Phase 1 hardcode by 位置）：
  - `member_a` → `--ink` (#2a1f15) 深棕底 + `#e8c89a` 米色字
  - `member_b` → `--accent` (#c97a4a) 橘底 + 白字
- **「我」/「對方」**：相對 viewer 翻轉。SQL 不存「誰是我」，前端依 `viewer.id === group.member_a_id` 決定。
- 自定 avatar 顏色為 Phase 2+。

### 1.4 Logo

雙人剪影 + 「Futari」wordmark + 「ふたり ・ 家計簿」tagline。

> SVG 由 designer 提供。先用 placeholder。

---

## 2. Dashboard 結構

```
┌─────────────────────────────────────────┐
│  [logo]  Futari            [C][L]   ←   │  ← brand header（avatar 點 = 設定）
│          ふたり ・ 家計簿                  │
├─────────────────────────────────────────┤
│  • 目前結算                               │
│  ┌───────────────────────────────────┐   │
│  │ [C]  你 欠對方                  > │   │  ← balance card
│  │      NT$ 461                       │   │
│  │      共 15 筆 · 五月已記 NT$180     │   │
│  └───────────────────────────────────┘   │
│                                          │
│  ┌───────────────────────────────────┐   │
│  │       + 新增一筆                  │   │  ← full-width primary（取代 FAB）
│  └───────────────────────────────────┘   │
│                                          │
│  最近紀錄                       篩選 >    │
│                                          │
│  五月 2026          1 筆 · NT$180         │  ← month section header
│  ┌───────────────────────────────────┐   │
│  │ [餐] 蘿蔔糕早餐         NT$ 180   │   │
│  │      5/1 · ⓒ 你付 · [平分]   +90  │   │
│  └───────────────────────────────────┘   │
│                                          │
│  四月 2026         11 筆 · NT$10,397      │
│  ┌───────────────────────────────────┐   │
│  │ [交] 高鐵 台北→台中    NT$1,490   │   │
│  │      4/30 · ⓛ 對方付 · [平分] −745│   │
│  └───────────────────────────────────┘   │
│  …                                       │
│                                          │
│  ─────── 載入更多 ───────                  │
└─────────────────────────────────────────┘
```

### 2.1 Header

- 左：logo + Futari + tagline
- 右：兩顆 avatar（C 我 / L 對方）。**Tap 任一 → 進設定頁**。

### 2.2 「目前結算」card

- Label「• 目前結算」上標
- 卡片內：
  - 左：viewer avatar 大圓
  - 中：文案 + balance（依正負翻轉）
    - balance > 0（從 viewer 角度）→「**對方 欠你 NT$ X**」+ 綠色金額
    - balance < 0 →「**你 欠對方 NT$ X**」+ 紅色金額
    - balance == 0 →「目前 NT$ 0」+「兩人沒有未結清的款項」
  - 右：`>` arrow，**tap 整卡 → inline 展開 settlement 表單**（見 §4）
  - Footnote：`共 N 筆 · {本月} 已記 NT${金額}`
    - `N` = 該帳本所有 active transaction 累積筆數（包含已結清前的）
    - `{本月}` = 當前真實月份
    - 「本月已記」= 該月份所有 active transaction `amount` 總和（不分付款人）

### 2.3 「+ 新增一筆」主按鈕

- Full-width，`--ink` 深棕底，白字
- 高度約 56px，圓角 16px
- 緊貼 balance card 下方，留 16px gap
- Tap → 開新增 transaction 表單（bottom sheet，§3）

### 2.4 「最近紀錄」+ 篩選

- 左標「最近紀錄」, 右側「篩選 >」
- 「篩選」icon = 漏斗符號 + 「篩選」字
- **套用篩選後**：「篩選」字旁出現 dot（`•`）表示有套用，避免使用者忘記

### 2.5 月份分組 + Lazy Load

- 列表按 `transacted_at` 降冪排序
- 視覺：每個自然月份一個 section header
  - 左：「五月 2026」
  - 右：「N 筆 · NT${該月該批次已載入的金額總和}」
- **Lazy load**：
  - 初次載入最近 **20 筆** active transaction
  - 滑到底 → 顯示「載入更多」按鈕（不是 infinite scroll，因為 mobile 誤觸成本高）
  - 每次點「載入更多」→ 再撈 20 筆（cursor 用 `transacted_at`）
  - 月份 section header 在資料 stream 進來後在 client 端動態切分

### 2.6 List item

```
┌────────────────────────────────────┐
│ [icon] 描述              NT$ 金額 │
│        日期 · 付款人 · [分攤chip]  ±影響 │
└────────────────────────────────────┘
```

- 左 `icon`：category 圓底字（24×24，依 §9 色票）
- 描述：粗體 13-14px
- 右金額：粗體（amount）
- 第二行：
  - 左：`{M/D} · {payer name} 付 · [分攤 chip]`
    - payer：`你 付` / `{對方名字} 付`
    - 分攤 chip：[平分] / [我的] / [對方的] — 依 viewer 翻轉
  - 右：個人欠款影響
    - 全部我的：`—`（不影響欠款，灰）
    - 平分（我付）：`+ {ceil(amount/2)}` 綠
    - 平分（對方付）：`− {ceil(amount/2)}` 紅
    - 全對方（我付）：`+ {amount}` 綠
    - 全對方（對方付）：`− {amount}` 紅
- **Tap 整卡 → 進編輯模式**（見 §3.4）

### 2.7 空狀態（無任何 active transaction）

- Balance card 仍顯示，內容：「目前 NT$ 0 / 兩人沒有未結清的款項」
- 下方仍有「+ 新增一筆」主按鈕
- 取代 list 的位置：

```
┌────────────────────────────────────┐
│              [♡]                    │  ← 雙色 heart icon（黑+橘），淡點點光暈
│                                    │
│         還沒有紀錄                  │
│                                    │
│   從第一筆開始 ─ 一杯咖啡、一頓晚餐  │
│   都算數。日子一天天記下來，回頭看   │
│   會很暖。                          │
│                                    │
│         [ + 記第一筆 ]              │  ← 橘 secondary CTA
└────────────────────────────────────┘
```

雙色 heart icon 由 designer 提供 SVG。

---

## 3. Transaction Form

Bottom sheet，從畫面下方滑上 ~85% 高度（保留上方 dim backdrop）。

### 3.1 結構

```
┌────────────────────────────────────────┐
│ 取消        新增紀錄              儲存  │  ← header（儲存橘字，未填完則灰）
├────────────────────────────────────────┤
│                                        │
│              金額                       │
│           NT$ 240                      │  ← hero，超大字
│                                        │
├────────────────────────────────────────┤
│  誰付的？           [C 我] [L 對方]      │  ← avatar pill（預設「我」）
├────────────────────────────────────────┤
│  ≡  描述（例：晚餐、雜貨）               │
├────────────────────────────────────────┤
│  日期                  今天 · 5/2  ▾    │  ← native date picker
├────────────────────────────────────────┤
│  分類                                   │
│  [餐 餐飲] [交 交通] [日 日用品] [娛 娛樂] →  │  ← 橫向 scroll chips
├────────────────────────────────────────┤
│  分攤方式                               │
│  ┌────────────────────────────────┐   │
│  │ [😐] 全部我的                 ○ │   │
│  │      對方不用付你                │   │
│  └────────────────────────────────┘   │
│  ┌────────────────────────────────┐   │
│  │ [🤝] 平分                     ✓ │   │  ← 預設選中
│  │      對方欠你 NT$ 120（即時計算） │   │
│  └────────────────────────────────┘   │
│  ┌────────────────────────────────┐   │
│  │ [😐] 全部對方的               ○ │   │
│  │      對方需付你全額              │   │
│  └────────────────────────────────┘   │
└────────────────────────────────────────┘
```

### 3.2 欄位 spec

| 欄位 | 必填 | 預設 | 控件 |
|---|---|---|---|
| 金額 | ✓ | （空） | 數字鍵盤 auto-pop，台幣整數 |
| 誰付的 | ✓ | 我（viewer） | Avatar pill 二選一 |
| 描述 | ✓ | （空） | 文字輸入 |
| 日期 | ✓ | 今天 | Native date picker |
| 分類 | ✗ | 不選 = 未分類 | 橫向 scroll chip 單選 |
| 分攤方式 | ✓ | 平分 | 大卡片三選一 |

### 3.3 「儲存」啟用條件

- 金額 > 0
- 描述非空
- 其他必填皆有值（誰付 / 日期 / 分攤方式都有預設，必然 OK）

### 3.4 編輯 transaction

- 觸發：dashboard list 任一 transaction item **整卡 tap**
- 開同一個 bottom sheet，header 改「編輯紀錄」
- 所有欄位預填現有值
- **底部多一顆紅色「刪除這筆」按鈕**（destructive 標準 pattern）
- 「儲存」= 一個 DB transaction 內：
  1. soft delete 舊 row（set `deleted_at = now()`）
  2. insert 新 row（複製欄位，套用使用者改動）
  3. 重算 GroupBalance（§10.1）
- 刪除 = 一個 DB transaction 內：
  1. soft delete 該 row
  2. 重算 GroupBalance

> UI 上使用者不感知這是「軟刪 + 新增」；對使用者來說就是「編輯」「刪除」。

### 3.5 Asset 欄位

Phase 1 **不顯示**。Schema 上 `asset_id` 仍 nullable 存在，Phase 2 加上 picker。

---

## 4. Settlement UX

### 4.1 觸發

Tap balance card 任意處 → balance card **同位置 inline 展開** settlement 表單（card 變 collapsed `v` 樣態，下方插入結清卡）。再 tap → 收起。

不開新頁面、不蓋 modal。

### 4.2 表單

```
┌────────────────────────────────────┐
│ • 目前結算                          │
│ ┌──────────────────────────────┐   │
│ │ [C] 你 欠對方             v  │   │  ← collapsed
│ │     NT$ 461                  │   │
│ │     共 15 筆 · 五月已記 NT$180│   │
│ └──────────────────────────────┘   │
│ ┌──────────────────────────────┐   │
│ │ [C] 我還 多少？                │   │
│ │                                │   │
│ │      NT$ 461                   │   │  ← editable big number
│ │                                │   │
│ │ ─────────────────────────      │   │
│ │ [全額·461] [一半·231] [整數·400]│   │
│ │                                │   │
│ │ [記錄還款 NT$461]   [取消]      │   │
│ └──────────────────────────────┘   │
└────────────────────────────────────┘
```

### 4.3 快選 chip 的計算

設目前淨欠額為 `D`（正數，從欠款方視角）：

| Chip | 金額 |
|---|---|
| 全額 | `D` |
| 一半 | `Math.ceil(D / 2)` |
| 整數 | `Math.round(D / 100) * 100`，但若結果 > D 則改為 `Math.floor(D / 100) * 100`；若 < 100 則藏起 |

> 「整數」的目的：拿整鈔還款。例：461 → 顯示「整數·500」會超過欠款，所以顯示「整數·400」（往下）。如果欠款 < 100，整數 chip 不顯示。

### 4.4 「我還 多少？」

- Viewer 的角度。即使是 viewer 收款（balance > 0 from viewer），文案仍是「我還 多少？」，因為 settlement 永遠是 **欠款方** 操作的。
- 如果 viewer 是被欠款方（balance > 0），點 balance card 後展開的也是同一張卡，但畫面上不該出現「我還」（viewer 不需要還）—— 此情境下顯示：
  - 標題：「對方還了 多少？」
  - 主按鈕：「記錄收款 NT$X」
- 換言之：**Settlement 永遠由欠款方主動記錄；UI 文案依 viewer 角度決定**。

### 4.5 主按鈕

- 「記錄還款 NT$X」/「記錄收款 NT$X」
- 橘色 (`--accent`)，啟用條件：金額 ∈ (0, D]
- Tap → server action 寫一筆 Settlement，重算 GroupBalance，收起卡片

### 4.6 取消

- 收起 settlement 表單，balance card 回到展開樣態

---

## 5. 篩選 (Filter)

### 5.1 入口

Dashboard「最近紀錄」右側「篩選 >」link。

### 5.2 樣式

Bottom sheet（從下方滑上約 70% 高度）。

```
┌────────────────────────────────────┐
│  重設            篩選           套用 │  ← 套用為橘字
├────────────────────────────────────┤
│  誰付的                              │
│  [全部] [我] [對方]                   │  ← 單選 chip
│                                      │
│  分攤                                │
│  [全部] [平分] [我的] [對方的]         │  ← 單選 chip
│                                      │
│  分類（可多選）                       │
│  [餐飲] [交通] [日用品] [娛樂]         │
│  [醫療] [家居] [禮物] [其他]           │  ← 多選 chip
└────────────────────────────────────┘
```

### 5.3 行為

- 「重設」：清空所有篩選，回到「全部 / 全部 / 無分類選中」
- 「套用」：close sheet + 套用篩選 + dashboard list 重算 + 「篩選」icon 旁顯示 dot
- 篩選 state 不持久化跨 session（重新打開 app = 無篩選）

---

## 6. 設定 (Settings)

### 6.1 入口

Dashboard header 右上 avatar tap（任一顆都進同頁）。

### 6.2 內容

```
┌────────────────────────────────────┐
│  ←        設定                      │
├────────────────────────────────────┤
│  帳本                                │
│  ┌──────────────────────────────┐   │
│  │ 帳本名稱       「我們家」  >  │   │
│  └──────────────────────────────┘   │
│                                      │
│  成員                                │
│  ┌──────────────────────────────┐   │
│  │ [C] Coco（你）                │   │
│  │     coco@example.com          │   │
│  ├──────────────────────────────┤   │
│  │ [L] Lin                       │   │
│  │     lin@example.com           │   │
│  └──────────────────────────────┘   │
│                                      │
│  個人                                │
│  ┌──────────────────────────────┐   │
│  │ 顯示名稱       「Coco」  >    │   │
│  └──────────────────────────────┘   │
│                                      │
│  ┌──────────────────────────────┐   │
│  │ 登出                       >  │   │
│  └──────────────────────────────┘   │
│                                      │
│  Futari · v0.1.0 · 法律聲明           │
└────────────────────────────────────┘
```

Phase 1 不做：頭像底色自定、推播設定、theme、匯出。

---

## 7. Real-time

### 7.1 範圍

Partner 在另一台裝置新增 / 編輯 / 刪除 transaction，viewer 的 dashboard 即時反應。

### 7.2 技術

- 使用 **Supabase Realtime postgres_changes** 訂閱 `CashTransactions`、`Settlements`、`GroupBalance` 三張 table
- Filter：`group_id = {viewer's group_id}`
- 對應的 RLS policies（Phase 0 已建）保證 viewer 只收到自己 group 的事件

### 7.3 UX：subtle highlight

- partner INSERT 一筆 transaction：
  - Client 收到 event → prepend 該筆到 list 最上方
  - 該筆 **背景閃淡黃 1 秒**（`#fffbe8` → 淡出回 `#fff`）
  - 不顯示 toast、不發出聲音
- partner UPDATE（即「編輯」= soft delete + insert）：
  - Client 看到舊 row `deleted_at` 變值 → 從 list 移除
  - 同時看到新 row insert → prepend + highlight
- partner DELETE（soft delete only）：
  - Client 看到舊 row `deleted_at` 變值 → fade out 0.5 秒後移除
- GroupBalance 變動：
  - balance card 數字 cross-fade 更新（不閃跳）

### 7.4 連線中斷

- WebSocket 斷線 → 重連時 refetch latest 20 筆對齊
- 不顯示「連線中斷」狀態給使用者（避免焦慮）

---

## 8. Categories

### 8.1 列表（hardcoded）

| Code | 顯示 | Icon char | bg / text | 排序 |
|---|---|---|---|---|
| `food` | 餐飲 | 餐 | 棕系 | 1 |
| `transport` | 交通 | 交 | 藍系 | 2 |
| `daily` | 日用品 | 日 | 黃系 | 3 |
| `entertainment` | 娛樂 | 娛 | 粉系 | 4 |
| `medical` | 醫療 | 醫 | 綠系（TBD） | 5 |
| `home` | 家居 | 家 | 米系（TBD） | 6 |
| `gift` | 禮物 | 禮 | 紫系（TBD） | 7 |
| `other` | 其他 | 其 | 灰系（TBD） | 8 |

> 已知色：餐飲 #5c3a1f / #e8c89a · 交通 #d4e8f2 / #5a8caa · 日用品 #f0e8d4 / #a08a5a · 娛樂 #f2dce8 / #aa5a8c
> 其他四個的精確色票由 designer 補。

### 8.2 「未分類」

- DB 上 `category` 欄位仍 `notNull`（避免 null/empty 兩種狀態）
- 使用者不選 = 寫入字串 `"other"`（直接歸入「其他」）
- 列表 item 顯示時，「其他」用灰色 icon 圓
- ⚠️ 如果未來 designer 想區分「未分類（使用者沒選）」與「其他（使用者主動選）」，需新增 `unclassified` code。Phase 1 簡化為共用 `other`。

### 8.3 與 CLAUDE.md 的差異

CLAUDE.md `ASSET_CATEGORIES.general` 原列 5 種（餐飲、交通、日用品、醫療、娛樂），需 **更新為 8 種**。Asset-specific category list（car/house/child/insurance）保持不變，留待 Phase 2。

---

## 9. Data flow（technical）

### 9.1 GroupBalance recalc

每筆 Transaction insert / soft-delete / Settlement insert / soft-delete 寫入後，**全量重算** GroupBalance：

```sql
UPDATE "GroupBalance"
SET balance = (
  SELECT COALESCE(SUM(
    CASE
      WHEN paid_by = (SELECT member_a FROM "OikosGroups" WHERE id = $1)
        THEN CASE split_type
          WHEN 'all_mine' THEN 0
          WHEN 'all_theirs' THEN amount
          WHEN 'half' THEN CEIL(amount / 2.0)::int
        END
      ELSE CASE split_type
          WHEN 'all_mine' THEN 0
          WHEN 'all_theirs' THEN -amount
          WHEN 'half' THEN -CEIL(amount / 2.0)::int
        END
    END
  ), 0)
  FROM "CashTransactions"
  WHERE group_id = $1 AND deleted_at IS NULL
) - (
  SELECT COALESCE(SUM(
    CASE
      WHEN paid_by = (SELECT member_a FROM "OikosGroups" WHERE id = $1) THEN amount
      ELSE -amount
    END
  ), 0)
  FROM "Settlements"
  WHERE group_id = $1 AND deleted_at IS NULL
),
version = version + 1,
last_calculated_at = NOW()
WHERE group_id = $1;
```

包在同一個 server action 的 DB transaction 內。

### 9.2 編輯 = soft delete + insert（atomic）

```ts
await db.transaction(async (tx) => {
  await tx.update(cashTransactions).set({ deletedAt: new Date() }).where(eq(cashTransactions.id, oldId))
  await tx.insert(cashTransactions).values({ ...newValues })
  await recalcBalance(tx, groupId)
})
```

### 9.3 Pagination（lazy 20）

- 初次：`SELECT * FROM CashTransactions WHERE group_id = $1 AND deleted_at IS NULL ORDER BY transacted_at DESC LIMIT 20`
- 載入更多：`... AND transacted_at < $cursor ORDER BY transacted_at DESC LIMIT 20`
- Cursor：上一批最後一筆的 `transacted_at`（用 string ISO timestamp）

### 9.4 Realtime channel

```ts
supabase
  .channel(`group:${groupId}`)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'CashTransactions', filter: `group_id=eq.${groupId}` }, handler)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'Settlements', filter: `group_id=eq.${groupId}` }, handler)
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'GroupBalance', filter: `group_id=eq.${groupId}` }, balanceHandler)
  .subscribe()
```

Client state 用 React state，不引入 Zustand / Redux。

### 9.5 pg_cron cleanup

`deleted_at` > 1 年的 row 物理刪除：

```sql
SELECT cron.schedule('cleanup-soft-deleted', '0 3 * * 0', $$
  DELETE FROM "CashTransactions" WHERE deleted_at < NOW() - INTERVAL '1 year';
  DELETE FROM "Settlements" WHERE deleted_at < NOW() - INTERVAL '1 year';
$$);
```

每週日 03:00 跑。Phase 1 設定，但實際刪除要等一年後才有資料。

---

## 10. 出範圍 (Phase 1)

- Asset 關聯 picker（Phase 2）
- 自定 category（Phase 2+）
- Push notification（無 PWA push）
- 多幣別
- 匯出 / 匯入
- Theme 切換
- 頭像上傳

---

## 11. 待 designer 補

1. Settings 頁完整 mockup
2. 編輯 transaction 頁的「刪除這筆」按鈕樣式
3. 篩選套用後 dashboard 上的視覺指示細節
4. 雙色 heart icon SVG（空狀態）
5. Futari logo SVG
6. 醫療 / 家居 / 禮物 / 其他 4 個 category 的精確色票
7. 完整 design tokens（hover、disabled、shadow、radius、spacing）
8. PWA icon set（512x512、192x192、maskable）

---

## 12. 待技術確認

實作時遇到再決定，這裡只列出已知會碰到的點：

- **Real-time 斷線重連**
  *情境*：使用者 app 切到背景數分鐘 / WiFi 切換 / 進地下停車場斷網。Supabase Realtime WebSocket 會斷。
  *待確認*：`@supabase/supabase-js` v2 預設的 reconnection backoff 是否夠用、是否需要 `realtime.connect()` 主動重連 hook 配 `visibilitychange` event。實作 §7.4 時 verify。

- **編輯後 list item 位置變動**
  *情境*：使用者把一筆 `5/1` 的 transaction 編輯成 `4/15`，因為 list 是按 `transacted_at` 倒序排，這筆要從「五月 2026」section 跳到「四月 2026」section。
  *待確認*：Real-time UPDATE handler 的實作 — 對於「同一個 logical transaction 的 soft-delete + insert」要視為「移動」而非「刪除 + 新增」？或就讓兩個 event 各自觸發（移除舊 + 插入新）？後者較簡單但會有半秒視覺破碎。實作 §9.4 時決定。

- **「整數」chip 的相鄰邊界**
  *情境*：欠款 D = 150。「全額」chip = 150，「整數」chip 算法 = `round(150/100)*100` = 200，但 200 > 150 所以往下 = 100。但 100 跟「一半」chip = `ceil(150/2)` = 75 又不衝突。看起來 OK。但如果 D = 100，「全額」= 100、「整數」也 = 100、「一半」= 50。「整數」跟「全額」重複。
  *待確認*：「整數」與「全額」相等時隱藏「整數」chip。實作 §4.3 時加 guard。

---

## Acceptance criteria（Phase 1 完成定義）

- [ ] 可新增 transaction，dashboard 即時更新 balance + list prepend
- [ ] 可編輯 transaction（軟刪 + 新增），balance 重算正確
- [ ] 可刪除 transaction（軟刪），balance 重算正確
- [ ] 可記錄 settlement（含部分結清、智能 chip），balance 變動正確
- [ ] List 按月分區塊、lazy 20 筆載入
- [ ] 篩選 bottom sheet 三維度過濾（誰付 / 分攤 / 分類）
- [ ] Real-time：partner 在另一裝置操作，viewer 即時看到（含淡黃 highlight）
- [ ] 空狀態正確顯示
- [ ] 設定頁可登出、改帳本名、改顯示名稱
- [ ] pg_cron cleanup job 已 schedule
- [ ] 全部 server action 有對應 unit tests（balance 計算、settlement chip math）
- [ ] Build pass + typecheck 0 errors + 全部 tests pass
