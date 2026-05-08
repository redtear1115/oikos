# 自訂定期收入設計 spec

> 目標：定義「定期收入規則 → 到期產生待確認卡片 → 用戶確認落 IncomeTransaction」的端到端設計。
> 優先級：P3（延伸 IncomeSheet 0_7_0；不阻擋 Phase 2 保險其他 slice）。

全部已完成（v0.8.0 / v0.8.1）。見 `drizzle/0016_recurring_income.sql`、`actions/recurringIncome.ts`、`app/(dashboard)/settings/recurring-income/`。

---

## 背景與動機

IncomeSheet（0_7_0）shipped 後，8 種收入類別裡有 6 類是**天然週期性**：薪（月）、期（保險滿期）、紅（季/年股息）、副（月或不規律）、退（年）、賠（不規律）。每次都手動記是高摩擦的，特別是薪水這種「金額幾乎固定、日期幾乎固定」的條目。

但 Futari 的設計原則是「克制」與「陪伴而不侵略」（[CLAUDE.md](../../../CLAUDE.md) → 設計原則第 1、4 條）：背景悄悄寫資料庫違反這個基調。因此本 spec 採 **preview→commit** 模型——cron 產生「待確認 pending」，用戶在 Dashboard 上看到卡片、按一下才落 IncomeTransaction。這保留了「我還是有參與這筆紀錄」的儀式感，又免去金額/日期的手動輸入。

---

## Scope

### In

- 規則表（`RecurringIncomeRules`）：用戶可建立 / 編輯 / 暫停 / 刪除定期收入規則
- 待確認表（`PendingIncomeOccurrences`）：cron 產生的待確認 pending
- 每日 pg_cron job：到期產 pending（idempotent）
- Dashboard 待確認卡片堆疊（進帳模式）
- 三個動作：「就這樣」（直接 confirm）/「改一下」（開 IncomeSheet 預填）/「跳過」（標記 skip）
- 規則設定頁（`/settings/recurring-income`）
- 邊界處理：暫停、刪除、catch-up、月底 day-of-month clamp、多裝置 race

### Out

- **每週/雙週週期**（biweekly salary）：MVP 只支援以「月」為單位的 interval（1 / 3 / 6 / 12 月），雙週留 open question
- **支出側的定期**（recurring expense）：本 spec 只處理收入；未來可沿用結構但不在本 lock 範圍
- **規則金額變動時自動套用到既有未確認 pending**：snapshot at generate-time，已產的 pending 保留原 proposedAmount
- **保險滿期/理賠的特殊定期 UX**：留給 Phase 2 保險 slice
- **Push notification**：infra 為零，不在本 spec 引入；卡片只活在 Dashboard 上
- **跨群組規則**：規則跟 IncomeTransaction 一樣 group-scoped

---

## Locked decisions

| 維度 | 決定 | 理由 |
|---|---|---|
| 觸發模型 | **Preview→Commit**（cron 產 pending，user 確認落 tx） | 不違「不背景自動」原則；保留 ritual；infra 全在現成 |
| Pending 載體 | **獨立 `PendingIncomeOccurrences` 表** | 維持 `IncomeTransactions` invariant=「已確認」；現有 query / Realtime / RLS 全不動 |
| 週期單位 | **interval_months 整數**（1=月 / 3=季 / 6=半年 / 12=年） | 一個欄位涵蓋所有實務月度週期；雙週延後處理 |
| 日期錨 | **day_of_month 1–31 + clamp 到當月最後一天** | 處理 31 號規則在二月的退化；不引入「最後一天」/「第一個工作日」這種複雜錨 |
| Cron 排程 | **每日 16:00 UTC**（= 台北 00:00） | 用戶醒來時 pending 已就位 |
| Pending 出現位置 | **Dashboard 進帳模式，hero card 上方堆疊** | 跟「進帳是兩人共同生活的高光時刻」基調一致；支出模式不打擾 |
| 支出模式指示 | **進帳 pill 上小 dot**（不顯示數字） | 提示有東西，不施壓 |
| 三動作層級 | **就這樣（primary） / 改一下（secondary） / 跳過（tertiary）** | 默認最低摩擦路徑是「就這樣」；跳過要稍微費力，避免反射性消除 |
| Catch-up 策略 | **Pause→Resume：0 期**（snap next_occurrence 到未來）；**Cron outage：自然每天補 1 張**直到追上 | Pause 是用戶主動行為，不該有補登；Cron outage 是系統責任，那些期真的發生過該保留 |
| 規則刪除 | **soft delete + 級聯軟刪 pending** | 用戶刪規則=「我不再要這個」，留著 pending 反而困惑 |
| Backfill 策略 | **不 backfill 過去**：規則 `startsOn` 即使在過去，第一張 pending 從建立規則「之後」的下一個錨點開始 | 避免新建規則一次跳 N 張卡片；過去的補登請走一般 IncomeSheet |
| 跳過後資料保留 | **keep `skippedAt`，pg_cron 90 天後物理刪** | 給審計／除錯短窗，不長期累積 |

