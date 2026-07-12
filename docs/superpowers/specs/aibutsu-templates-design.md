---
last_updated: 2026-07-13
status: shipped
first_shipped_in: v0.16.0
related_specs: [aibutsu, insurance, guardian, structured-filter]
related_issues: ["#222"]
---

# 愛物模板系統

> TypePicker 加入「物品 (item)」選項：使用者選「物品」、填名稱 + 備註就結束。
> 純文字 + 備註的輕量愛物，**不接任何後端行為**（無 FuelLog 雙寫、無 InsuranceDetails 加密、無保費 cron）。
> 將來擴充新模板（pet / child / plant 純文字版等）只需在 registry 加 key；**舊 6 種 type 完全不動**。

---

## 背景

v0.15 之前所有愛物都走「type → 子表」模型：

| Asset type | Detail subtable | SheetBody |
|---|---|---|
| `car` | `CarDetails` | `CarSheetBody` |
| `house` | `HouseDetails` | `HouseSheetBody` |
| `child` | `ChildDetails` | `ChildSheetBody` |
| `pet` | `PetDetails`（base only） | `PetSheetBody` |
| `plant` | `PlantDetails`（base only） | `PlantSheetBody` |
| `insurance` | `InsuranceDetails` | `InsuranceSheetBody` |

這套模型在前六種 entity 上很合用——每個 type 都有自己的語意（FuelLog 雙寫、儲蓄險 framing、PII 加密、保費 cron）。

但 #222 觀察到：**有些東西使用者就是想記下來但不想要任何行為**——例如相機、單車、紀念物。每多開一個專屬 type 就要拉一條子表 + 一支 SheetBody，但其中根本沒有後端行為——只是純文字紀錄。

→ 開一條「模板路徑」，欄位 schema 在 code 裡宣告，值統一落到一個 jsonb，不開新子表、不寫新 cron。

v1 範圍縮到最小：只有一個 `general` 模板，搭配 TypePicker 上的新「物品」選項。**舊 6 種 type 完全不動。**

---

## 設計

### Schema

`Assets.type` enum 加 `item`；新 enum `asset_template_key`（v1 只有 `general`）；`Assets` 加兩個欄位：

- `template_key` enum nullable — null 表示走舊 type→子表路徑；非 null 表示走模板路徑
- `template_fields` jsonb nullable — 模板欄位值（v1 永遠是 `{}`）

`asset_template_key` enum 可 append 不可移除（Postgres enum 限制）。將來新增模板：append enum value + 在 `lib/assetTemplates.ts` 加 key。

詳細欄位以 `lib/db/schema.ts` 為準。

**共存契約**：

- 舊愛物（`template_key IS NULL`）：保留原本 type、走原本 SheetBody / DetailClient / Details 子表。FuelLog / SavingsView / 保費 cron 等自動化照舊
- 模板愛物（`template_key IS NOT NULL`）：永遠 `type='item'`，走 `TemplateSheetBody` / `TemplateAssetDetailClient`。**完全不接任何既有自動化**

`type='item'` 這個 invariant 是 list / detail 分流的根據。

### 模板註冊

`lib/assetTemplates.ts`：純資料宣告，無 side effects。v1 只有：

```ts
const GENERAL_TEMPLATE: AssetTemplate = { key: 'general', fields: [] }
```

`validateTemplateFields(templateKey, raw)` 依模板 schema 驗證輸入：

- 未知 key 默默丟棄
- 空值 → `null`
- 型別錯誤 → throw

雖然 v1 的 general 沒有欄位（永遠回 `{}`），驗證器內已實作 text / number / date 三種型別分支供未來模板使用。

### Server actions

`createTemplateAsset` / `editTemplateAsset` in `actions/asset.ts`：

- 寫入 `Assets`（`type='item'` + `template_key='general'` + `template_fields={}`）
- `editTemplateAsset` 用 `eq(assets.type, 'item')` 守住「不允許動到舊 type 的 row」
- 不寫任何 detail 子表、不雙寫 CashTransaction

### UI 分流

