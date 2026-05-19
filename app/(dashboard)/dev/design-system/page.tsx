import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/TextInput'
import { SheetHeader, SheetBody, SheetFooter } from '@/components/ui/Sheet'

export default function DesignSystemPage() {
  return (
    <div className="p-8 flex flex-col gap-8 bg-bg min-h-screen">
      <h1 className="text-title font-medium text-ink">Design System — Button</h1>

      {(['primary', 'secondary', 'ghost', 'danger'] as const).map(variant => (
        <section key={variant} className="flex flex-col gap-3">
          <p className="text-label text-ink-2 uppercase tracking-wide">{variant}</p>
          <div className="flex gap-3 flex-wrap items-center">
            {(['sm', 'md', 'lg'] as const).map(size => (
              <Button key={size} variant={variant} size={size}>{variant} {size}</Button>
            ))}
            <Button variant={variant} disabled>disabled</Button>
            <Button variant={variant} loading>loading</Button>
          </div>
          <Button variant={variant} fullWidth>fullWidth</Button>
        </section>
      ))}

      <h2 className="text-title font-medium text-ink mt-8">TextInput</h2>
      <section className="flex flex-col gap-3 max-w-sm">
        <TextInput placeholder="No addons" />
        <TextInput leftAddon="NT$" placeholder="0" inputMode="decimal" />
        <TextInput rightAddon="km" placeholder="距離" />
        <TextInput leftAddon="$" rightAddon={<span className="text-label text-ink-2 pr-1">USD</span>} placeholder="0.00" />
        <TextInput error placeholder="Error state" />
        <TextInput disabled placeholder="Disabled" />
      </section>

      <h2 className="text-title font-medium text-ink mt-8">Sheet Inner Wrappers</h2>
      <div className="border border-[var(--hairline)] rounded-card overflow-hidden max-w-sm bg-bg">
        <SheetHeader
          title="新增支出"
          trailing={<button type="button" className="text-label text-ink-2">關閉</button>}
        />
        <SheetBody>
          <div className="flex flex-col gap-3 py-3">
            <TextInput placeholder="金額" inputMode="decimal" />
            <TextInput placeholder="備註" />
          </div>
        </SheetBody>
        <SheetFooter>
          <Button variant="secondary" fullWidth>取消</Button>
          <Button variant="primary" fullWidth>儲存</Button>
        </SheetFooter>
      </div>
    </div>
  )
}
