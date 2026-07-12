---
last_updated: 2026-07-13
status: shipped
first_shipped_in: v0.14.0
related_specs: [stats, transactions, income, recurring]
depends_on: [stats]
related_issues: ["#44"]
---

# 雙人月度回顧儀式

> 每月初給雙人一個共看時刻：看 4 張卡片（最常一起花的類別、本月最大筆、定期入帳事件、愛物進度），結尾各自寫一行「給下個月的我們」。
> Async 共看（不做 realtime cursor）；dashboard 月初 banner + 專頁 `/review/[YYYY-MM]`。

## 商業意義

解決雙人協作 app 留存挑戰（Zeta 停服教訓，見 [oikos-competitive-analysis.md](../oikos-competitive-analysis.md)），把月度 review 從「分析行為」轉成「兩人對話的時刻」。

---

## 背景與動機

競品（Honeydue / Zeta）只解決「共同帳戶」，沒持續創造使用動機，於是衰退。月度回顧把「記了之後一起回頭看」做成儀式，是別的 app 模仿不到的雙人專屬體驗——同時創造「下個月會回來看上個月寫的話」的回訪鉤。

不引入 push 通知（[offline-browsing](offline-browsing-design.md) 已聲明 push 不在範圍）。改用 **in-app banner**：每月 1 日後第一次打開 dashboard 就亮，看過後當月不再出。

---

## Scope

### In

- 月底（依 Asia/Taipei）pg_cron 預計算 snapshot，存 `MonthlyReviewSnapshots`
- Dashboard 月初一次性 banner：surface「上個月寫的話」+「本月一起看看」CTA，看過後當月熄滅
- 專頁 `/review/[YYYY-MM]`：4 張卡片 carousel + 上個月留言（read-only）+ 寫「給下個月的我們」
- `MonthlyReviewMessages` 兩筆 row（每位成員各寫一筆，200 codepoint cap）
- 編輯期：寫的當月可改，月底 cron 觸發後鎖定
- Solo Mode 對應：「給下個月的我」單筆；卡片計算規則不限分攤模式
- 第一個月（註冊未滿月）一樣 surface
- 零交易月 empty state：4 張卡片改成「ok」+ CTA「現在去補登」

### Out

- **Push notification**：infra 從零
- **Realtime cursor / 對方線上指示**：async 共看，不暗示彼此觀看狀態
- **「對方還沒看過」徽章**：同上，不暗示
- **回頭改上個月寫的話**：隔月鎖定後永遠 read-only
- **編輯／刪除卡片內容**：snapshot frozen，不允許改 stats 數字
- **跨群組統計**：固定一組 group / 一組成員
- **匿名 / 不簽名留言**：每筆 message 綁 member_id

---

## Locked decisions

### Banner surface

| 維度 | 決定 | 理由 |
|---|---|---|
| 觸發時間 | 每月 1 日 00:00 起，使用者第一次打開 dashboard 即顯示 | 不主動推播；等使用者進來再 surface |
| 內容 | 單一 banner，兩段：(1)「你們在 4 月寫下：…」(quote 上個月留言摘要 60 char) (2) 「→ 一起看看 5 月」CTA | 「兩個都做」整合：上個月留言 + 本月 CTA |
| 點擊行為 | 跳 `/review/2026-04`（被回顧的月）；同時標記 banner_dismissed | 點擊 = 已看 |
| 主動關閉 | banner 右上 `×` → dismissed | 給「我看過了不想再看」出口 |
| Per-user 還是 per-group | **per-user dismiss**：兩人各自有 dismiss 旗標 | 一人看過不代表另一人看過 |
| 二次顯示 | 當月 dismissed 後不再出，下個月 1 日再出 | 「看過後當月不再出」 |
| Solo Mode | 一樣 surface；只是內容單人視角（「你寫下」/「給下個月的我」） | 第一階段不分流 |

### 4 張卡片計算規則

| 卡片 | 計算 | Solo Mode 差異 |
|---|---|---|
| **1. 最常一起花的類別** | 對 `CashTransactions` filter `deleted_at IS NULL` + `split_type = 'half'`，依 `category` SUM(amount) 取 top 1 | 不限 split_type（all_mine / all_theirs / half 全納）|
| **2. 本月最大筆** | `CashTransactions` filter `deleted_at IS NULL`，MAX(amount) 對應的單筆，**含所有 split_type**，snapshot 該筆 description / category / amount / paid_by | 同；無差異 |
| **3. 定期入帳事件** | 列本月所有從 `IncomeTransactions` 與 `CashTransactions` 中由定期規則產生的事件，列出名稱 + 金額 + 收入／支出方向，整月 SUM | 同；無差異（規則不分 split） |
| **4. 愛物進度** | 對 `CashTransactions` group by `asset_id IS NOT NULL`，SUM(amount) 取 top 3，snapshot 各愛物 name / 開銷小計 | 同；無差異 |

