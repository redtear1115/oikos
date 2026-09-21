---
last_updated: 2026-09-21
status: planned
related_specs: [solo-mode, trip-multi-currency, group-outing, epoch-readonly, invite-existing-group, transactions]
depends_on: [solo-mode, trip-multi-currency]
related_issues: ["#1030", "#1031", "#1033", "#1103", "#870", "#943"]
---

# Solo × 旅行 — 當帳本裡出現不是伴侶的人

> [solo-mode](solo-mode-design.md) 寫於 v0.2.0，那時帳本裡只可能有兩種人：我，和對方。
> 多人出行（v1.6）第一次引入第三種人：**既不是我、也不是伴侶的人**。
> 這份 spec 回答 solo 在那個世界裡是什麼。
>
> **2026-09-21 修正（#870）**：v1.6 的多人出行原規劃為 #870「出團」（在 Trips 裡長出多人），使用者決定改用 #943「出遊」模型（[group-outing](group-outing-design.md)）。共旅者因此落在出遊，不在 Trips。細節見 Locked decision 1 的修正紀錄；本文凡談到共旅者時的「trip」，都已改寫為「出遊」。

---

## 背景與動機

[solo-mode](solo-mode-design.md) 的 `related_specs` 是 `[onboarding, transactions, recurring]`，沒有 trip。它的 edge case 表涵蓋「升雙人後又離開」，但沒有任何一格提到多人出行。那份 spec 不是寫錯，是它成文時旅行還不存在。

現在有三件事同時指向同一個缺口：

1. **v1.6 多人出行**（#943 出遊；原規劃為 #870 出團）要讓使用者跟朋友分帳。朋友不是伴侶。
2. **#1030** 揭露 balance 公式沒有 epoch 範圍，而目前唯一遮住後果的是 solo 的短路。
3. **security-reviewer 在 #1031 / #1032 的調查中指出** `member_b IS NULL` 帶著兩個不同語意，而那是漏洞「可達且永久」的原因。

三件事的共同根源是同一個假設：**帳本裡的人數恰好是一或二，而「一」是「二」的缺席。** 多人出行讓這個假設第一次失效。

### 誰會踩到

- 還沒邀請伴侶、但想先跟朋友出去玩分帳的人（onboarding「稍後再邀請」之後的主要人口）
- 分手後回到 solo、但社交生活繼續的人
- 有伴侶但這趟旅行伴侶沒去的人（此時 group 是 duo，但 trip 的參與者不是那兩個人）

第三種最容易被忽略：**多人出行不是 solo 專屬情境**。duo group 一樣會有「我跟同事出差、伴侶沒去」的出遊。所以這份 spec 的結論不能只寫在 solo 分支裡。

---

## 這份 spec 回答什麼

- 共旅者在資料模型裡是什麼（以及 v1.6 → v1.7 怎麼升級）
- solo 使用者墊的錢存在哪裡，以及為什麼不是 `GroupBalance.balance`
- `member_b IS NULL` 的雙重語意怎麼拆
- solo × trip × epoch 的狀態機

## 這份 spec 不回答什麼

- 多人出行的 UI 與分帳互動細節（見 [group-outing](group-outing-design.md)）
- 揪團擴散的獲客設計（v1.7，見 [group-outing](group-outing-design.md)）
- #1030 的修法（那是 balance 公式的實作決定，spec 只定語意）

---

## Locked decisions

### 1. 共旅者分兩階段，但 schema 從第一天就為升級留路

> **修正紀錄（2026-09-21，#870）**：本條原本假設共旅者長在 Trips 裡（「trip 支出的分攤對象」「不得是 `TripExpenses` 上的字串欄位」「trip-scoped」）。使用者決定 v1.6 改做 #943 出遊，**共旅者的 entity 落在出遊的 `OutingParticipant`，不在 Trips**。旅行本身維持夫妻兩人的帳，沒有第三人。
>
> 撤回的只有「在哪裡」，決定本身不變：兩階段（v1.6 名字 → v1.7 使用者）照舊，「從第一天就是獨立 entity、之後接上帳號不需遷移」的硬約束也照舊——`OutingParticipant` 與 `Profile` 解耦、`profile_id` 可為空、認領時才填，正是這條約束的形狀。
>
> 容易重新推導出錯的地方：看到「旅行要支援多人」就想擴充 `TripExpenses`（二元 `split_type`、`paid_by` 必須是 `Profiles`）。[group-outing](group-outing-design.md)「為什麼獨立成新子系統」說明了為什麼不這樣做。

