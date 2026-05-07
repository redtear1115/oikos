# Oikos — Agent Guide

> 家庭記帳工具，對使用者顯示為 **Futari**；codebase 用 Oikos。
> 固定兩人（夫妻／伴侶）使用。Mobile-first PWA。

---

## ⚠️ Next.js 版本提醒

This is **Next.js 16** with breaking changes. APIs, conventions, and file structure differ from your training data. Read `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

---

## 目前狀態

**Current version: v0.8.1 in progress**（local，未 push origin / 未 migrate prod）— 完整版本歷史見 [CHANGELOG.md](CHANGELOG.md)

| 版本 | 範圍 | 狀態 |
|---|---|---|
| v0.1.0 | 專案建置 + Auth + Group + Invite + RLS + PWA + 核心記帳（AddSheet / Settlement / Records / Realtime） | ✅ |
| v0.2.0 | Onboarding + Solo Mode + 篩選 + Settings | ✅ |
| v0.3.0 | 愛物：Car | ✅ |
| v0.4.0 | 愛物：Car FuelLog | ✅ |
| v0.5.0 | 愛物：Child / Pet / Plant | ✅ |
| v0.6.0 | 愛物：House + Insurance | ✅ |
| v0.7.0 | 進帳（Income） | ✅ |
| v0.8.0 | 自訂定期收入 Phase 1（rules + pending preview→commit） | ✅ local |
| v0.8.1 | UX polish：hero card 一致性（House 入住天數、Insurance 保障剩餘）+ 愛物清單分群（財產／生命體／保障）+ editAndConfirmPending wiring | 🔨 `feat/v081-hero-polish` |
| v0.9.0 | 保險「累計繳 vs. 拿回」統計視圖 | ⬜ |

## Backlog

未排入版本的候選功能，優先順序待評估。

- **雲端發票匯入**（財政部 API + 手機條碼載具）— API key 無法取得，暫緩

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

---

## 規格文件位置

| 文件 | 內容 |
|---|---|
| `docs/superpowers/specs/0_1_0-product-design.md` | 整體架構、Tech Stack、Phase 規劃 |
| `docs/superpowers/specs/0_1_0-transactions-design.md` | 核心記帳 UX |
| `docs/superpowers/specs/0_4_0-car-fuel-log-design.md` | 車輛 + FuelLog |
| `docs/superpowers/specs/0_5_0-aibutsu-design.md` | 愛物擴展（Child/Pet/Plant/House/Insurance） |
| `docs/superpowers/specs/0_7_0-incomesheet-design.md` | 進帳功能 |
| `docs/superpowers/specs/0_7_0-insurance-detail-design.md` | 保險 savings framing 詳情頁 |
| `docs/superpowers/specs/0_8_0-recurring-income-design.md` | 自訂定期收入（v0.8.0）|
| `docs/superpowers/specs/0_9_0-cloud-invoice-design.md` | 雲端發票匯入（v0.9.0）|
| `CHANGELOG.md` | 版本歷史 |
