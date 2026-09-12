---
last_updated: 2026-09-12
status: planned
related_specs: [solo-mode, trip-multi-currency, epoch-readonly, invite-existing-group, transactions]
depends_on: [solo-mode, trip-multi-currency]
related_issues: ["#1030", "#1033"]
---

# Solo × 旅行 — 當帳本裡出現不是伴侶的人

> [solo-mode](solo-mode-design.md) 寫於 v0.2.0，那時帳本裡只可能有兩種人：我，和對方。
> 出團旅行（v1.6）第一次引入第三種人：**既不是我、也不是伴侶的人**。
> 這份 spec 回答 solo 在那個世界裡是什麼。

---

## 背景與動機

[solo-mode](solo-mode-design.md) 的 `related_specs` 是 `[onboarding, transactions, recurring]`，沒有 trip。它的 edge case 表涵蓋「升雙人後又離開」，但沒有任何一格提到出團。那份 spec 不是寫錯，是它成文時旅行還不存在。

現在有三件事同時指向同一個缺口：

1. **v1.6 出團多人旅行**要讓使用者跟朋友分帳。朋友不是伴侶。
2. **#1030** 揭露 balance 公式沒有 epoch 範圍，而目前唯一遮住後果的是 solo 的短路。
3. **security-reviewer 在 #1031 / #1032 的調查中指出** `member_b IS NULL` 帶著兩個不同語意，而那是漏洞「可達且永久」的原因。

三件事的共同根源是同一個假設：**帳本裡的人數恰好是一或二，而「一」是「二」的缺席。** 出團讓這個假設第一次失效。

### 誰會踩到

- 還沒邀請伴侶、但想先跟朋友出去玩分帳的人（onboarding「稍後再邀請」之後的主要人口）
- 分手後回到 solo、但社交生活繼續的人
- 有伴侶但這趟旅行伴侶沒去的人（此時 group 是 duo，但 trip 的參與者不是那兩個人）

第三種最容易被忽略：**出團不是 solo 專屬情境**。duo group 一樣會有「我跟同事出差、伴侶沒去」的 trip。所以這份 spec 的結論不能只寫在 solo 分支裡。

---

## 這份 spec 回答什麼

- 共旅者在資料模型裡是什麼（以及 v1.6 → v1.7 怎麼升級）
- solo 使用者墊的錢存在哪裡，以及為什麼不是 `GroupBalance.balance`
- `member_b IS NULL` 的雙重語意怎麼拆
- solo × trip × epoch 的狀態機

## 這份 spec 不回答什麼

- 多人 trip 的 UI 與分帳互動細節（v1.6 實作時另立）
- 揪團擴散的獲客設計（v1.7，見 milestone 60）
- #1030 的修法（那是 balance 公式的實作決定，spec 只定語意）

---

## Locked decisions

### 1. 共旅者分兩階段，但 schema 從第一天就為升級留路

| 階段 | 共旅者是什麼 | 能做什麼 | 不能做什麼 |
|---|---|---|---|
| v1.6 | **名字**（字串標籤，不是 `Profiles`） | 被指派為某筆 trip 支出的分攤對象、出現在 trip 結算摘要 | 登入、收通知、看到自己欠多少 |
| v1.7 | **使用者**（真的 `Profiles` row） | 以上全部，加上看見這段 trip 的帳、看見自己欠多少 | 碰主帳本 |

**為什麼分兩階段**：v1.6 的目的是讓功能會動並驗證有沒有人要用；v1.7 的目的是擴散獲客。把「共旅者要有帳號」當 v1.6 前提，等於在驗證需求之前先要求朋友註冊，那會殺掉 v1.6 自己。

**硬約束**：v1.6 的「名字」**不得**實作成 `TripExpenses` 上的一個字串欄位。共旅者必須從第一天就是一個獨立的 entity（有自己的 id），只是暫時沒有對應的 `Profiles`。理由是 v1.7 的升級必須是「把既有共旅者接上一個帳號」，而不是「把字串資料遷移成 row」。後者在有歷史資料的情況下是有損的：同名的兩個人無法區分，改過名的人會斷開。

**共旅者永遠是 trip-scoped**，不是 group-scoped。跨 trip 的「同一個朋友」在 v1.6 不保證被識別為同一人。這是刻意的：group-scoped 的朋友清單是通訊錄，那是另一個產品。

### 2. 共旅者的債不進 `GroupBalance.balance`