### 不採用

- ❌ **Status 欄位塞回 IncomeTransactions**（`confirmedAt` nullable）：每個既有 query 都得加 filter，漏一個就出 bug；invariant 變模糊
- ❌ **背景直接建 tx + glow**：違反「克制」原則；金額變動需回頭改的成本高
- ❌ **App-open lazy 提醒**（client-side 算 due）：多裝置 dedup 麻煩；薪水當天沒開 app 就晚看到
- ❌ **Push notification**：infra 從零建成本不成比例；MVP 用 Dashboard 卡片就夠
- ❌ **「自動套用未來幾期」toggle**：UI 複雜度高、價值低；用戶要改未來就直接編輯規則
- ❌ **「最後一天 / 第一個工作日」這類複雜錨**：用 day_of_month + clamp 已涵蓋 95% 場景

---

## 資料模型

### `RecurringIncomeRules`

Schema：[lib/db/schema.ts](../../../lib/db/schema.ts) → `recurringIncomeRules`。Migration：[drizzle/0016_recurring_income.sql](../../../drizzle/0016_recurring_income.sql)。

欄位要點：`interval_months`（1/3/6/12）、`day_of_month`（1–31）、`starts_on` / `ends_on`（選填結束日）、`next_occurrence_at`（cron 觸發鍵）、`paused_at` / `deleted_at`（soft states）。

**`next_occurrence_at` 維護**：rule 建立時由 server action 計算（`startsOn` 之後第一個落在 `day_of_month` 的日期）。每次 cron 產 pending 後 += `interval_months`（並對 day_of_month 做 clamp）。`startsOn` / `interval_months` / `day_of_month` 改動時由 server action 重算。

### `PendingIncomeOccurrences`

Schema：[lib/db/schema.ts](../../../lib/db/schema.ts) → `pendingIncomeOccurrences`。Migration：[drizzle/0016_recurring_income.sql](../../../drizzle/0016_recurring_income.sql)。

欄位要點：`period_start`（錨日，UNIQUE 鍵之一）、`proposed_amount` / `proposed_date`（snapshot at generate-time，不跟著規則改動）、`skipped_at` / `resolved_tx_id`（狀態旗標）。UNIQUE `(rule_id, period_start)` 保證 idempotency。

**狀態語意**：
- `skipped_at IS NULL AND resolved_tx_id IS NULL` → **active pending**（顯示卡片）
- `resolved_tx_id IS NOT NULL` → **已確認**（保留作為審計指標；卡片消失）
- `skipped_at IS NOT NULL` → **已跳過**（卡片消失；90 天後 pg_cron 物理刪）

**確認/跳過後不真的刪 row**：留 audit trail，方便用戶問「我這個月是不是漏記薪水」時查得到。

### RLS / Realtime

兩張表都加：
- RLS：`group_id IN (group I'm a member of)`，跟 `IncomeTransactions` 同 pattern（[drizzle/0012](../../../drizzle/0012_income_transactions.sql)）
- 加入 `supabase_realtime` publication，讓 partner 端建立規則 / 確認 pending 時即時同步

---

## Cron job 邏輯

### `generate_pending_income`

實作：[drizzle/0016_recurring_income.sql](../../../drizzle/0016_recurring_income.sql)。排程：每日 16:00 UTC（= 台北 00:00）。

邏輯：對每個 active（`deleted_at IS NULL AND paused_at IS NULL`）且 `next_occurrence_at <= CURRENT_DATE` 的規則，INSERT pending（ON CONFLICT DO NOTHING 保 idempotency）；然後把 `next_occurrence_at` 推進一格（`compute_next_occurrence` SQL helper）。

