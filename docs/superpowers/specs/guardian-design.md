---
status: shipped
shipped_in: |
  v0.16.0（#220 #221 — beta flag + nav guard；#227 — GatedView for beta-off surfaces）
  v0.16.1 (#236 — 保險不再出現在愛物 TypePicker；守護 tab FAB 直開 InsuranceSheetBody)
note: 守護模組從愛物切出，作為將來付費層的 wedge。目前用 per-group beta flag 開放給朋友圈試用；單一 `canAccessGuardian(group)` 是付費層上線時唯一要改的地方。
---

# 守護（Guardian）模組設計 spec

> 目標：把 v0.15.2 內嵌在愛物頁的「守護 tab」碎片整合成完整模組概念，並接 beta gate，預備付費層 cut-over。
> 範圍：`canAccessGuardian()` 單一閘門 + per-group beta toggle + 各前後端 surface 的 guard + GatedView 替代 silent redirect。
> 不在範圍：實際付費層／訂閱 entitlement（v3.0.0+）；其他守護產品線（健康提醒、保單到期通知等）— 目前 Guardian = 保險。

---

## 背景

### 為什麼把守護當獨立模組

| 時間點 | Insurance 位置 | 主要 framing |
|---|---|---|
| v0.6.0 | BottomNav 獨立入口 | 跟車 / 子女 / 寵物 / 植物 / 房子並列的第 6 個 asset type |
| v0.8.1 | 愛物頁「保障」inline 分組 | 仍然並列，視覺上被收進愛物群組 |
| v0.15.2（#178）| 愛物頁的「守護」tab | 第一次把保險視覺切出，FAB 在守護 tab 預選 insurance |
| **v0.16.0（#220）** | **獨立 module + beta flag** | 不再是 asset 的 sub-class，是「將來付費才能用的工具」的第一張卡 |

v0.15.2 的 tab 切分驗證了「保險不該跟車房子女平起平坐」這個假設。v0.16.0 把這層 framing 推到極致：守護是一個獨立模組，未來會擴張（保單到期提醒 / 健康紀錄 / 保險諮詢...），現在以保險作為起點。

### 為什麼用 beta flag 而不是直接擋

兩個並存的需求：

1. **朋友圈試用要繼續**：v0.15.x 期間幾個朋友已經用保險功能在追自己的儲蓄險，不能因為「將來要收費」就把他們鎖在外面。
2. **付費層上線要乾淨**：v3.0.0 訂閱層上線時，gate 邏輯應該是 `hasSubscription || isBetaGrandfathered`，不是又補 N 條 `if (asset.type === 'insurance' && ...)` 散在每個 surface。

→ Per-group beta flag + 單一 helper：今天 `return group.guardianBetaEnabled`；訂閱層上線時改成 `return hasSubscription(group) || group.guardianBetaEnabled`，一檔案搞定。

---

## 設計

### Schema

`OikosGroups.guardian_beta_enabled boolean NOT NULL DEFAULT false`（migration `0036_guardian_beta_flag.sql`）。

新帳本一律 OFF。flip ON 是 group-level（不是 user-level）—— 因為兩人帳本是共識體；某一方關掉守護不能讓對方還看得到保險頁。

### Single gate

[lib/guardian.ts](../../../lib/guardian.ts) 的 `canAccessGuardian(group)`：

```ts
canAccessGuardian(group: { guardianBetaEnabled: boolean }): boolean
```

**契約**：任何 nav rendering / route guard / server action 要判斷「守護可不可用」**只能**呼叫這支。直接讀 `group.guardianBetaEnabled` 視為 lint-violation 等級的回歸。

未來 cut-over：

```ts
// v3.0.0
return hasSubscription(group) || group.guardianBetaEnabled
```

只動這一行，所有 callsite 自動受益。

### Guard surface 清單

`MemberContext.canAccessGuardian` 在 dashboard layout 派生一次，傳到所有 client surfaces，避免 hook tree 重算。

| Surface | OFF 時行為 | ON 時行為 |
|---|---|---|
| `/assets` TabBar | 不顯示「守護」tab；swipe handler 不允許切到 guardian segment | 顯示 tab + swipe |
| `?tab=guardian` URL | render `<GatedView />`（非 silent fallback 到愛物 tab）| 正常顯示守護 list |
| `AssetSheet/TypePicker` | 保險 tile 不在列表 | 保險 tile 不在列表（v0.16.1 #236）；ON 時走守護 tab FAB → AssetSheet 直接 mount `InsuranceSheetBody`，不顯示 TypePicker |
| `/assets/[id]`（insurance asset）| render `<InsuranceGatedClient />`（GatedView + BottomNav；FAB 隱藏）| 正常 detail 頁 |
| `createInsurance` server action | throw `guardian_disabled` | 通過 |
| `/records` FilterSheet「守護」sub-section | sub-section 整段不渲染 | 顯示保險 chips |
| Settings 守護（Beta）section | 永遠顯示（讓人能 flip ON） | 同左 |

### GatedView vs silent redirect（#227）

第一輪 v0.16.0 (PR #225) 的策略是 silent fallback：URL `?tab=guardian` 直接降回愛物 tab；insurance detail page server-side `redirect('/dashboard')`。

問題：

- **書籤 / 對方分享連結**：兩人帳本一邊 ON 一邊 OFF（用戶把 toggle 切過去又切回來）時，對方分享過來的 `/assets?tab=guardian` 就被 silently 吃掉，沒有任何 feedback。
- **歷史 insurance asset**：beta 關掉之後既有保單還在 DB 裡（資料保留是契約），但點進 detail 頁直接踢回 dashboard，看起來像資料消失了。

→ #227 把這兩個 surface 改成 `<GatedView />`：「守護目前是 Beta，到設定打開」+ CTA → `/settings`。資料安全感維持、用戶知道「東西還在，只是要開」。

Defence in depth：`createInsurance` server action 仍 throw，避免 client-side bypass。

### Settings UI

「守護（Beta）」section 在 Settings 頁面有獨立 section（v0.16.0 #91 settings 重組之後，這個 section 介於資料與離開帳本之間）。Toggle 是 optimistic：UI 立即 flip，背景 server action `toggleGuardianBeta(enabled)` 寫 DB，失敗 rollback。

寫操作走 `requireViewerGroup()`，只 group member 可以 flip 自己的 group。

---

## 取捨

### 為什麼不做 user-level flag

兩人共用一個 group；如果 member_a flip OFF，member_b 還看得到保險 tab，會造成「我們看到的不一樣」這種雙人帳本最忌諱的事。group-level flag 換來「兩人視野永遠一致」這個更重要的保證。

### 為什麼 GatedView 不放在 root layout 統一處理

`/assets?tab=guardian` 是 client-side tab state，`/assets/[id]` 是 server component；兩條路徑的渲染時機完全不同。統一處理會逼出抽象（HOC？middleware redirect？），不如各 surface 各自呼叫 `<GatedView />`——核心是把「該攔的點」標清楚，不是抽象一個攔截器。

### 為什麼保險不在愛物 TypePicker（即使 beta ON）

v0.16.0 第一輪把保險 tile 放在 TypePicker 的「更多」展開區（ON 時顯示）。問題：beta ON 後同時存在兩條建立保單路徑（愛物 FAB 的 TypePicker → 保險 vs 守護 tab FAB → 保險），對心智模型造成「保險到底屬於愛物還是守護」的回歸。

v0.16.1 #236 把保險從 TypePicker 完全移除，並在守護 tab FAB 開啟 AssetSheet 時跳過 TypePicker，直接 mount `InsuranceSheetBody`。守護 tab 是進入保險的唯一前門；愛物頁徹底不再 surface 保險型別，跟「守護是獨立模組」的 framing 對齊。`createInsurance` server action 仍 throw `guardian_disabled` 作為防線（不依賴 UI 完整擋住）。

### 為什麼保險不直接放進「物品」模板

v0.16.0 #222 ship 了 `'item'` template asset type，理論上保險也可以走純模板路徑。但：

- 保險有 PII 加密（被保險人身分證 / 受益人資料）—— 走 InsuranceDetails 子表才能對齊
- 儲蓄險有 SavingsView / MaturityCountdown / RecurringIncome 接入 —— 完全不適用模板
- Guardian framing 本來就是「將來會擴張」的入口；保險是第一個 product，模板化會逆向把它退化成純文字紀錄

→ 保險繼續走 `'insurance'` type + InsuranceDetails；template 路徑保留給「沒有任何後端行為」的物品。

---

## 驗收（對應 #220 #221 #227）

- [x] 新 group 預設 `guardian_beta_enabled = false`
- [x] Settings 顯示守護（Beta）toggle，flip 後 4 surface 同步顯示
- [x] OFF 時無法 create insurance asset（server action throw）
- [x] OFF 時既有 insurance asset 資料保留，detail 頁顯示 GatedView 而非 redirect
- [x] `?tab=guardian` deep link 在 OFF 時顯示 GatedView 而非靜默 fallback
- [x] 單一 `canAccessGuardian()` helper，所有 callsite 透過它判斷

---

## 後續

- **付費層 cut-over（v3.0.0+）**：把 `canAccessGuardian()` 內部改成 `hasSubscription(group) || group.guardianBetaEnabled`，beta-grandfathered 用戶不會掉。
- **多 product surface**：守護 module 將來會加保單到期通知 / 健康紀錄 / 諮詢入口等；每個新 surface 加 callsite 時 reach for `canAccessGuardian()` 不要重蹈 v0.15.x 的散落判斷。
- **Beta 期收尾**：當付費層上線且 beta 不再開放新用戶時，`guardian_beta_enabled` 可保留為 grandfather flag（不要 drop column）。
