# Oikos — Agent Guide

> 家庭記帳工具，對使用者顯示為 **Futari**；codebase 用 Oikos。
> 固定兩人（夫妻／伴侶）使用。Mobile-first PWA。

---

## ⚠️ Next.js 版本提醒

This is **Next.js 16** with breaking changes. APIs, conventions, and file structure differ from your training data. Read `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

---

## 目前狀態

**Latest released: v0.10.0**（tag on origin）— prod migration 狀態獨立追蹤。完整版本歷史見 [CHANGELOG.md](CHANGELOG.md)

| 版本 | 範圍 | 狀態 |
|---|---|---|
| v0.1.0 | 專案建置 + Auth + Group + Invite + RLS + PWA + 核心記帳（AddSheet / Settlement / Records / Realtime） | ✅ |
| v0.2.0 | Onboarding + Solo Mode + 篩選 + Settings | ✅ |
| v0.3.0 | 愛物：Car | ✅ |
| v0.4.0 | 愛物：Car FuelLog | ✅ |
| v0.5.0 | 愛物：Child / Pet / Plant | ✅ |
| v0.6.0 | 愛物：House + Insurance | ✅ |
| v0.7.0 | 進帳（Income） | ✅ |
| v0.8.0 | 自訂定期收入 Phase 1（rules + pending preview→commit） | ✅ |
| v0.8.1 | UX polish：hero card 一致性（House 入住天數、Insurance 保障剩餘）+ 愛物清單分群（財產／生命體／保障）+ editAndConfirmPending wiring | ✅ |
| v0.9.0 | 保險 SavingsView（儲蓄型雙 bar hero + maturity trigger UX）+ 保護型詳情頁 subpixel 修 + spec doc-keeper | ✅ |
| v0.10.0 | 安全修補：身分證／健保卡端到端加密 + 遮蔽（reveal server action）+ datepicker 兩級 year/month nav + 小孩暱稱優先 + 健保卡 placeholder 4-4-4 + 愛物自訂備註（Assets.notes）+ pending 指示器 + SavingsHero 微調 | ✅ |
| _Unreleased_ | Perf：pages 改 `getSession()` 跳過 Auth API HTTP 往返（PR #1）+ BottomNav 延遲 prefetch + Dashboard Suspense 邊界（PR #2） | 已 merge origin/main，待版本號 |

## Backlog

未排入版本的候選功能，優先順序待評估。

- **雲端發票匯入**（財政部 API + 手機條碼載具）— API key 無法取得，暫緩
- **小孩／寵物身高體重歷史紀錄**（append-only log + 修正 typo）— 仿 FuelLog pattern；MVP 不含成長曲線視覺化（codebase 無 chart lib）
- **定期支出**（recurring expenses）— 對應自訂定期收入的支出版本；建議與定期收入共用 pending preview→commit 架構，未排期
- **離線瀏覽**（Offline / PWA cache）— Service Worker + cache strategy，讓使用者在無網路時能瀏覽最近的記錄與首頁，未排期

---

## 架構速查

```
寫入路徑：Client → Server Action → Drizzle → Supabase Postgres
讀取路徑：Server Component → Drizzle → Postgres
Realtime：Client subscribes → React state mutation
```

- Server Actions：`actions/`
- DB queries：`lib/db/queries/`
- Validators：`lib/validators.ts`
- Realtime：`app/(dashboard)/_components/RealtimeProvider.tsx`
- Schema：`lib/db/schema.ts`
- Migrations：`drizzle/`
- Specs：`docs/superpowers/specs/`

### Balance 計算規則

- 金額單位：台幣整數（integer，無小數）
- 每次寫入後全量重算，cache 在 `GroupBalance`
- 計算實作：`lib/balance.ts` + `lib/db/queries/balance.ts`
- GroupBalance 欄位 `balance` = member_a 欠 member_b 的金額（正數 = A 欠 B，負數 = B 欠 A）

### 編輯模式

「編輯」= soft delete + insert（atomic DB transaction）。DB 層不支援 UPDATE。`deleted_at` 超過 1 年由 pg_cron 物理刪除。

---

## 常用指令

```bash
npm run dev          # 開發 server
npm run test:run     # vitest 一次性
npm run db:migrate   # apply migrations
npm run db:generate  # 從 schema 生 migration
npm run db:studio    # Drizzle Studio
```

## AI 開發協作規則

- **commit 自主**：每完成一個邏輯單位（PR / feature）即自動 commit，不必問。push 仍需要明確指令。
- **destructive ops**：動 prod 資料、force push、reset --hard 之類仍要明確確認 scope 後才執行。

---

## 規格文件位置

| 文件 | 內容 |
|---|---|
| `docs/superpowers/specs/product-design.md` | 整體架構、Tech Stack |
| `docs/superpowers/specs/transactions-design.md` | 核心記帳 UX、Onboarding、Solo Mode |
| `docs/superpowers/specs/car-fuellog-design.md` | 車輛 + FuelLog |
| `docs/superpowers/specs/aibutsu-design.md` | 愛物概念 + Child/Pet/Plant/House/Insurance |
| `docs/superpowers/specs/income-design.md` | 進帳功能設計決策 |
| `docs/superpowers/specs/insurance-design.md` | 保險 SavingsView framing |
| `docs/superpowers/specs/recurring-income-design.md` | 自訂定期收入 |
| `docs/superpowers/specs/cloud-invoice-design.md` | 雲端發票匯入（暫緩，APP_ID 卡點）|
| `CHANGELOG.md` | 版本歷史 |
