import { useMemo } from 'react'
import type { RefObject } from 'react'

import { FACETS, shortLevel } from '../lib/sessions'
import type { FacetKey, Flag, SortKey } from '../lib/sessions'
import type { CatalogFilters } from '../lib/useCatalogFilters'
import { labelDateKey } from '../lib/time'
import { cx } from '../lib/styles'
import { useApp } from '../store/appContext'
import { PickerMenu } from './PickerMenu'
import type { PickerGroup } from './PickerMenu'
import { Icon, Spinner } from './ui'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'time', label: 'Time' },
  { key: 'code', label: 'Code' },
  { key: 'title', label: 'Title' },
]

const MENU_FACETS: FacetKey[] = [
  'level',
  'type',
  'topics',
  'tracks',
  'services',
  'areasOfInterest',
  'roles',
  'industries',
  'venue',
  'features',
  'segments',
  'experiences',
  'focusAreas',
]

const PILL_FLAGS: { key: Flag; label: string; icon: 'starFilled' | 'ticket' }[] = [
  { key: 'favorites', label: 'Favorites', icon: 'starFilled' },
  { key: 'reserved', label: 'Reserved', icon: 'ticket' },
]

const MENU_FLAGS: { key: Flag; label: string }[] = [
  { key: 'reservable', label: 'Takes reservations' },
  { key: 'seatsOpen', label: 'Seats still open' },
  { key: 'scheduled', label: 'Has a time slot' },
]