| 階段 | 共旅者是什麼 | 能做什麼 | 不能做什麼 |
|---|---|---|---|
| v1.6 | **名字**（字串標籤，不是 `Profiles`） | 被指派為某筆出遊支出的分攤對象、出現在出遊的淨額與轉帳建議裡 | 登入、收通知、看到自己欠多少 |
| v1.7 | **使用者**（真的 `Profiles` row） | 以上全部，加上看見這場出遊的帳、看見自己欠多少 | 碰主帳本 |

**為什麼分兩階段**：v1.6 的目的是讓功能會動並驗證有沒有人要用；v1.7 的目的是擴散獲客。把「共旅者要有帳號」當 v1.6 前提，等於在驗證需求之前先要求朋友註冊，那會殺掉 v1.6 自己。

**硬約束**：v1.6 的「名字」**不得**實作成支出上的一個字串欄位（原文寫 `TripExpenses`；現由出遊的 `OutingParticipant` 滿足）。共旅者必須從第一天就是一個獨立的 entity（有自己的 id），只是暫時沒有對應的 `Profiles`。理由是 v1.7 的升級必須是「把既有共旅者接上一個帳號」，而不是「把字串資料遷移成 row」。後者在有歷史資料的情況下是有損的：同名的兩個人無法區分，改過名的人會斷開。

**共旅者永遠是出遊範圍內的**（原文寫 trip-scoped），不是 group-scoped。跨出遊的「同一個朋友」在 v1.6 不保證被識別為同一人。這是刻意的：group-scoped 的朋友清單是通訊錄，那是另一個產品。

### 2. 共旅者的債不進 `GroupBalance.balance`

**`GroupBalance.balance` 是一個帶符號的純量，只能表達伴侶兩人之間的一個方向**（正負號語意的權威在 `lib/balance.ts › transactionDelta()` 上方的 docstring；另見 [transactions](transactions-design.md)）。它結構上無法承載「阿傑欠我 300、小美欠我 500」。

所以共旅者的債需要自己的表達方式，活在出遊的層級。主帳本的 balance 繼續只講伴侶之間的事。

**這條決定修正了一個容易產生的誤解**：拿掉 solo 的短路（見下）**不會**讓 solo 使用者看到「有人欠我」。乾淨的 solo group 裡所有 row 都是 `all_mine`，公式算出來本來就是 0。短路唯一遮住的是離開伴侶後留下的殘值。兩件事都要做，但它們解決的是不同問題：

| | 解決什麼 | 屬於 |
|---|---|---|
| 拿掉短路（+ epoch 範圍） | 正確性：不要顯示幻影餘額 | #1030 |
| 共旅者的債另立表達 | 功能：solo 出遊看得到誰欠我 | v1.6 |

### 3. Dashboard 分開呈現「對方欠我」與「外人欠我」

兩者語意不同，不該擠進同一個數字。

- **伴侶之間**：既有的 balance hero。solo 時沒有伴侶，所以沒有這一塊（維持 [solo-mode](solo-mode-design.md) 的既有決定）。
- **旅行中未結清**：只在有未結清 trip 時出現，結清後消失。不是常駐指標。

> 2026-09-21：共旅者改落在出遊之後，這個區塊要不要套用到出遊**尚未決定**，列在 [group-outing](group-outing-design.md)「與旅行的界線」的待決定事項。

**不做總和。** 把兩者相加會產生一個沒有任何人欠得起的數字，也違反[不評判](../../../PRODUCT.md)的立場：常駐的「別人欠你 2400」是一種催促。

