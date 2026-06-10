---
status: planned
related_specs: [native-auth, product]
related_issues: ["#923", "#848"]
---

# Account Deletion（帳號刪除）

## 這是什麼

讓使用者**在 app 內發起刪除自己的帳號**，並由後台在承諾的期限內真正移除資料。

這是 App Store / Play Store 上架的硬性 blocker：Apple Guideline 5.1.1(v) 與 Google Play 都要求「有註冊功能就必須提供 app 內可發起的帳號刪除」。現況只有登出（`actions/auth.ts#signOut`），沒有刪除——而且隱私政策已白紙黑字承諾「可透過設定頁刪除帳號、14 個工作天內移除」（[zh-TW.ts](../../../lib/i18n/locales/zh-TW.ts) `sectionRights` / `sectionRetention`），等於目前是空頭支票。

給誰看：實作這個 feature、或日後維護刪除/匿名化邏輯的人。

## 為什麼這樣設計

### 為什麼是「請求制 + 後台處理」，不是按下去同步刪光

審核要的是 app 內能**發起**刪除，**不要求**按下當下就同步把整串共享帳本連動清乾淨。所以拆成兩段，把複雜度留在後台：

- **App 內（輕）**：標記「我要刪」+ 登出。零前置條件。
- **後台（重）**：每日 cron 在 14 天後處理，跑真正破壞性的刪除 / 匿名化。

這同時換到一個 grace period：14 天內可取消，是 Google / GitHub 等帳號刪除的標準安全網，防誤刪與惡意刪。

### 為什麼刪除入口零前置條件

刪除是 store 強制的權利，不能被「先把 balance 結清」「member_a 要先 swap」這類關卡擋住——任何障礙都可能被審核判不合格。所有前置複雜度（NOT NULL 的 member_a、未結 balance）都移到後台處理時解。

### 為什麼配對情境用「匿名化刪除者、另一半保留完整歷史」

這是兩人共享的帳本，很多交易是兩人共同的記錄；產品哲學是「陪伴 / 生命光譜 / 過去章節 read-only」。若因一方離開就掏空或摧毀另一半的記錄，違背核心立場。所以：

- 刪除者的交易 / 愛物**留在 group**，成為另一半保留的共享帳本。
- 移除刪除者真正的 PII（登入、email、provider 身分、顯示名、頭像）。
- 共享交易上的人名顯示為「已離開的夥伴」。

**不採用**的替代方案：

- *沿用 `leaveGroup` 拆分後刪掉刪除者那份* — 重用既有邏輯、代碼少，但另一半只剩自己的交易，共享歷史被掏空。與哲學衝突。
- *整個 group 一起刪* — 對另一半最傷，全部資料消失。

### 為什麼用既有 privacy 頁當 Google 的 web 刪除 URL

Google 另要求一個免登入、可達的 web 頁描述刪除途徑。現有 `/[locale]/privacy`（landing footer 連出、公開）已含刪除說明，直接拿來填 Play Console 的 deletion URL 欄位即可，**不另開頁**（YAGNI）。唯一前提：把「設定頁刪除帳號」做出來後，該段文案就從承諾變成真的。

## 設計決策（locked）

