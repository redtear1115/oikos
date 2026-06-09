---
status: planned
related_specs: [native-auth, epoch-readonly, onboarding]
related_issues: ["#912"]
---

# 邀請接受 × 既有 group（membership guard）

> **為什麼做：** 接受邀請的流程目前只檢查邀請本身與目標 group，**不看接受者自己有沒有 group**。結果：已在「雙人」group 的人接受邀請會進入「同時在兩個 group」的不一致狀態；已在「單人」group 的人會被默默切換、不知道自己的舊帳本去哪了。違反「固定兩人」模型與「陪伴／透明」的產品立場。

---

## What

接受邀請時，依**接受者目前的 group 狀態**分三種對待。在 **preview（UI 先呈現）** 與 **accept（server 強制）** 兩層都處理：

| 接受者狀態 | 行為 |
|---|---|
| 沒有 group | 照舊，正常接受 |
| **單人 group** | 可接受；接受頁顯示一句溫和說明：舊的單人帳本會成為一段過去的紀錄，仍可在「過去時光」回顧。**不**多一步確認 |
| **雙人 group** | 擋下；顯示「你已經和 {對方} 共用一本帳本，要先離開才能加入新的」，**不放任何 CTA** |

## Who

- 收到朋友／伴侶邀請連結、但帳號上**已經有帳本**的既有使用者。
- 邊界情境，但真實：一個單人使用者被邀去對方的帳本；或一個已在雙人關係裡的人誤點了第三方連結。

## 設計決策（locked）

### 1. 單人切換是允許的，靠 epoch 保資料

產品已有 episode（epoch）機制：`acceptInvite` 在單人接受者加入時，會關掉其舊單人 group 的 open epoch（變成過去章節、資料完整保留），並在新 group 開 duo epoch。本案**不改這段 server 行為**，只**補上接受前的告知**——讓使用者知道接下來會發生什麼，符合「安靜的邀請 / 透明」。

選 inline 說明（A），不選額外確認步驟（B）：避免在「安靜的邀請」語氣裡插入一道摩擦門。

### 2. 雙人一律擋，不提供一鍵出路

「固定兩人」模型下，一個人同時只該屬於一本共用帳本。已在雙人 group 的人接受新邀請，會破壞此不變量，故**擋下**。

擋下時**只說明、不放 CTA**：離開帳本是重大且不可逆的關係動作（會結束章節），不該做成邀請頁上的一鍵按鈕——使用者可能只是好奇點了連結。要離開，讓他慎重地走設定流程。

「允許雙人切換」（reverse 的 leaveGroup + 資料搬遷）**不在本案範圍**；若日後有真實需求再獨立設計。

### 3. 兩層防護

- **preview 層**：先在接受頁把狀態呈現好（單人＝顯示說明、雙人＝顯示擋下訊息、無 group＝正常）。這是 UX，不是安全邊界。
- **accept 層**：`acceptInvite` 在 server 端硬擋雙人（不能只靠 UI），即使有人繞過前端也不會產生雙重 group。

## 文案立場

- 不焦慮：單人說明用「成為過去的紀錄、仍可回顧」，不用「失去／刪除／封存」。
- 雙人訊息中性陳述事實，不催促、不指責。
- 不預設性別：用對方的 displayName 套入 `{對方}`，撈不到時 fallback「對方」。
- 4 語同步（zh-TW / zh-CN / en / ja）。

## Acceptance criteria

- **無 group**：接受流程與現況完全一致。
- **單人**：接受頁出現溫和說明；按接受後正常加入新 group，舊單人 group 變成可在「過去時光」看到的過去章節（epoch 已關），資料不遺失。
- **雙人**：接受頁顯示「你已經和 {對方} 共用一本帳本，要先離開才能加入新的」、沒有接受鈕；即使直接呼叫 `acceptInvite` 也被 server 擋下，不會建立雙重 group / 不污染原本的雙人 group。
- 文案 4 語齊。

## 實作落地點（ref，非實作細節）

- 驗證邏輯 → `lib/invite.ts` `validateInviteAcceptance`（加入「接受者目前 active group」判斷，新增 `already_in_duo` error code；單人非錯誤、照回 ok）
- server action → `actions/invite.ts`：`previewInvite`（回傳多帶 `hasSoloLedger` 與 duo 擋下時的 `partnerName`）、`acceptInvite`（同樣把 active group 餵進 validator，server 硬擋雙人）
- 接受頁 → `app/invite/[token]/page.tsx`（`errorMap` 加 `already_in_duo`，用 `partnerName` 套文案）＋ `InviteConfirm.tsx`（`hasSoloLedger` 時顯示說明）
- 接受者目前 group → 既有 `getActiveGroupForUser`（`lib/db/queries/group.ts`）
- 文案 → `lib/i18n/locales/{zh-TW,zh-CN,en,ja}.ts` 的 `invite` 區塊