**通則**：

- 軟刪除（`deleted_at IS NOT NULL`）排除——與 [stats](stats-design.md) 一致
- 所有原始金額用 `transacted_at` 落月（`Asia/Taipei` 月份切分）
- Snapshot 凍結：cron 一次寫死 `MonthlyReviewSnapshots` 的所有欄位；之後即使來源 row 被軟刪除、編輯，回顧也不更新
- 卡片內凡引用 `paid_by` member 名稱、asset name 等都 **snapshot 文字**，不存 FK，避免日後 rename / soft-delete 造成 dangling

### 「給下個月的我們」

| 維度 | 決定 | 理由 |
|---|---|---|
| Schema | `MonthlyReviewMessages` 一筆 / (group, year, month, member_id) | 兩人各寫各的，互不覆蓋；Solo Mode 自然就只有一筆 |
| 加密 | **不加密** | 雖屬「兩人之間的話」，但敏感度遠低於身分證／健保卡 |
| 文字長度 | 200 codepoint（中文字元計 1 個，emoji 計實際 codepoint） | 一行的尺度；server 強制驗 |
| 訊息「為了哪個月」 | row.year / row.month = 訊息「給」的那個月（未來月）| 開 `/review/2026-04` 寫的留言 row 是 `year=2026, month=5` |
| 編輯期 | 從寫下到該月底（Asia/Taipei，月底 cron 一起鎖）| 「當月可改 + 月底鎖定」 |
| 鎖定機制 | 月底 cron 把 `locked_at` 寫入；server action 拒絕 update if `locked_at IS NOT NULL` | 一次性鎖、不可解除 |
| 回頭改 | **不可** | 隔月 surface 時為 read-only |
| Solo Mode | 一筆 message；UI 文案改「給下個月的我」 | — |

### 架構

| 維度 | 決定 | 理由 |
|---|---|---|
| 計算時機 | **月底 pg_cron 預計算**，存 snapshot；不 on-demand | 卡片要 freeze；on-demand 會被軟刪除影響 |
| Cron 排程 | 每月 1 日 00:05 Asia/Taipei，計算「上一月」snapshot；同時鎖定上一月 messages | 邊界 buffer 5 分鐘給時區邊角 transaction 落地 |
| 雙環境 | dev 與 prod Supabase 各自建 cron job | 與既有 cron 一致；migration `db:migrate` 兩邊都跑 |
| Idempotency | snapshot insert with `ON CONFLICT (group_id, year, month) DO NOTHING` | 重跑 cron 不會炸 |
| Realtime | **不訂閱 realtime**；async 共看靠 `router.refresh()` 重抓 | 對方寫了什麼下次刷新會看到；不做 cursor / presence |
| Query reuse | snapshot 計算 reuse [stats](stats-design.md) 的 `monthlyStatsByCategory` / `monthlyStatsByAsset`；額外加 `monthlyLargestExpense` / `monthlyRecurringEvents` | stats spec 已預告會被 reuse |
| 閱讀路徑 | review page 直接 SELECT snapshot（無計算）| Snapshot 即真相 |

### 不採用

- ❌ **Push notification 觸發**：v0.14.0 不引入 push infra
- ❌ **Realtime cursor / 對方在線**：async 共看，不暗示彼此狀態
- ❌ **「對方還沒看過」徽章**：同上
- ❌ **on-demand aggregation**：snapshot 必須 freeze，on-demand 會被後續軟刪除污染
- ❌ **加密 messages**：敏感度不足以證成密鑰管理成本
- ❌ **回頭改上個月留言**：rule of trust，寫下了就是寫下了
- ❌ **多語留言切換時翻譯內容**：留言保留使用者輸入，不過 i18n
- ❌ **Banner 在多裝置間同步 dismiss 狀態的快照**：dismiss 寫 DB（per-user），自然跨裝置；不引 client cache

---

## 資料模型