### 4. 拆開 `member_b IS NULL` 的雙重語意

目前 `member_b IS NULL` 同時表示兩件事：

- 「這是一本單人帳本」（狀態）
- 「這個位子空著，歡迎任何持有邀請的人進來」（權限）

security-reviewer 指出後者是 #1031 / #1032 可達且永久的原因：**每一個分手後的 group 都無限期停在「accept 路徑視為可加入」的狀態，而擁有者無法關門。**

> 可達性本身已於 v1.5.9 / v1.5.10 關掉——accept 端加了「鑄造者仍是成員」檢查（#1031，`actions/invite.ts`），`leaveGroup` 與 `removePartner` 都撤銷未接受的邀請（`actions/membership.ts`）。但**那是堵住路徑，不是拆開語意**：`member_b IS NULL` 仍然一個欄位扛兩件事，下面這條決定還沒實作。

**決定：狀態與權限分離。** 「是不是單人帳本」繼續由 `member_b IS NULL` 推導；「要不要接受新伴侶」成為一個擁有者可控的獨立旗標，預設關閉。

語意後果，逐條對照 [PRODUCT.md](../../../PRODUCT.md) 的立場：

- **預設關閉不是「拒絕伴侶」，是「沒有門是一直開著的」。** solo 是完整狀態，完整狀態不需要一個永遠敞開的入口。
- 使用者想邀請時就開門，這個動作已經存在（產生邀請連結）。**開門與發邀請是同一個動作**，不是新的設定項。
- 分手後的 group 自動關門。這同時修掉 #1031 / #1032 的可達性，以及「前任無限期保有入口」這件事本身的不安感。

> 實際欄位命名與 migration 不在此決定（schema 真相在 `lib/db/schema.ts`）。security-reviewer 建議過 `member_b_slot_open boolean`，可行但不是唯一解。

### 5. 順序：epoch 範圍 → 拿掉短路 → 多人出行

**不可顛倒。** `member_b IS NULL → 0` 的短路是目前唯一遮住 #1030 幻影餘額的東西。先拿掉短路而不先做 epoch 範圍，會把一個目前 prod 暴露為 0 的前瞻性缺陷，變成立即可見的錯誤金額。

#1030 也必須先回答一個這份 spec 交給它的語意問題：**跨章節的 balance 該是「當前章節」還是「全時間」。**

**立場：當前章節。**

表面理由是一致性——`/records`、stats、dashboard 預設都只看當前章節，balance 目前是唯一不一致的。但真正的理由更硬：**過去章節是凍結的歷史，在那裡不能有任何動作。**[epoch-readonly](epoch-readonly-design.md) 已經把這件事做成結構性保證，所有 transaction-class 寫入都擋在當前 epoch 之內。

所以一個含跨章節的 balance，會顯示一個**使用者無法對它做任何事**的欠款：不能結算（結算是寫入，落在當前章節）、不能編輯那些 row、不能讓它歸零。那不只是語意不一致，是呈現一個沒有出口的數字——而一個無法清除的欠款提示，正是 [PRODUCT.md](../../../PRODUCT.md) 所禁止的那種焦慮來源。

balance 回答的是「我們**現在**之間怎麼樣」，而章節的定義就是一段關係。上一段關係結清與否，已經是歷史。

---

## 不採用

