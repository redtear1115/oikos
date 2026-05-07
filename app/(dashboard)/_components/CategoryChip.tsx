import { getCategory, isValidCategoryId } from '@/lib/categories'
import { getIncomeCategory } from '@/lib/incomeCategories'

interface Props {
  categoryId: string
  size?: number
}

export function CategoryChip({ categoryId, size = 36 }: Props) {
  const c = isValidCategoryId(categoryId) ? getCategory(categoryId) : getIncomeCategory(categoryId)
  return (
    <div
      style={{
        width: size,
        height: size,
        background: c.tint,
        color: c.ink,
        fontSize: size * 0.46,
      }}
      className="rounded-[10px] flex items-center justify-center font-medium shrink-0"
    >
      {c.mono}
    </div>
  )
}