**`compute_next_occurrence(curr_date, interval_months, day_of_month)`** 為 helper SQL function：
- 算 `curr_date + interval_months months` 的當月，再嘗試取 `day_of_month`
- 若該月沒這天（例：Feb 31）→ clamp 到當月最後一天
- 回傳 date

### Idempotency / Dedup

兩層保險：
1. UNIQUE `(rule_id, period_start)` 是硬保證——cron 跑兩次、或 pause→resume 同一 period 也不會重複
2. `next_occurrence_at <= CURRENT_DATE` 過濾 + `INSERT … ON CONFLICT DO NOTHING`

### Catch-up 行為

「最多 catch-up 1 期」這個策略**不在 cron 內實作**，而是在 `resumeRule` server action 內處理（更乾淨：cron 邏輯保持單純的「前進一格」）。

- **正常每日跑**：每個規則一次前進 1 期。每天最多產一張 pending（因為產完就把 next_occurrence_at 推到下個 anchor，下次 cron 不再 due）
- **規則暫停 N 個月後 resume**：`resumeRule` action 內，**先把 next_occurrence_at snap 到「未來最近的 anchor」**（即 `startsOn` 之後第一個 anchor > today），再清掉 `paused_at`。這樣 resume 後不會產任何補登 pending；想補登請走一般 IncomeSheet
  - 替代設計（討論過不採）：snap 到「最近一個 ≤ today 的 anchor」會在 resume 後產 1 張補登卡。但這違反「pause = 我這段時間不要任何提示」的直覺，且沒有清楚的「為什麼是這個月不是上個月」答案
- **規則建立後第一次**：`next_occurrence_at` 由 server action 計算為「`startsOn` 之後第一個落在 `day_of_month` 的日期」，可能是當月或下個月。Cron 跑到那天才產 pending。不 backfill 過去
- **Cron 連續多天 outage 後恢復**：理論上每天 cron 跑一次、最多產一張，所以連續 outage N 天後恢復，第一次跑只會產 1 張（最舊的那一期），第二天再產 1 張……要連續 N 天才補完。實務上 pg_cron outage 罕見且短，可接受；若要更激進可加「missed 跑時 catch up to today」邏輯，但 YAGNI

---

## UI/UX

### 設定頁 `/settings/recurring-income`

**列表頁**：
- 標題：「定期進帳」
- 每張規則卡片顯示：mono chip（薪/獎/...）+ source（「公司 A 月薪」）+ 「每月 25 號 · NT$ X」+ 暫停 toggle + 編輯/刪除 menu
- 空狀態：用既有「光點品牌」pattern（constellation + halo），文案「還沒設定定期進帳」+ CTA「新增第一個」

**新增/編輯 form**（沿用 IncomeSheet 視覺語彙、但獨立頁面）：
- 金額（56px 大字，跟 IncomeSheet 一致）
- 收入類別 chip（8 選 1，沿用 INCOME_CATEGORIES token）
- 收入歸誰（recipient toggle，Solo Mode 自動填本人）
- 週期：「每 [1/3/6/12] 個月」segmented control（預設 1）
- 號數：「每月 [N] 號」number stepper（1–31，預設今天日期）
- 起始：起始日期 picker（預設今天，可選未來）
- 結束：結束日期 picker（選填，預設無結束）
- 關聯資產：選填，限 group 內 assets（保單最常見）
- 備註（source）：選填自由文字
- 動作：儲存 / 取消（編輯模式多一個刪除）

**進入點**：
- `/settings/` 主頁加項目「定期進帳」
- IncomeSheet 提交後**不**主動推銷規則化（避免每次記帳都騷擾）—改在 Records「進帳」tab 的 sticky header 加一個小入口「設定定期進帳 →」（Phase 2）

### Dashboard pending card stack

**位置**：Dashboard 進帳模式 hero card **上方**。卡片堆疊（最多顯示 3 張，超過收進「展開更多」）。