**`GroupBalance.balance` 是一個帶符號的純量，語意恰好是「member_b 欠 member_a 多少」**（正負定義見 `lib/db/schema.ts` 與 [transactions](transactions-design.md)）。一個數字只能表達兩個人之間的一個方向。它結構上無法承載「阿傑欠我 300、小美欠我 500」。

所以共旅者的債需要自己的表達方式，活在 trip 的層級。主帳本的 balance 繼續只講伴侶之間的事。

**這條決定修正了一個容易產生的誤解**：拿掉 solo 的短路（見下）**不會**讓 solo 使用者看到「有人欠我」。乾淨的 solo group 裡所有 row 都是 `all_mine`，公式算出來本來就是 0。短路唯一遮住的是離開伴侶後留下的殘值。兩件事都要做，但它們解決的是不同問題：

| | 解決什麼 | 屬於 |
|---|---|---|
| 拿掉短路（+ epoch 範圍） | 正確性：不要顯示幻影餘額 | #1030 |
| 共旅者的債另立表達 | 功能：solo 出團看得到誰欠我 | v1.6 |

### 3. Dashboard 分開呈現「對方欠我」與「外人欠我」

兩者語意不同，不該擠進同一個數字。

- **伴侶之間**：既有的 balance hero。solo 時沒有伴侶，所以沒有這一塊（維持 [solo-mode](solo-mode-design.md) 的既有決定）。
- **旅行中未結清**：只在有未結清 trip 時出現，結清後消失。不是常駐指標。

**不做總和。** 把兩者相加會產生一個沒有任何人欠得起的數字，也違反[不評判](../../../PRODUCT.md)的立場：常駐的「別人欠你 2400」是一種催促。

### 4. 拆開 `member_b IS NULL` 的雙重語意

目前 `member_b IS NULL` 同時表示兩件事：

- 「這是一本單人帳本」（狀態）
- 「這個位子空著，歡迎任何持有邀請的人進來」（權限）

security-reviewer 指出後者是 #1031 / #1032 可達且永久的原因：**每一個分手後的 group 都無限期停在「accept 路徑視為可加入」的狀態，而擁有者無法關門。**

**決定：狀態與權限分離。** 「是不是單人帳本」繼續由 `member_b IS NULL` 推導；「要不要接受新伴侶」成為一個擁有者可控的獨立旗標，預設關閉。

語意後果，逐條對照 [PRODUCT.md](../../../PRODUCT.md) 的立場：

- **預設關閉不是「拒絕伴侶」，是「沒有門是一直開著的」。** solo 是完整狀態，完整狀態不需要一個永遠敞開的入口。
- 使用者想邀請時就開門，這個動作已經存在（產生邀請連結）。**開門與發邀請是同一個動作**，不是新的設定項。
- 分手後的 group 自動關門。這同時修掉 #1031 / #1032 的可達性，以及「前任無限期保有入口」這件事本身的不安感。

> 實際欄位命名與 migration 不在此決定（schema 真相在 `lib/db/schema.ts`）。security-reviewer 建議過 `member_b_slot_open boolean`，可行但不是唯一解。

### 5. 順序：epoch 範圍 → 拿掉短路 → 出團

**不可顛倒。** `member_b IS NULL → 0` 的短路是目前唯一遮住 #1030 幻影餘額的東西。先拿掉短路而不先做 epoch 範圍，會把一個目前 prod 暴露為 0 的前瞻性缺陷，變成立即可見的錯誤金額。

#1030 也必須先回答一個這份 spec 交給它的語意問題：**跨章節的 balance 該是「當前章節」還是「全時間」。** `/records`、stats、dashboard 預設都只看當前章節（見 [epoch-readonly](epoch-readonly-design.md)），balance 目前是唯一不一致的。這份 spec 的立場是**當前章節**，理由是 balance 回答的是「我們現在之間怎麼樣」，而章節的定義就是一段關係。

---

## 不採用

