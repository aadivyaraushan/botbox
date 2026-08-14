type Item = { id: string; label: string }

type Props = {
  items: Item[]
  active: number
  onPick: (id: string) => void
}

export function SlashMenu({ items, active, onPick }: Props) {
  return (
    <div className="slash-menu" data-testid="slash-menu" role="listbox">
      {items.map((it, i) => (
        <button
          key={it.id}
          type="button"
          role="option"
          aria-selected={i === active}
          className={`slash-item ${i === active ? 'active' : ''}`}
          onClick={() => onPick(it.id)}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}
