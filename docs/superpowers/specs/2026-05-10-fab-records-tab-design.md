---
status: approved
shipped_in: ~
related_issue: https://github.com/redtear1115/oikos/issues/110
---

# FAB Context-Awareness on /records

## Problem

On the `/records` page, the FAB always opens `AddSheet` (新增支出) regardless of which tab the user is on. When a user switches to the 收入 tab to view income entries, the FAB should logically add a new income record — not an expense. The current behaviour is a silent semantic mismatch.

Aibutsu detail pages were also reviewed and their FAB behaviour (add related expense, pre-filled with assetId) is intentional and not addressed here.

## Design

### Behaviour by Tab

| Tab | FAB colour | Click opens |
|-----|-----------|------------|
| 全部 | ink (dark brown `var(--ink)`) | AddSheet — 新增支出 |
| 支出 | ink (dark brown `var(--ink)`) | AddSheet — 新增支出 |
| 收入 | accent (mint `var(--accent)`) | IncomeSheet — 新增收入 |

The colour change (`fabVariant`) provides a passive visual cue that the FAB has changed meaning. No label text is added — the circular FAB is kept (consistent with dashboard behaviour). The accent colour matches the income palette already used throughout the 收入 tab UI (`#3F6A56` mint).

### State Model

Follow the existing RecordsList pattern of individual boolean states per sheet. Add one new boolean:

```ts
const [addingIncomeNew, setAddingIncomeNew] = useState(false)
```

`addingIncomeNew` represents "user tapped FAB while on 收入 tab, opening a blank IncomeSheet". It is distinct from `editingIncome` (which carries existing income data for editing).

### 全部 Tab Default

When on the 全部 tab the FAB defaults to 新增支出 (ink colour, opens AddSheet). This is the most frequent action and requires no decision from the user.

## Implementation Scope

Only `app/(dashboard)/records/_components/RecordsList.tsx` requires changes.

### Changes

1. **New state**: `const [addingIncomeNew, setAddingIncomeNew] = useState(false)`

2. **`sheetOpen` union**: add `|| addingIncomeNew`

3. **`handleSheetClose`**: add `setAddingIncomeNew(false)`

4. **BottomNav `fabVariant`**:
   ```tsx
   fabVariant={tab === 'income' ? 'accent' : 'primary'}
   ```

5. **BottomNav `onAddClick`**:
   ```tsx
   onAddClick={() => tab === 'income' ? setAddingIncomeNew(true) : setAdding(true)}
   ```

6. **IncomeSheet `open` condition**:
   ```tsx
   open={editingIncome !== null || addingIncomeNew}
   ```
   When `addingIncomeNew` is true and `editingIncome` is null, `initial` is `undefined` — IncomeSheet already handles this as create mode.

## Out of Scope

- Aibutsu detail page FAB labels — existing behaviour is intentional
- Refactoring RecordsList modal state to a reducer — unrelated to this issue
- Any changes to `BottomNav` component itself