**卡片 anatomy**（單張）：
```
┌─────────────────────────────────────┐
│ [薪]  公司 A 月薪                    │
│       5/1（提示日）                  │
│       NT$ 75,000                    │
│                                     │
│ [就這樣]      [改一下]    [跳過]     │
└─────────────────────────────────────┘
```
- 左上 mono chip 用該 category 的 mint 系 tint
- 整卡背景：mint glow 弱 layer（跟 IncomeSheet 提交後 row 的 glow 一致語言）
- Primary action「就這樣」：點下→直接 confirm，卡片 fade out（0.6s glow → 1.2s fade，跟 0_7_0 的 celebration 一致）
- Secondary「改一下」：點下→開 IncomeSheet，predefilled 全欄（含 ruleId 暗存），submit 時 confirm pending 並建立 tx
- Tertiary「跳過」：點下→ confirmation toast「跳過 5/1 公司 A 月薪？」（避免誤觸），確認後標記 `skippedAt`，卡片 fade out
- 整卡可點：擴開顯示 source / asset / recipient 詳細

**支出模式時**：
- pending 卡片不顯示
- 進帳 pill 加上小 dot（4px，accent mint），無數字
- 切到進帳模式後才看到內容

**多張規則同期**：每張獨立卡片，按 `proposed_date` ASC 排（最早的在最上面）。

### 與 IncomeSheet 整合

「改一下」流程：
1. 點卡片「改一下」
2. 開 IncomeSheet，所有欄位 prefilled：
   - amount = pending.proposed_amount
   - category = rule.category
   - recipient = rule.recipient
   - occurredAt = pending.proposed_date
   - source = rule.source
   - assetId = rule.asset_id
3. Sheet 內 hidden state 帶 `pendingId`
4. 用戶按「儲存」→ server action `editAndConfirmPending(pendingId, fields)`：
   - 在同一 DB transaction 內：INSERT IncomeTransaction + UPDATE PendingIncomeOccurrence SET resolved_tx_id = new tx id
   - 失敗 rollback，pending 保持 active
5. 成功後 sheet 關閉，dashboard 卡片 fade out

「就這樣」流程：
- 不開 sheet，直接 server action `confirmPending(pendingId)` 用 proposed values 建 tx
- 同樣原子性：INSERT IncomeTx + UPDATE pending.resolved_tx_id

「跳過」流程：
- server action `skipPending(pendingId)` → UPDATE pending SET skipped_at = NOW()
- 不建 IncomeTransaction

---

## 邊界情況

| 情境 | 行為 |
|---|---|
| 規則 day_of_month=31，遇到 2 月 | clamp 到 2 月最後一天（28 或 29），產 pending 用 clamped date |
| 規則 day_of_month=31，遇到 4/6/9/11 月 | clamp 到 30 |
| 用戶建立規則時 startsOn 在過去 3 個月 | 不 backfill；next_occurrence 從**未來最近**的錨日開始 |
| 用戶 pause 規則，期間錯過 2 期 | resume 不補登。`resumeRule` action snap next_occurrence_at 到未來最近 anchor，pending 卡片 0 張。要補登請走一般 IncomeSheet |
| 用戶 pause 規則，期間有未確認 pending | pause 不影響既有 pending；用戶仍可 confirm/skip/edit 該卡片 |
| 用戶 delete（軟刪）規則 | server action `softDeleteRule` 同 transaction 內：(1) UPDATE rule SET deleted_at=NOW()；(2) DELETE active pendings（`resolved_tx_id IS NULL AND skipped_at IS NULL`）。已 resolved 的 pending 不動（指向真實 IncomeTx，留作審計）；已 skipped 的不動（90 天後 pg_cron 自然 purge）。FK CASCADE 只在後續 rule **硬刪**時兜底（pg_cron 1 年後物理刪），那時 active pendings 早已被 server action 清乾淨 |
| 用戶在規則 ends_on 之後 resume | next_occurrence_at > ends_on，cron 過濾掉，不再產 pending（規則自然進入「已結束」靜止態） |
| 用戶編輯規則金額 NT$ X → NT$ Y，已有 active pending | pending.proposed_amount **不變**（snapshot at generate-time）。下一期 cron 產的 pending 才用新金額。卡片上不顯示「規則已改」hint（YAGNI） |
| 用戶編輯規則 day_of_month / interval_months | 重算 next_occurrence_at（取 `max(today, 新規則套到 startsOn 後第一個 anchor)`）。已產的 active pending 不動 |
| 兩裝置同時點「就這樣」 | 第二個 server action 看到 pending 已有 resolved_tx_id（或被 race-locked），回傳「已被處理」，client refresh 卡片消失 |
| 兩裝置一個確認、一個改一下 | 同上：先到的成功，後到的看到 already resolved，提示「partner 剛剛已確認」 |
| Cron 失敗一天 | 隔天跑時 `next_occurrence_at <= CURRENT_DATE` 仍真，照樣產 pending（pg_cron 本身有 retry / log，但邏輯不依賴） |
| 用戶 confirm 後想撤回 | 用既有 IncomeTransactions soft-delete（IncomeSheet 編輯 → 刪除）。pending.resolved_tx_id 保留，不還原 pending（要想再產這期需手動走 IncomeSheet） |
| Group 只有一個 member（Solo Mode） | recipient 預設本人；partner 加入後規則仍掛在原 recipient 名下，不自動轉 |
| recipient 被踢出 group | 規則進入 invalid state；server action 在 cron 前先 join check，若 recipient 已不在 group → 該規則 paused（自動 set paused_at） |