1. **請求標記**：`Profiles.deletion_requested_at`（nullable timestamptz）。`NULL` = 無待刪除；有值 = 自該時刻排程刪除。取消 = 設回 `NULL`。一 user 最多一筆待刪除，天然 idempotent，不開新表。
2. **發起 / 取消**：兩個 server action（`requestAccountDeletion` / `cancelAccountDeletion`），solo 與配對通用，無前置條件。發起後登出。
3. **設定頁入口**：`LogoutButton` 區附近一個「刪除帳號」入口 + ConfirmModal（說明 14 個工作天內移除、期限內可取消）。
4. **Grace banner**：dashboard 偵測到 viewer 有 `deletion_requested_at` → 常駐、**非阻斷式** banner，顯示移除日期 + 取消鈕。符合「燈 / 陪伴、不挾持」調性，可照常使用到被處理為止。
5. **處理期限**：後台處理 `deletion_requested_at < now() − 14 日曆天`。14 日曆天 ≤「14 工作天」承諾上界，所以一定不跳票；同時即為取消窗口。
6. **後台執行**：Edge Function + pg_cron 每日跑，比照既有 cron（定期收支 / 月度回顧 / soft-delete 物理刪除）。**兩個 Supabase project（prod + dev）都要部署**。也可手動觸發。
7. **Solo group 處理**：整個 group 連同所有子資料 hard delete → 刪 `Profiles` → 刪 `auth.users`。
8. **配對 group 處理（匿名化）**：
   - 刪除者的交易 / 愛物留在 group。
   - group 轉 solo 給另一半：刪除者是 member_a → 另一半從 B 升 A，並比照 `confirmSwap` 翻轉 `split_ratio_a` / `default_split_ratio_a` 並 recalc balance；刪除者是 member_b → 直接 `member_b = NULL`。
   - 關閉雙人 epoch、開另一半的 solo epoch、bump `current_epoch_started_at`（比照 `leaveGroup`）。
   - 刪 `auth.users`（移除登入 / email / provider 這些真正 PII），但**保留一個洗白的 `Profiles` 墓碑列**（displayName→「已離開的夥伴」、avatar→NULL），讓 `paid_by` / `recipient_id` 等 FK 仍解析得到。
   - 未結 balance 在刪除時視為勾消（因不檔 settlement）；recalc 後 solo = 0。
9. **Web 刪除 URL**：沿用 `/[locale]/privacy`，Play Console deletion URL 指向它；確保其刪除段落與實際 flow 一致（可選加 anchor 利於審核員尋找）。

## 需要先驗證的實作前提

- **`Profiles.id → auth.users(id)` 的 FK 行為**：若是 `ON DELETE CASCADE`，刪 `auth.users` 會連帶刪掉墓碑 `Profiles` 列，匿名化方案失效。實作前先查 `lib/db/schema.ts` + 對應 migration；若是 cascade，需把該 FK 改為 `SET NULL` / `RESTRICT` 或調整關聯，讓墓碑列能在 auth user 刪除後存活。
- **雙方同時待刪除**：兩人都按了刪除 → 各自到期後依序處理。先處理的一方使 group 變另一半 solo（含墓碑）；後處理另一半時 group 已是 solo → 走 solo 全刪路徑。最終整個 group 清空，收斂正確。

## Acceptance Criteria

- 設定頁有「刪除帳號」入口；按下 → ConfirmModal → 確認後登出，帳號進入待刪除狀態。
- 待刪除期間重新登入 → 看到可取消的 banner（含移除日期）；取消後帳號完全恢復如常。
- 後台處理到期的 solo 帳號 → 該 user 的 group、所有子資料、`Profiles`、`auth.users` 全數消失；無孤兒列。
- 後台處理到期的配對帳號 → 另一半登入後：自己的 group 仍在且轉為 solo、**自己與共享的交易 / 愛物歷史完整**、刪除者顯示為「已離開的夥伴」、balance 為 0；刪除者已無法登入、其 email / provider 身分 / 顯示名 / 頭像不復存在。
- 隱私政策頁可免登入到達，含與實際 flow 一致的刪除說明，足以作為 Play Console deletion URL。
- 新增文案 4 語同步（zh-TW 主稿）。

## 驗收場景

1. Solo 使用者刪除 → 14 天後資料全清，無法登入。
2. 待刪除期間取消 → 恢復如常，後台不再處理。
3. member_b 刪除 → member_a 的 group 轉 solo、歷史完整、對方成「已離開的夥伴」。
4. member_a 刪除 → member_b 升為 A、split / balance 正確翻轉、歷史完整。
5. 雙方都刪除 → 先後處理後整個 group 清空。
6. 待刪除使用者仍可照常使用 app 直到被處理（banner 常駐、非阻斷）。

## 概念連結

- 身分 / auth：[native-auth](native-auth-design.md)（`Profiles` mirror `auth.users`、刪 auth user 的服務端權限）。
- 既有的「一方離開、資料分割 + epoch 換章」語意：`actions/membership.ts#leaveGroup`（搬移式）與 `#confirmSwap`（A/B 翻轉 + balance recalc）——本 feature 的匿名化處理借用其 epoch / ratio / balance 規則，但**不搬移**資料。
- 上架脈絡：[app-store-submission-runbook](../../app-store-submission-runbook.md)（本 feature 是 iOS + Android 送審的 blocker B1）。