**AssetSheet** 是 router，TypePicker 顯示七個選項（前 4 個 primary +「更多」展開 house / insurance / item），選到哪個就 dispatch 到對應的 SheetBody：

```
car       → CarSheetBody
child     → ChildSheetBody
pet       → PetSheetBody
plant     → PlantSheetBody
house     → HouseSheetBody
insurance → InsuranceSheetBody
item      → TemplateSheetBody   ← 新增
```

編輯模式同理：legacy 愛物根據 `initial.type` 派發；模板愛物根據 `templateKey != null` 走 'item' 分支。

**Detail 頁**：第一個分支檢查 `asset.templateKey != null`，命中走 `TemplateAssetDetailClient`；否則 fall through 到既有的 type-based 分流。

**愛物列表**：新增「物品」section，用 `items.filter(a => a.type === 'item')`。其餘 section（property / living / coverage）行為不變。

### Detail 頁渲染

`TemplateAssetDetailClient` 是泛用版：

- `AibutsuHeader` 用 `kind='item'`（新 tint：`#E9E4DF` / `#6E5F52`）
- `MoneyTwoCol`（本月 / 累計）——template 愛物還是可以被當成 CashTransaction 的 `asset_id` 連結
- `InfoCard` 依 `getTemplate(templateKey).fields` 動態 render，空值 `—`。v1 的 general 沒欄位，整個 section 跳過
- 備註 + transaction feed 與其他 detail 頁一致

### 顏色

`app/globals.css` 新增 `--asset-color-item: #B7AAA0` + `--asset-tint-item`（同 hue family 自動 lighten）。

---

## 取捨

### 為什麼縮到只有 `general` 一個模板

第一輪設計提了 vehicle / property / insurance 三個模板，但檢視後發現：使用者已有兩個 child 愛物，新建愛物時如果預設「不能選孩子、只能選新模板」是巨大的 UX regression。把新模板加入 TypePicker 作為「並存的第 7 個選項」最保險。

至於 vehicle / property / insurance——這三個本來就有專屬 type（car / house / insurance），多一份模板版本只會分裂使用者的心智模型。砍掉留作將來決定（如果舊 type 真的要退場，再考慮把對應模板補回來）。

### 為什麼用 jsonb 而不是 generic key-value table

`template_fields_kv` 五倍寫入次數、所有讀取都要 join + pivot。Jsonb 一行存完、Postgres 原生有 path query、`validateTemplateFields` 已經保證 shape。

### 將來想新增一個 `pet` 模板（純文字版）怎麼做

1. `lib/assetTemplates.ts`：在 `ASSET_TEMPLATE_KEYS` 與 `TEMPLATES` 加入 `'pet'`，宣告欄位
2. 新 migration `ALTER TYPE asset_template_key ADD VALUE 'pet'`
3. **UX 決定**：要新增另一個 TypePicker option（像 'item' 那樣是獨立 type），還是要讓 'pet' type 走「混合路徑」（既可走舊 PetSheetBody 也可走 TemplateSheetBody）？目前傾向前者——避免 type 路徑分歧

---

## Acceptance criteria

- 可從 TypePicker 選「物品」建立 template-based 愛物
- 編輯 / 顯示走 TemplateSheetBody + TemplateAssetDetailClient
- 新增「物品」愛物**不會**觸發任何既有自動化（無新 cron、無 FuelLog 寫入、無 InsuranceDetails 寫入）
- 既有 6 種 type 的新增 / 編輯流程完全沒有改變
- `editTemplateAsset` 對非 item type 的 row 不會誤動（`eq(assets.type, 'item')` 守住）
- 愛物列表「物品」section 出現；filter sheet 的「物品」sub-section 也對應（見 [structured-filter](structured-filter-design.md) v3）

---

## 後續

- 評估「移除 / 合併既有 detail 子表」：先看 template-based path 累積到多少使用者
- 模板擴充：以 `pet` / `child` / `plant` 為輕量模板加入註冊表（另開 issue）
- 字段型別擴充：目前 validator 已支援 text / number / date。如果之後要加 `enum`（下拉選單），改動點只有 `assetTemplates.ts` + 新版 TemplateSheetBody