| 方案 | 為什麼不 |
|---|---|
| 出團時把 group 臨時變成多人 | `OikosGroups` 固定兩人是整個產品的地基（balance、月結、伴侶問答、swap 全部依賴它）。為了一趟旅行鬆動它，代價是全部重寫 |
| 共旅者做成 group-scoped 的朋友清單 | 那是通訊錄，不是記帳。也會讓「刪掉朋友」變成一個有歷史資料後果的危險操作 |
| solo 出團的債折進主帳本 balance | 見 Locked decision 2：balance 是兩人之間的帶符號純量，塞不進 n 人 |
| 讓 trip 可以跨 epoch，好讓伴侶中途離開不卡住 | `Trips.epoch_id` notNull 是刻意的。旅行屬於一段關係裡的一次共同經歷；讓它跨越分手，等於宣稱那次旅行不屬於任何一段關係 |
| 用「已離開的夥伴」的既有匿名化機制表達共旅者 | 那個機制是為[帳號刪除](account-deletion-design.md)設計的墓碑，語意是「曾經在這裡的人不見了」，不是「這個人從來不是成員」 |
| v1.6 就要求共旅者註冊 | 在驗證需求之前先要求朋友註冊，會殺掉 v1.6 自己。見 Locked decision 1 |

---

## 狀態機：solo × trip × epoch

### 既有的、確認為正確的行為

- solo group **可以**建立 trip，沒有 guard（`actions/trip.ts`）
- solo trip 結束時折回主帳本一筆 `all_mine` 的 summary `CashTransaction`（`lib/tripSummary.ts` 的 `memberB != null` 分支跳過對方那筆）
- `leaveGroup` 在當前 epoch 有 active trip 時 reject「請先結束旅行」（`actions/membership.ts`）。**這道柵欄防止 epoch 關閉時留下孤兒 trip，要保留**
- `confirmSwap` 不動 epoch；`acceptInvite` 與 `leaveGroup` 才關舊開新

### 這份 spec 新增要回答的

| 情境 | 行為 | 為什麼 |
|---|---|---|
| solo 期間開 trip，中途伴侶加入 | trip 留在舊 epoch，維持 solo 語意直到結束；新伴侶看得到但不被自動算入分攤 | 與 [solo-mode](solo-mode-design.md)「升雙人不 retroactive」一致 |
| duo 期間開 trip，伴侶想離開 | 維持現行 reject。訊息要說明「結束旅行」是什麼意思，不只是擋下 | 孤兒 trip 的柵欄 |
| 移除伴侶（#1033）時有 active trip | 同樣 reject。移除與離開在這件事上對稱 | 兩者都會關閉 epoch |
| 移除伴侶後回到 solo | 關舊開新 epoch，與 `leaveGroup` 對稱；門自動關上（Locked decision 4） | #1033 明寫等這份 spec 定案 |
| 共旅者在 trip 結束後 | 保留在該 trip 的歷史裡，不進入任何 group-level 清單 | trip-scoped，見 Locked decision 1 |
| duo group 的 trip 只有一人參加 | 允許。trip 的參與者與 group 的成員是兩個獨立概念 | 出團不是 solo 專屬情境 |

---

## 前置條件

這份 spec 的實作**不能在 #1030 之前開始**。依序：

1. **#1030** — balance 公式與 pending delta 加 epoch 範圍，並依 Locked decision 5 採「當前章節」語意
2. **拿掉 `member_b IS NULL → 0` 短路** — #1030 完成後才安全
3. **#1033** — remove-partner，依 Locked decision 4 的關門語意
4. **v1.6 出團** — 共旅者 entity + trip-level 債務表達

#1031 / #1032（授權修補）與上列平行，不互相阻擋。

> balance 是核心正確性。#1030 與短路移除完成後，必須跑獨立的 post-implementation 驗證，不以測試通過代替。

---

## Acceptance criteria

- solo 使用者可以建立 trip、加入共旅者（以名字）、記錄支出並指定分攤對象
- solo 使用者在 trip 未結清時看得到「誰欠我多少」，逐人呈現，不是一個總和數字
- trip 結清後該呈現消失，不留常駐指標
- solo 使用者的 dashboard 主 balance 區域維持 [solo-mode](solo-mode-design.md) 的既有行為（不顯示 balance hero）
- duo group 一樣可以建立只有一人參加的 trip
- 伴侶加入後，solo 期間的 trip 與其共旅者不被 retroactive 改變
- 當前 epoch 有 active trip 時，`leaveGroup` 與 remove-partner 都 reject，訊息說明下一步
- 分手（離開或被移除）後的 group 不接受新的邀請接受，直到擁有者主動開門
- 擁有者產生邀請連結的動作同時開門，不需要額外的設定步驟
- 移除短路後，既有 solo group 的 balance 不會憑空出現數字
- v1.7 把共旅者接上帳號時，v1.6 期間建立的共旅者不需要資料遷移即可升級