詳細欄位以 `lib/db/schema.ts` 為準。本節說「為什麼這個結構」。

### `MonthlyReviewSnapshots`

- `group_id` / `year` / `month` + UNIQUE — 一個帳本 / 一個月恰一筆
- `top_category` + `top_category_total` — 卡片 1 凍結結果
- `largest_expense_*`（amount / description / category / paid_by_name）— 卡片 2 凍結，**denormalized snapshot**，paid_by_name 直接存字串避免日後 rename
- `recurring_events` jsonb — 卡片 3，多筆事件用 jsonb 收（每筆獨立欄位太散）
- `asset_breakdown` jsonb — 卡片 4，top 3 愛物（asset_name 凍結字串）
- `banner_dismissed_by_member_a_at` / `banner_dismissed_by_member_b_at` — per-user dismiss state

### `MonthlyReviewMessages`

- `(group_id, member_id, year, month)` UNIQUE — 一個人一個月一筆
- `body` ≤ 200 codepoint，server 驗（`[...str].length` 計）
- `locked_at` — null = 可改，非 null = 已鎖；server action 拒絕 update if `locked_at IS NOT NULL`

---

## Cron job 語意

排程：每月 1 日 00:05 Asia/Taipei，計算「上一月」。

對每個 active OikosGroup：

1. UPSERT `MonthlyReviewSnapshots`（target_year/month = (now - 1 day) 的年月）`ON CONFLICT DO NOTHING` 確保 idempotency
2. UPDATE `MonthlyReviewMessages` SET `locked_at = now()` WHERE 該月 + locked_at IS NULL

dev / prod Supabase 各 deploy 一條。

---

## UX 細節

### Dashboard banner

```
┌──────────────────────────────────────────────┐
│  你們在 4 月寫下：                            ×│
│  「下個月想一起去看海。」                     │
│                                              │
│  → 一起看看 5 月                             │
└──────────────────────────────────────────────┘
```

- 只在當月 1 日後第一次進 dashboard 顯示（per user）
- 上個月留言用 quote 形式呈現；若兩位都寫了，預設取登入者**對方**寫的
- 若上個月兩人都沒寫 → 不 quote，CTA 改為「→ 一起看看上個月」
- 若 snapshot 不存在（極罕見：group 創建首月、cron 尚未跑）→ banner 不顯示
- 點 CTA 或 quote 區 → navigate `/review/[YYYY-MM]` + dismiss
- `×` 主動關閉 → dismiss
- Solo Mode：「你 4 月寫下：…」「→ 看看 5 月」

### Review page 結構（由上而下）

1. **頁首**：「2026 年 4 月．我們的記帳回顧」
2. **上個月留言區（read-only）**：3 月寫給 4 月的話（兩人各一段，標頭顯示作者頭像）；若該月未寫不顯示此區
3. **4 張卡片 carousel**：左右滑動切卡；卡片視覺各自帶該卡的主題色
4. **「給下個月的我們」編輯區**：兩個 textarea（自己可編、對方的 read-only）；下方計字 `0/200`；Solo Mode 只一個 textarea
5. **頁腳**：「鎖定於 2026-05-01 00:05」標示（如 message 已 locked）

### 卡片內容範例

- **最常一起花的類別**：「五月你們最常一起花在 **餐飲** — NT$ 12,400」（Solo: 移除「一起」二字）
- **本月最大筆**：「最大一筆 — Ray 付的 **生日禮物**，NT$ 5,800」（snapshot 凍結）
- **定期入帳事件**：列表「房租 −18,000 / 5 日 · 公司 A 月薪 +85,000 / 10 日 · …」+ 月度收支總和
- **愛物進度**：top 3 愛物，每個一個 row + 該月開銷

### 零交易月

- 卡片 1, 2, 4 顯示「ok」+ 副字「這個月沒留下花費紀錄」+ CTA「現在去補登」（→ AddSheet）
- 卡片 3 如有定期事件正常顯示
- 留言編輯區照常出現

### 編輯流程

- 寫一筆 → 自動儲存（debounce 800ms）；不需要顯式按鈕
- 達 200 codepoint 鎖輸入並提示
- 進到已 locked 月份的 review → editor 切 read-only，下方註解「已於月底鎖定」
- Server action 若 `locked_at IS NOT NULL` 拒絕

### Async 共看

- 兩人各自打開 `/review/2026-04`，看到一樣的卡片與彼此的留言（self editable, other read-only）
- 不顯示「對方在線 / 已讀」
- 如同時編輯：兩人各自 row，互不影響