---

## 排程

### 已完成（v0.8.0 + v0.8.1）

全部 Phase 1 + Phase 2 功能已 ship。關鍵檔案：
- Schema + migration：[drizzle/0016](../../../drizzle/0016_recurring_income.sql) · [lib/db/schema.ts](../../../lib/db/schema.ts)
- Server actions：[actions/recurringIncome.ts](../../../actions/recurringIncome.ts)
- DB queries：[lib/db/queries/recurringIncome.ts](../../../lib/db/queries/recurringIncome.ts)
- 設定頁：[app/(dashboard)/settings/recurring-income/](../../../app/%28dashboard%29/settings/recurring-income/)
- Dashboard stack：[app/(dashboard)/dashboard/_components/PendingIncomeStack.tsx](../../../app/%28dashboard%29/dashboard/_components/PendingIncomeStack.tsx)

### Phase 3（後續，非本 spec lock）

- 雙週週期支援（需重設計 day_of_month → day_of_week + week_anchor）
- Push notification 推送（若 push infra 後續引入）
- 保險詳情頁「期繳」自動 suggest 建立規則（跟 Phase 2 保險 slice 整合）
- 「Save as recurring」toggle on IncomeSheet 一次性記帳後

---

## Open / deferred questions

1. **雙週 / 週週期**：薪水有 biweekly 案例，但需要 day_of_week + 一個基準週的雙欄位。MVP 月度先 cover 80%，等真實需求再擴
2. **「最後一天」錨點**：例如「每月最後一個工作日領薪」。目前 day_of_month=31 + clamp 在大多月會落在「最後一天」，但 4/6/9/11 月會是 30。需求驗證後決定要不要加 special anchor
3. **規則套 partner**：couple group 裡，A 建的規則 default recipient=A；要不要加 UI 讓 A 改 recipient=B？目前 form 預設不暴露這選項（避免複雜度），靠編輯 rule 時改
4. **規則之間衝突**：用戶建兩個一樣的「每月 1 號 公司 A 月薪 75k」會產兩張 pending。要不要建立時偵測重複？目前不偵測（YAGNI；用戶可自行刪一個）
5. **Audit / 統計**：未來想看「過去半年我跳過幾次 pending」，需要 query `skipped_at IS NOT NULL` 的歷史。Schema 已支援，UI 待 Phase 3
6. **新增規則時要不要立刻產今天的 pending**：目前 spec 為「不」，cron 跑下次。若用戶覺得「我建完應該馬上看到卡片」可改為 server action 在建立 rule 後若 next_occurrence_at <= today 立即產第一張 pending

---

## 索引

- IncomeSheet 既有 spec：[income-design.md](income-design.md)
- IncomeTransactions schema：[lib/db/schema.ts:185](../../../lib/db/schema.ts#L185)
- IncomeTransactions migration：[drizzle/0012](../../../drizzle/0012_income_transactions.sql)
- pg_cron 既有 cleanup job：[drizzle/0001](../../../drizzle/0001_pg_cron_cleanup.sql)
- IncomeSheet 元件：[app/(dashboard)/dashboard/_components/IncomeSheet.tsx](../../../app/%28dashboard%29/dashboard/_components/IncomeSheet.tsx)
- RealtimeProvider：[app/(dashboard)/_components/RealtimeProvider.tsx](../../../app/%28dashboard%29/_components/RealtimeProvider.tsx)
- 設計原則：[CLAUDE.md](../../../CLAUDE.md) → 設計原則
