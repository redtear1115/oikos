export default function Loading() {
  return (
    <div
      className="fixed inset-0 z-[200]"
      style={{
        background: 'rgba(0,0,0,0.25)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        animation: 'overlay-in 160ms ease-out both',
      }}
    />
  )
}