---

## 實作落地點

`drizzle/*_monthly_review.sql`（schema + cron）/ `lib/db/queries/monthlyReview.ts`（read queries）/ `actions/monthlyReview.ts`（upsert message / dismiss banner）/ `app/(dashboard)/review/[month]/page.tsx` + `_components/*`（review page + 4 卡 + carousel + MessageEditor）/ `app/(dashboard)/dashboard/_components/MonthlyReviewBanner.tsx`

---

## 風險與已知限制

1. **Cron 時區邊界**：`Asia/Taipei` 月底剛產生的 transaction，5/1 00:05 cron 抓得到嗎？要確認 cron schedule 用的 timezone 並調整 buffer
2. **Cron 漏跑 / 重跑**：`ON CONFLICT DO NOTHING` 確保不重複建 snapshot；如果 cron 漏了一個月，下個月才補跑時的處理 MVP 不做 backfill，留 manual SQL
3. **Banner dismiss state cross-device**：寫 DB 自然跨裝置；信 RSC + `router.refresh()` 不另做 sync
4. **空 snapshot（group 創建當月）**：第一個月底前該 group 沒有 snapshot；dashboard banner 不顯示。下個月 1 日 cron 跑針對「上個月」=「group 創建當月」會建 snapshot
5. **Member member_id 變動 / 換伴侶**：Oikos 是固定兩人，不支援換伴侶；MVP 假設 group member 不變
6. **Solo → 雙人轉換**：Solo Mode 期間留下的 message 在伴侶加入後，仍只有自己那筆；不會憑空多一筆對方留言
7. **200 codepoint 與 emoji**：emoji 經常是 multi-codepoint（surrogate pair / ZWJ sequence）。「200 中文字」== 200 codepoint，但複合 emoji 會吃掉多格——這是預期行為
8. **Snapshot 寫入錯誤**：cron 部分失敗會留 partial snapshot row 嗎？用 SQL transaction 包住確保 atomic
9. **沒寫 message 的月**：review page 上個月留言區直接不渲染；不要顯示「對方還沒寫」這種會 nudge 的文案
10. **5/1 早上 cron 還沒跑就有人開 dashboard**：snapshot 不存在 → banner 不顯示；幾分鐘後 cron 跑完，下次 navigate 才會 surface

---

## Acceptance criteria

- Cron 1 日 00:05 跑完 → snapshot 存在；上月 messages 全部 locked_at 寫入
- 重跑 cron 同一月 → `ON CONFLICT DO NOTHING`，snapshot 不重複；messages locked_at 不被改
- User A 月初進 dashboard → 看到 banner（quote A 對方上月留言）
- User A 點 banner 進 review page → banner 該月對 A 不再顯示；對 B 仍會顯示
- User A 主動 × banner → 同上
- Review page 寫 200 字 → 儲存成功；超過拒絕
- Review page emoji 滿 200 codepoint → 計數正確、儲存成功
- 月底 cron 跑後嘗試改上月 message → server action 拒絕，UI 顯示 read-only
- 上月有交易但有人軟刪了原本的 largest_expense → snapshot 凍結原值（不更新）
- 該月零交易 → 卡片 1/2/4 顯示「ok」+ CTA；卡片 3 視定期事件而定
- Solo Mode 使用者 → 一個 textarea；卡片 1 計算不限 split_type；文案「給下個月的我」
- 註冊未滿月，月底 cron 跑 → snapshot 建立（卡片可能很多 ok 狀態）
- 4 語切換 → UI 文案翻譯，留言內容不翻
- 兩人同時打開 review page、各自寫留言 → 互不影響、各自儲存
- 直接訪問 `/review/未來月` → 404
- 直接訪問 `/review/group 創建前的月` → 404（snapshot 不存在）

---

## 未來擴展

- **Push notification**：當 push infra 落地後改主動推播
- **Realtime cursor / 同看指示**：兩人同時打開時看到對方在哪張卡
- **跨月趨勢卡片**：近 3 / 6 個月對比
- **更多卡片類型**：例如「本月儲蓄險里程碑」「本月加油里程」
- **匿名 / 不簽名留言**：如果使用者反映想匿名寫
- **「給對方的話」（不對外公開）**：不同卡片區，更私密
- **Banner 主動推送至 system notification**：iOS Add to Home 後可能可走 Web Push
