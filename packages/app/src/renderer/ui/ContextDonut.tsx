type Props = {
  used: number | null
  window: number | null
}

export function ContextDonut({ used, window: win }: Props) {
  const has = used != null && win != null && win > 0
  const pct = has ? Math.min(1, used! / win!) : 0
  const r = 7
  const c = 2 * Math.PI * r
  const dash = has ? pct * c : 0
  const tip = has ? `${used} / ${win}` : 'Waiting for usage'
  return (
    <svg
      className="donut"
      data-testid="context-donut"
      viewBox="0 0 18 18"
      aria-label={tip}
    >
      <title>{tip}</title>
      <circle cx="9" cy="9" r={r} fill="none" stroke="var(--line)" strokeWidth="2" />
      <circle
        cx="9"
        cy="9"
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeDasharray={`${dash} ${c}`}
        transform="rotate(-90 9 9)"
      />
    </svg>
  )
}
