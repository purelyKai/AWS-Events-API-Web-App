import type { Layers } from '../lib/plan'
import { cx } from '../lib/styles'
import { useApp } from '../store/appContext'

export function ScheduleControls({
  layers,
  onLayersChange,
}: {
  layers: Layers
  onLayersChange: (next: Layers) => void
}) {
  const { reserved, favorites, personalTime } = useApp()

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-0.5 rounded-xl bg-surface-1/50 p-1 ring-1 ring-line/70 backdrop-blur-sm">
        <LayerToggle
          active={layers.reserved}
          onClick={() => onLayersChange({ ...layers, reserved: !layers.reserved })}
          tone="text-accent-text"
          dot="bg-accent"
          label="Reserved"
          count={reserved.size}
        />
        <LayerToggle
          active={layers.favorite}
          onClick={() => onLayersChange({ ...layers, favorite: !layers.favorite })}
          tone="text-plan-favorite"
          dot="bg-plan-favorite"
          label="Favorites"
          count={favorites.size}
        />
        <LayerToggle
          active={layers.personal}
          onClick={() => onLayersChange({ ...layers, personal: !layers.personal })}
          tone="text-plan-personal"
          dot="bg-plan-personal"
          label="Personal"
          count={personalTime.length}
        />
      </div>
    </div>
  )
}

function LayerToggle({
  active,
  onClick,
  label,
  dot,
  tone,
  count,
}: {
  active: boolean
  onClick: () => void
  label: string
  dot: string
  tone: string
  count: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={`${active ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition',
        active ? `bg-surface-0 shadow-sm ${tone}` : 'text-fg-subtle hover:text-fg-muted',
      )}
    >
      <span className={cx('size-1.5 rounded-full', active ? dot : 'bg-line-strong')} />
      <span className="hidden sm:inline">{label}</span>
      <span
        className={cx(
          'rounded px-1 text-[10px] font-bold tabular-nums',
          active ? 'bg-surface-2' : 'bg-surface-3/60 text-fg-faint',
        )}
      >
        {count}
      </span>
    </button>
  )
}