export function CatalogControls({
  catalog: filters,
  searchRef,
}: {
  catalog: CatalogFilters
  searchRef: RefObject<HTMLInputElement | null>
}) {
  const { catalog, catalogStatus } = useApp()
  const state = filters.filters

  const dayOptions = useMemo(
    () => [...(filters.facets.day ?? [])].sort((a, b) => a.value.localeCompare(b.value)),
    [filters.facets.day],
  )
  const selectedDays = state.selections.day ?? []

  const groups = useMemo<PickerGroup[]>(() => {
    const facetGroups = MENU_FACETS.flatMap((key) => {
      const def = FACETS.find((facet) => facet.key === key)
      const options = filters.facets[key] ?? []
      if (!def || options.length === 0) return []
      return [
        {
          key,
          label: def.label,
          options,
          selected: state.selections[key] ?? [],
          render: key === 'level' ? (value: string) => shortLevel(value) ?? value : undefined,
        },
      ]
    })

    return [
      {
        key: '__flags',
        label: 'Only show',
        options: MENU_FLAGS.map((flag) => ({ value: flag.key, count: 0 })),
        selected: state.flags.filter((flag) =>
          MENU_FLAGS.some((entry) => entry.key === flag),
        ),
        render: (value: string) =>
          MENU_FLAGS.find((flag) => flag.key === value)?.label ?? value,
      },
      ...facetGroups,
    ]
  }, [filters.facets, state.selections, state.flags])

  const onToggle = (groupKey: string, value: string) => {
    if (groupKey === '__flags') filters.toggleFlag(value as Flag)
    else filters.toggleFacetValue(groupKey as FacetKey, value)
  }

  const chips = [
    ...FACETS.flatMap((facet) =>
      (state.selections[facet.key] ?? []).map((value) => ({
        key: `${facet.key}:${value}`,
        group: facet.label,
        label:
          facet.key === 'day'
            ? `${labelDateKey(value).weekday} ${labelDateKey(value).monthDay}`
            : (facet.key === 'level' ? shortLevel(value) : null) ?? value,
        tone: 'bg-accent-soft text-accent-text ring-accent-line',
        remove: () => filters.toggleFacetValue(facet.key, value),
      })),
    ),
    ...state.flags.map((flag) => ({
      key: `flag:${flag}`,
      group: 'Only show',
      label:
        MENU_FLAGS.find((entry) => entry.key === flag)?.label ??
        PILL_FLAGS.find((entry) => entry.key === flag)?.label ??
        flag,
      tone: 'bg-plan-favorite-soft text-plan-favorite ring-plan-favorite/40',
      remove: () => filters.toggleFlag(flag),
    })),
  ]

  const menuActive = groups.reduce((sum, group) => sum + group.selected.length, 0)

  const clearMenu = () => {
    const selections = { ...state.selections }
    for (const key of MENU_FACETS) delete selections[key]
    filters.replaceFilters({
      ...state,
      selections,
      flags: state.flags.filter(
        (flag) => !MENU_FLAGS.some((entry) => entry.key === flag),
      ),
    })
  }

  return (
    <>

      {dayOptions.length > 0 ? (
        <div className="-mx-1 mb-2.5 flex items-stretch gap-1.5 overflow-x-auto px-1 pb-0.5">
          <DayLeaf
            active={selectedDays.length === 0}
            top="ALL"
            main="·"
            bottom="days"
            onClick={() => filters.pickDay(null)}
          />
          {dayOptions.map((option) => {
            const label = labelDateKey(option.value)
            const [month, dayNum] = label.monthDay.split(' ')
            return (
              <DayLeaf
                key={option.value}
                active={selectedDays.includes(option.value)}
                top={label.weekday}
                main={dayNum ?? label.monthDay}
                bottom={month ?? ''}
                count={option.count}
                onClick={() => filters.pickDay(option.value)}
              />
            )
          })}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-faint"
          />
          <input
            ref={searchRef}
            value={filters.queryDraft}
            onChange={(inputEvent) => filters.setQueryDraft(inputEvent.target.value)}
            placeholder="Search titles, abstracts, speakers, services…"
            aria-label="Search sessions"
            className="w-full rounded-xl bg-surface-1/70 py-2 pl-9 pr-16 text-sm text-fg ring-1 ring-line/70 backdrop-blur-sm transition placeholder:text-fg-faint focus:bg-surface-1 focus:ring-2 focus:ring-accent focus:outline-none"
          />
          {filters.queryDraft ? (
            <button
              type="button"
              onClick={() => filters.setQueryDraft('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-fg-faint transition hover:text-fg"
            >
              <Icon name="close" className="size-4" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-line bg-surface-2/60 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-fg-faint">
              /
            </kbd>
          )}
        </div>

        {PILL_FLAGS.map((flag) => {
          const active = state.flags.includes(flag.key)
          return (
            <button
              key={flag.key}
              type="button"
              onClick={() => filters.toggleFlag(flag.key)}
              aria-pressed={active}
              title={`Only ${flag.label.toLowerCase()}`}
              className={cx(
                'inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition',
                active
                  ? 'bg-accent-soft text-accent-text ring-1 ring-accent-line'
                  : 'bg-surface-1/50 text-fg-muted ring-1 ring-line/70 backdrop-blur-sm hover:bg-surface-1 hover:text-fg-strong',
              )}
            >
              <Icon name={flag.icon} className="size-3.5" />
              <span className="hidden sm:inline">{flag.label}</span>
            </button>
          )
        })}

        <PickerMenu
          label="Filter"
          activeCount={menuActive}
          groups={groups}
          onToggle={onToggle}
          onClearAll={clearMenu}
        />

        <div className="flex shrink-0 items-center gap-0.5 rounded-xl bg-surface-1/50 p-1 ring-1 ring-line/70 backdrop-blur-sm">
          {SORTS.map((sort) => (
            <button
              key={sort.key}
              type="button"
              onClick={() => filters.setSort(sort.key)}
              title={`Sort by ${sort.label.toLowerCase()}`}
              className={cx(
                'rounded-lg px-2.5 py-1 text-[11px] font-semibold transition',
                state.sort === sort.key
                  ? 'bg-surface-0 text-fg-strong shadow-sm'
                  : 'text-fg-subtle hover:text-fg',
              )}
            >
              {sort.label}
            </button>
          ))}
        </div>
      </div>

      {catalogStatus === 'loading' ? (
        <div
          className="stream-bar mt-2 h-0.5 rounded-full"
          role="progressbar"
          aria-label="Loading catalog"
        />
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <p className="inline-flex items-baseline gap-1.5 text-xs text-fg-muted">
          <span className="font-display text-base font-semibold leading-none text-fg-strong">
            {filters.results.length.toLocaleString()}
          </span>
          <span className="text-fg-faint">of {catalog.length.toLocaleString()}</span>
          {catalogStatus === 'loading' ? (
            <span className="inline-flex items-center gap-1.5 text-fg-subtle">
              <Spinner className="size-3" />
              loading
            </span>
          ) : null}
        </p>

        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={chip.remove}
            title={`Remove ${chip.group}: ${chip.label}`}
            className={cx(
              'inline-flex max-w-[18rem] items-center gap-1 rounded-md py-0.5 pl-1.5 pr-1 text-[11px] ring-1 ring-inset transition hover:opacity-80',
              chip.tone,
            )}
          >
            <span className="opacity-60">{chip.group}</span>
            <span className="truncate font-semibold">{chip.label}</span>
            <Icon name="close" className="size-2.5" />
          </button>
        ))}

        {chips.length > 0 || state.query ? (
          <button
            type="button"
            onClick={filters.reset}
            className="text-[11px] font-medium text-fg-subtle underline decoration-dotted transition hover:text-fg"
          >
            clear all
          </button>
        ) : null}
      </div>
    </>
  )
}

function DayLeaf({
  active,
  top,
  main,
  bottom,
  count,
  onClick,
}: {
  active: boolean
  top: string
  main: string
  bottom: string
  count?: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'relative shrink-0 overflow-hidden rounded-xl px-3 pb-1.5 pt-1 text-center transition',
        active
          ? 'bg-accent shadow-md shadow-accent/30'
          : 'bg-surface-1/60 ring-1 ring-line/70 backdrop-blur-sm hover:bg-surface-1 hover:ring-line-strong',
      )}
    >
      <span
        className={cx(
          'block text-[9px] font-bold uppercase tracking-[0.16em]',
          active ? 'text-accent-ink/70' : 'text-accent-text',
        )}
      >
        {top}
      </span>
      <span
        className={cx(
          'font-display block text-xl font-semibold leading-none tabular-nums',
          active ? 'text-accent-ink' : 'text-fg-strong',
        )}
      >
        {main}
      </span>
      <span
        className={cx(
          'mt-0.5 block text-[9px] font-bold uppercase tracking-wider tabular-nums',
          active ? 'text-accent-ink/60' : 'text-fg-faint',
        )}
      >
        {count !== undefined ? count.toLocaleString() : bottom}
      </span>
    </button>
  )
}
