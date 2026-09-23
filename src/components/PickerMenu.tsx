import { useEffect, useMemo, useRef, useState } from 'react'

import { cx } from '../lib/styles'
import { Icon } from './ui'

export interface PickerOption {
  value: string
  count: number
}

export interface PickerGroup {
  key: string
  label: string
  options: PickerOption[]
  selected: string[]
  render?: (value: string) => string
}

const COLLAPSED = 5

const SEARCH_CAP = 6

export function PickerBody({
  groups,
  onToggle,
  onClearAll,
  placeholder = 'Type to find any filter…',
  autoFocus = false,
}: {
  groups: PickerGroup[]
  onToggle: (groupKey: string, value: string) => void
  onClearAll?: () => void
  placeholder?: string
  autoFocus?: boolean
}) {
  const [needle, setNeedle] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const term = needle.trim().toLowerCase()
  const searching = term.length > 0

  const shown = useMemo(
    () =>
      groups
        .map((group) => {
          if (!searching) {
            const selected = group.options.filter((o) => group.selected.includes(o.value))
            const rest = group.options.filter((o) => !group.selected.includes(o.value))
            const limit = expanded.has(group.key) ? rest.length : COLLAPSED
            return {
              group,
              options: [...selected, ...rest.slice(0, limit)],
              hidden: Math.max(0, rest.length - limit),
            }
          }
          const matches = group.options.filter((o) =>
            o.value.toLowerCase().includes(term),
          )
          return {
            group,
            options: matches.slice(0, SEARCH_CAP),
            hidden: Math.max(0, matches.length - SEARCH_CAP),
          }
        })
        .filter((entry) => entry.options.length > 0),
    [groups, term, searching, expanded],
  )

  const activeCount = groups.reduce((sum, group) => sum + group.selected.length, 0)
  const totalMatches = shown.reduce(
    (sum, entry) => sum + entry.options.length + entry.hidden,
    0,
  )

  return (
    <div className="flex min-h-0 flex-col">
      <div className="relative shrink-0 border-b border-line p-2">
        <Icon
          name="search"
          className="pointer-events-none absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-fg-faint"
        />
        <input

          autoFocus={autoFocus}
          value={needle}
          onChange={(inputEvent) => setNeedle(inputEvent.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="w-full rounded-lg bg-surface-inset py-2 pl-8 pr-2 text-xs text-fg ring-1 ring-line placeholder:text-fg-faint focus:ring-1 focus:ring-accent focus:outline-none"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {shown.length === 0 ? (
          <p className="px-2 py-6 text-center text-[11px] text-fg-subtle">
            Nothing matches “{needle}”
          </p>
        ) : (
          shown.map(({ group, options, hidden }) => (
            <section key={group.key} className="mb-1">
              <p className="px-2 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wider text-fg-faint">
                {group.label}
              </p>
              <ul>
                {options.map((option) => {
                  const active = group.selected.includes(option.value)
                  return (
                    <li key={option.value}>
                      <button
                        type="button"
                        onClick={() => onToggle(group.key, option.value)}
                        aria-pressed={active}
                        className={cx(
                          'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition',
                          active
                            ? 'bg-accent-soft text-accent-text'
                            : 'text-fg-muted hover:bg-surface-2',
                        )}
                      >
                        <span
                          className={cx(
                            'grid size-4 shrink-0 place-items-center rounded border transition',
                            active
                              ? 'border-accent bg-accent text-accent-ink'
                              : 'border-line-strong',
                          )}
                        >
                          {active ? <Icon name="check" className="size-3" /> : null}
                        </span>
                        <span className="min-w-0 flex-1 truncate" title={option.value}>
                          {group.render?.(option.value) ?? option.value}
                        </span>
                        <span className="shrink-0 text-[10px] tabular-nums text-fg-faint">
                          {option.count.toLocaleString()}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
              {hidden > 0 && !searching ? (
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((current) => {
                      const next = new Set(current)
                      next.add(group.key)
                      return next
                    })
                  }
                  className="px-2 py-1 text-[10px] font-semibold text-accent-text transition hover:text-accent"
                >
                  show {hidden.toLocaleString()} more
                </button>
              ) : null}
              {hidden > 0 && searching ? (
                <p className="px-2 py-1 text-[10px] text-fg-faint">
                  +{hidden.toLocaleString()} more match
                </p>
              ) : null}
            </section>
          ))
        )}
      </div>

      {onClearAll && activeCount > 0 ? (
        <div className="flex shrink-0 items-center justify-between border-t border-line px-3 py-2">
          <span className="text-[11px] text-fg-subtle">
            {searching ? `${totalMatches.toLocaleString()} matching` : `${activeCount} selected`}
          </span>
          <button
            type="button"
            onClick={onClearAll}
            className="text-[11px] font-semibold text-accent-text transition hover:text-accent"
          >
            Clear all
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function PickerMenu({
  label,
  activeCount,
  groups,
  onToggle,
  onClearAll,
}: {
  label: string
  activeCount: number
  groups: PickerGroup[]
  onToggle: (groupKey: string, value: string) => void
  onClearAll: () => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (pointerEvent: MouseEvent) => {
      if (!root.current?.contains(pointerEvent.target as Node)) setOpen(false)
    }
    const onKey = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="true"
        className={cx(
          'inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition',
          activeCount > 0
            ? 'bg-accent-soft text-accent-text ring-1 ring-accent-line'
            : 'bg-surface-1/50 text-fg-muted ring-1 ring-line/70 backdrop-blur-sm hover:bg-surface-1 hover:text-fg-strong',
        )}
      >
        <Icon name="filter" className="size-3.5" />
        {label}
        {activeCount > 0 ? (
          <span className="rounded bg-accent px-1 text-[10px] font-bold text-accent-ink">
            {activeCount}
          </span>
        ) : null}
        <Icon name="chevronDown" className="size-3" />
      </button>

      {open ? (
        <div className="panel animate-rise absolute right-0 z-50 mt-2 flex max-h-[28rem] w-[22rem] flex-col overflow-hidden rounded-xl shadow-2xl">
          <PickerBody
            autoFocus
            groups={groups}
            onToggle={onToggle}
            onClearAll={onClearAll}
          />
        </div>
      ) : null}
    </div>
  )
}
