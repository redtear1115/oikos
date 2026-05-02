import { getCategory } from '@/lib/categories'

interface Props {
  categoryId: string
  size?: number
}

export function CategoryChip({ categoryId, size = 36 }: Props) {
  const c = getCategory(categoryId)
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