| 方案 | 為什麼不 |
|---|---|
| 多人出行時把 group 臨時變成多人 | `OikosGroups` 固定兩人是整個產品的地基（balance、月結、伴侶問答、swap 全部依賴它）。為了一趟旅行鬆動它，代價是全部重寫 |
| 共旅者做成 group-scoped 的朋友清單 | 那是通訊錄，不是記帳。也會讓「刪掉朋友」變成一個有歷史資料後果的危險操作 |
| solo 出遊的債折進主帳本 balance | 見 Locked decision 2：balance 是兩人之間的帶符號純量，塞不進 n 人 |
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
| 移除伴侶後回到 solo | 關舊開新 epoch，與 `leaveGroup` 對稱；門自動關上（Locked decision 4）；**並撤銷該 group 所有未接受的邀請** | #1033 明寫等這份 spec 定案。撤銷邀請不是額外要求：`leaveGroup` 已經這樣做（`actions/membership.ts`），而 #1031 的修補讓「鑄造者必須仍是成員」成為接受條件——移除伴侶若不撤銷，留守者自己鑄的舊邀請仍通過該條件，等於留一把七天有效的鑰匙 |
| 共旅者在出遊結束後 | 保留在該出遊的歷史裡，不進入任何 group-level 清單 | 出遊範圍內，見 Locked decision 1 |
| duo group 的出遊只有一位成員參加 | 允許。出遊的參與者與 group 的成員是兩個獨立概念 | 多人出行不是 solo 專屬情境 |
| 當前章節有進行中的出遊，伴侶想離開或被移除 | 與 active trip 相同：reject，訊息說明下一步 | 出遊也綁 `epoch_id`，同樣需要孤兒柵欄 |

> 兩列「移除伴侶」的行為**已於 v1.5.10 隨 #1033 實作**（`actions/membership.ts › removePartner()`：active trip 時 reject、關舊開新 epoch、撤銷未接受的邀請）。**唯一沒跟著落地的是「門自動關上」的那個旗標**——目前靠 accept 端的「鑄造者仍是成員」檢查擋住，不是靠一個擁有者可控的狀態。其餘各列或是既有行為、或仍待 v1.6 落地。

---

## 前置條件

這份 spec 的實作**不能在 #1030 之前開始**。依序：

1. ✅ **#1030** — balance 公式與 pending delta 加 epoch 範圍，並依 Locked decision 5 採「當前章節」語意。**v1.5.10 已 ship**（實作與理由見 `lib/db/queries/balance.ts` 開頭 docstring；邊界用 `created_at` 不是 `transacted_at`）
2. ⬜ **拿掉 `member_b IS NULL → 0` 短路** — #1030 完成後才安全。**尚未做**：短路仍在 `lib/db/queries/balance.ts` 的兩段 inline SQL 裡
3. ✅ **#1033** — remove-partner，依 Locked decision 4 的關門語意。**v1.5.10 已 ship**（`actions/membership.ts › removePartner()`：關舊開新 epoch、active trip 時擋下、撤銷未接受的邀請）；但 Locked decision 4 的「狀態／權限分離旗標」本身還沒進 schema
4. ⬜ **v1.6 出遊**（#943；取代 #870 出團）— 共旅者 entity（`OutingParticipant`）＋ 出遊層級的債務表達，見 [group-outing](group-outing-design.md)

#1031 / #1032（授權修補）與上列平行，不互相阻擋；兩者已於 v1.5.9 ship。

> balance 是核心正確性。#1030 與短路移除完成後，必須跑獨立的 post-implementation 驗證，不以測試通過代替。

---

## Acceptance criteria

- solo 使用者可以建立出遊、加入共旅者（以名字）、記錄支出並指定分攤對象
- solo 使用者在出遊未結清時看得到「誰欠我多少」，逐人呈現，不是一個總和數字
- 出遊結清後該呈現消失，不留常駐指標
- solo 使用者的 dashboard 主 balance 區域維持 [solo-mode](solo-mode-design.md) 的既有行為（不顯示 balance hero）
- duo group 一樣可以建立只有一位成員參加的出遊
- 伴侶加入後，solo 期間的出遊與其共旅者不被 retroactive 改變
- 當前 epoch 有 active trip 或進行中的出遊時，`leaveGroup` 與 remove-partner 都 reject，訊息說明下一步
- 分手（離開或被移除）後的 group 不接受新的邀請接受，直到擁有者主動開門
- 擁有者產生邀請連結的動作同時開門，不需要額外的設定步驟
- 移除短路後，既有 solo group 的 balance 不會憑空出現數字
- v1.7 把共旅者接上帳號時，v1.6 期間建立的共旅者不需要資料遷移即可升級
