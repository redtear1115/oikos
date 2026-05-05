# Phase 2 · 資產系統 — 設計 handoff bundle 索引

> 用途：指出設計檔案實際位置 + 內容速查，讓後續實作 session 能快速找到並讀對東西。
> 來源：Claude Design (claude.ai/design) export，2026-05-05 由使用者 fetch 下來。

---

## Bundle 位置

`.claude/phase2-design/`（與 `.claude/incomesheet-design/` 平行；兩者都是 Claude Design 匯出包）

```
.claude/phase2-design/
├── README.md          ← 設計工具自帶說明，給 coding agent 看的「先讀我」
├── chats/             ← 4 份對話記錄，**設計意圖在這裡**，跳過會誤判 scope
│   ├── chat1.md       (1545 行，主要迭代過程)
│   ├── chat2.md       (280 行)
│   ├── chat3.md       (456 行)
│   └── chat4.md       (254 行，含視覺決策收斂：line mark / inline picker / 56px hero / etc.)
└── project/           ← HTML prototype + jsx 元件
    ├── Phase 2 · 資產系統.html   ← **本 phase 的主畫布**
    ├── asset-marks.jsx / asset-marks-v2.jsx   ← 4 種類型 marks 三種 style 探索
    ├── asset-picker.jsx                       ← AddSheet 用的關聯資產 picker（3 種版型）
    ├── asset-list.jsx                         ← /assets 列表容器
    ├── asset-extras.jsx                       ← 空狀態、light-dot 點陣
    ├── asset-data.jsx                         ← seed data（2 車、11 險、1 孩、1 屋 + fuel logs）
    ├── assets-canvas.jsx / app2.jsx           ← 設計 canvas + tweaks 面板
    ├── car-screens.jsx                        ← 車列表 / 車詳細 hero / timeline
    ├── car-forms.jsx                          ← FuelLog 表單 + NewCarForm（含 color picker）
    └── …其他 Phase 1 沿用的檔案（dashboard/income-sheet/brand 等）
```

---

## 怎麼讀（給下次的 agent）

1. **先讀 `.claude/phase2-design/README.md`** — 設計工具自帶說明，定義「coding agent 要做什麼」。
2. **再讀四份 chats** — 設計意圖在這裡，HTML 只是輸出。chat4 收斂了視覺決策。
3. **`Phase 2 · 資產系統.html` 是入口**，從中找它 import 的 jsx，逐一打開。
4. **不要直接 render HTML 截圖**（README 明確說明）；尺寸/色票/排版規則都寫在 source 裡。
5. **記得**：mockups 是視覺 source of truth（user 有設計合作夥伴，視覺決策由 mockup 定）。

---

## Bundle 內容 vs. codebase 現況對照

### 已實作（Slice 1 — 見 [2026-05-04-phase-2-slice-1-car-asset-design.md](2026-05-04-phase-2-slice-1-car-asset-design.md)）

- `/assets` 列表頁、`/assets/[id]` 詳細頁
- `AssetIcon`（只有車的 placeholder）、`AssetListItem`、`AssetEmptyState`、`AssetSheet`、`AssetPickerSheet`、`AssetHero`
- `actions/asset.ts`、`lib/db/queries/asset.ts`
- `Assets` + `CarDetails` table、realtime 訂閱、AddSheet `assetId` 欄位

### Bundle 涵蓋但尚未實作（Slice 2+ 候選）

| 設計項目 | 對應檔案 | 狀態 |
|---|---|---|
| Asset marks 系統（line/glyph/badge × 車/屋/孩/險） | `asset-marks.jsx`, `asset-marks-v2.jsx` | 目前只有車的 placeholder SVG |
| Car 詳細頁 hero 用 `car.color` 上色（5 色預設） | `car-screens.jsx` | `carDetails` 沒 color 欄位 |
| 三欄統計（平均油耗 / 本月 / 累計） | `car-screens.jsx` | 目前只有月/累計 |
| FuelLog 加油記錄（油量/里程/金額/站名/付款人 + auto km/L） | `car-forms.jsx`, `asset-data.jsx` | 完全未實作；schema 待決（獨立 table vs. transaction kind） |
| NewCarForm 擴充欄位（brand/model/year/color picker） | `car-forms.jsx` | 目前只有 name/plate/purchasedAt/purchasePrice |
| AssetPickerSheet 視覺分組（inline / two-column / sectioned） | `asset-picker.jsx` | 目前 flat list；chat4 推薦 inline |
| 其他資產類型 UI（house / child / insurance） | `asset-list.jsx`, `asset-extras.jsx` | Phase 2 Slice 1 spec 已標 out-of-scope，留待後續 slice |

---

## 與既有 spec 的關係

- [2026-05-04-phase-2-slice-1-car-asset-design.md](2026-05-04-phase-2-slice-1-car-asset-design.md) — 已 ship，本 bundle 提供其視覺收斂版本（部分視覺尚未對齊，尤其 marks/hero color）
- Slice 2（FuelLog）尚無 spec — 寫 spec 時請以本 bundle 的 `car-forms.jsx` + `asset-data.jsx` 為視覺/資料模型起點
- 後續 slices（孩子 / 房子 / 保險）— 本 bundle 的 marks + extras 已給設計參考

---

## 待 user 決定（已收 user 回覆「不需要實作」，下次開工再問）

從 bundle 對比 codebase 抓到的 open questions（保留以免下次重做）：

1. FuelLog 怎麼存 — 獨立 `fuelLogs` 表 vs. transactions 加 `kind: 'fuel'` + payload？
2. `car.color` — 加 column 到 `carDetails`（enum 5 色）？
3. AssetPicker 版型 — inline / two-column / sectioned 挑哪個？（chat4 偏 inline）
4. 其他資產類型在哪個 slice 進場？
5. NewCarForm 的 brand / model / year 必填或選填？
