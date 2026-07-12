---
last_updated: 2026-05-13
status: shipped
first_shipped_in: v0.2.0
related_specs: [onboarding, transactions, recurring]
related_issues: []
---

# Solo Mode — 單人帳本模式

> `OikosGroups.member_b IS NULL` 的狀態：使用者已建立帳本但還沒邀請對方（或邀請被跳過）。
> 不是「閹割版」，是完整的單人使用體驗。

---

## 背景與動機

Phase 1 假設使用者一定是雙人組合，但 friend test 階段發現大量「想先自己用看看」的場景。Solo Mode 是 [onboarding](onboarding-design.md) 第三步「稍後再邀請 →」之後掉進去的狀態，也可能是「邀請發出但對方還沒接受」的等待期。

設計原則：

- **Solo 不是缺陷**：所有 UI 都看起來像「為一個人設計的」，不是「雙人版扣掉一半」
- **升雙人零摩擦**：對方接受邀請後立刻可用，不需要 retroactive 處理舊紀錄
- **資料語意一致**：Solo 期間記的所有 transaction 一律 `split_type = 'all_mine'`，語意為「自己的費用」

---

## Locked decisions

| Surface | Solo 狀態行為 | 為什麼 |
|---|---|---|
| 新增交易 AddSheet | 分攤選項全部隱藏，固定 `split_type = 'all_mine'`；PayerToggle 隱藏 | 沒有「對方」可以分；隱藏比 disable 乾淨 |
| Dashboard BalanceHero | 不顯示；改顯示邀請 banner（「邀請對方 →」） | 沒有 partner 沒有欠款；banner 留邀請出口 |
| 結算（Settlement） | 入口完全隱藏 | 同上 |
| Records 列表 | 正常運作；row 不顯示「我」/「對方」 labels | 一個人的視角，labels 是多餘 |
| 愛物 | 完全正常 | Asset 是 group-level entity，solo / 雙人行為一致 |
| 設定 | 正常；多一個邀請 banner | — |
| Recurring 規則 | 正常建立；`paid_by` 鎖本人、`split_type` 鎖 `all_mine`，picker 隱藏 | 與 AddSheet Solo Mode 行為對稱 |
| Income / 進帳 | 正常；recipient 自動填本人 | 進帳本來就單人視角 |
| Insurance / 保險 | 正常 | — |
| Cloud invoice 匯入 | paidBy = credential.userId（本人）；splitType 預設 `all_mine` | 雙人模式各嗶各的；solo 一人嗶自己的 |
| Monthly Review | 一筆 message（不是兩筆）；UI 文案改「給下個月的我」；卡片計算不限 split_type | 沒有對方可以對話 |

### 不採用

- ❌ **隱藏整個 dashboard 改顯示「找對方來」說明頁**：踢掉想單人用的人，違反「Solo 不是缺陷」
- ❌ **Solo 時不能新增 transaction（強迫先邀請）**：違反「低門檻進入」原則；60 秒第一筆比邀請優先
- ❌ **Solo 期間紀錄打標記，升雙人後問「這些要分攤嗎？」**：複雜度高、回溯改變財務資料風險大、違背「記了就是記了」
- ❌ **Solo Mode 用不同 brand 色**（淡化 mint accent）：分裂視覺，沒必要

---

## 升雙人轉換

當 `OikosGroups.member_b` 從 `NULL` 變成 partner user_id（partner 接受邀請）：

1. [realtime](realtime-design.md) 訂閱 `OikosGroups` UPDATE event 觸發
2. Event bus 廣播：
   - Solo banner 消失
   - BalanceHero 出現（初始 balance = 0）
   - AddSheet 分攤選項解鎖
   - PayerToggle 出現
   - 結算入口出現
   - Records row 開始顯示「我」/「對方」labels
3. **Solo 期間舊紀錄不動**：保持 `split_type = 'all_mine'`，不溯及改變
4. 升雙人後新紀錄走正常雙人流程

語意：「Solo 期間的紀錄是我自己的事」是一致的；對方加入後也不會被誤算成「對方欠我」。

---

## Solo → 雙人轉換的 edge cases

| 情境 | 行為 |
|---|---|
| Solo 期間建立的 recurring rule（rule 鎖 `all_mine`） | 不自動轉成 `half`；用戶想分攤要手動編輯 rule，改 `split_type` |
| Solo 期間記的 transaction | 一律 `all_mine`；對方加入後既有 row 不變 |
| Solo 期間 partner 加入但 group_b 寫入失敗（race） | 升雙人 broadcast 不觸發；下次 router refresh 看到 |
| 升雙人後 partner 又離開（leave group） | `member_b` 變 null + 開新 epoch；新 epoch 是另一個 solo（或 sololike）狀態，但有歷史章節（見 [epoch-readonly](epoch-readonly-design.md)） |

---

## 實作落地點

`app/(dashboard)/_components/MemberContext.tsx`（`isSolo` flag 由 layout 派生）/ `app/(dashboard)/dashboard/_components/SoloBanner.tsx`（邀請 banner）/ AddSheet / IncomeSheet / RecurringRuleSheet 內部以 `isSolo` 條件式渲染。

---

## Acceptance criteria

- Solo 使用者進 dashboard 看到 SoloBanner（邀請對方），不看到 BalanceHero
- Solo 使用者新增 transaction → 分攤 UI 不顯示；DB 寫入 `split_type = 'all_mine'`
- Solo 使用者建立 recurring rule → PayerToggle / SplitTypeSelector 不顯示；DB 寫入 `paid_by = 本人 + split_type = 'all_mine'`
- Partner 接受邀請 → A 端 realtime 即時升雙人（無須刷新）：banner 消失、BalanceHero 出現、AddSheet 分攤選項出現
- 升雙人後 Solo 期間舊紀錄保留 `split_type = 'all_mine'`，**不溯及改變**
- 升雙人後 Solo 期間建立的 recurring rule 仍鎖 `all_mine`，用戶可手動編輯改 split
- 升雙人後又 leave → 開新 epoch，舊歷史在 past-times 可瀏覽（read-only）
