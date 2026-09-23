import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import type { Span } from '../lib/layout'
import { countedOptionsFor, DEFAULT_PREFS, generatePlan } from '../lib/generate'
import type { GeneratePrefs, Plan } from '../lib/generate'
import { shortLevel, TYPE_ICON } from '../lib/sessions'
import {
  formatDuration,
  formatMinutes,
  labelDateKey,
  snapTo5,
  utcNaiveToLocalSlot,
} from '../lib/time'
import type { DateKey } from '../lib/time'
import { cx } from '../lib/styles'
import { useApp } from '../store/appContext'
import { Button, Icon, Modal, Spinner } from './ui'
import type { IconName } from './ui'

const clockValue = (minutes: number) => formatMinutes(minutes, false)

const parseClockInput = (value: string): number | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return hour * 60 + minute
}

const numericLevel = (value: string): number => Number(shortLevel(value) ?? '0')

const FIELD =
  'rounded-lg bg-surface-inset py-2 text-sm text-fg ring-1 ring-line transition ' +
  'placeholder:text-fg-faint focus:ring-2 focus:ring-accent focus:outline-none'

const STEPS = [
  { key: 'topics', title: 'What are you here for?', hint: 'Pick the subjects worth your week. Skip to consider everything.' },
  { key: 'services', title: 'Any services in particular?', hint: 'Optional. Narrows to sessions that actually cover them.' },
  { key: 'depth', title: 'How deep, and in what format?', hint: 'Optional. Leave blank to mix levels and formats.' },
  { key: 'pace', title: 'How much do you want on?', hint: 'Your days, your pace, and the hours you will actually show up for.' },
  { key: 'plan', title: 'Here is your week', hint: 'Drop anything you do not want before adding it.' },
] as const

const PACES: { key: string; label: string; hint: string; icon: IconName; maxPerDay: number }[] = [
  { key: 'light', label: 'Light', hint: '2 a day', icon: 'sun', maxPerDay: 2 },
  { key: 'balanced', label: 'Balanced', hint: '4 a day', icon: 'layers', maxPerDay: 4 },
  { key: 'packed', label: 'Packed', hint: '6 a day', icon: 'spark', maxPerDay: 6 },
]

export function GenerateDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean
  onClose: () => void
  onDone: () => void
}) {
  const {
    catalog,
    days,
    timeZone,
    favorites,
    reserved,
    byId,
    personalTime,
    applyPlan,
    pushToast,
  } = useApp()

  const [stepIndex, setStepIndex] = useState(0)
  const [prefs, setPrefs] = useState<GeneratePrefs>(() => ({ ...DEFAULT_PREFS, days }))

  const [daysTouched, setDaysTouched] = useState(false)
  const [applying, setApplying] = useState(false)

  const [favoriteOnly, setFavoriteOnly] = useState<ReadonlySet<string>>(new Set())

  const [dropped, setDropped] = useState<ReadonlySet<string>>(new Set())

  const step = STEPS[stepIndex]
  const selectedDays = daysTouched ? prefs.days : days

  const patch = (next: Partial<GeneratePrefs>) => {
    setPrefs((current) => ({ ...current, ...next }))
  }

  const topicOptions = useMemo(
    () =>
      countedOptionsFor(
        catalog,
        (v) => [...(v.session.topics ?? []), ...(v.session.areasOfInterest ?? [])],
        40,
      ),
    [catalog],
  )
  const serviceOptions = useMemo(
    () => countedOptionsFor(catalog, (v) => v.session.services, 40),
    [catalog],
  )
  const typeOptions = useMemo(
    () => countedOptionsFor(catalog, (v) => (v.session.type ? [v.session.type] : []), 12),
    [catalog],
  )
  const levelOptions = useMemo(
    () => countedOptionsFor(catalog, (v) => (v.session.level ? [v.session.level] : []), 8),
    [catalog],
  )

  const levelBands = useMemo(() => {
    const inRange = (lo: number, hi: number) =>
      levelOptions
        .filter((option) => {
          const level = numericLevel(option.value)
          return level >= lo && level <= hi
        })
        .map((option) => option.value)

    return [
      {
        key: 'intro',
        label: 'New to it',
        hint: '100 & 200 level',
        icon: 'globe' as IconName,
        levels: inRange(100, 200),
      },
      {
        key: 'mid',
        label: 'Comfortable',
        hint: '300 level',
        icon: 'layers' as IconName,
        levels: inRange(300, 300),
      },
      {
        key: 'deep',
        label: 'Deep expertise',
        hint: '400 & 500 level',
        icon: 'spark' as IconName,
        levels: inRange(400, 500),
      },
    ].filter((band) => band.levels.length > 0)
  }, [levelOptions])

  const interestCount =
    prefs.topics.length + prefs.services.length + prefs.types.length + prefs.levels.length

  const effectivePrefs = useMemo<GeneratePrefs>(
    () => ({
      ...prefs,
      days: selectedDays.filter((day) => days.includes(day)),
      onlyMatching: interestCount > 0,
    }),
    [prefs, selectedDays, days, interestCount],
  )

  const busyByDay = useMemo(() => {
    const map = new Map<DateKey, Span[]>()
    const add = (day: DateKey, span: Span) => {
      const list = map.get(day)
      if (list) list.push(span)
      else map.set(day, [span])
    }

    for (const block of personalTime) {
      const start = utcNaiveToLocalSlot(block.startDateTime, timeZone)
      const end = utcNaiveToLocalSlot(block.endDateTime, timeZone)
      if (!start || !end) continue
      add(start.dateKey, {
        startMin: start.minutes,
        endMin: start.dateKey === end.dateKey ? end.minutes : 1440,
      })
    }

    for (const id of reserved) {
      const view = byId.get(id)
      if (!view?.dateKey || view.startMin === undefined || view.endMin === undefined) {
        continue
      }
      add(view.dateKey, { startMin: view.startMin, endMin: view.endMin })
    }

    return map
  }, [personalTime, reserved, byId, timeZone])

  const plan: Plan = useMemo(
    () => generatePlan(catalog, effectivePrefs, { favorites, reserved, busyByDay }),
    [catalog, effectivePrefs, favorites, reserved, busyByDay],
  )

  const pickedIds = useMemo(
    () =>
      plan.days.flatMap((day) =>
        day.items
          .map((item) => item.view.session.sessionId)
          .filter((id) => !dropped.has(id)),
      ),
    [plan, dropped],
  )

  const reserveIds = useMemo(
    () =>
      new Set(
        pickedIds.filter(
          (id) => byId.get(id)?.session.isReservable && !favoriteOnly.has(id),
        ),
      ),
    [pickedIds, byId, favoriteOnly],
  )

  const stats = useMemo(() => {
    let minutes = 0
    let reservable = 0
    const activeDays = new Set<DateKey>()
    for (const day of plan.days) {
      for (const item of day.items) {
        if (dropped.has(item.view.session.sessionId)) continue
        activeDays.add(day.dateKey)
        minutes += (item.view.endMin ?? 0) - (item.view.startMin ?? 0)
        if (item.view.session.isReservable) reservable += 1
      }
    }
    return { minutes, reservable, dayCount: activeDays.size }
  }, [plan, dropped])

  const toggle = (
    key: 'topics' | 'services' | 'types' | 'levels',
    value: string,
  ) => {
    const current = prefs[key]
    patch({
      [key]: current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value],
    })
  }

  const toggleBand = (levels: string[]) => {
    const all = levels.every((level) => prefs.levels.includes(level))
    patch({
      levels: all
        ? prefs.levels.filter((level) => !levels.includes(level))
        : [...new Set([...prefs.levels, ...levels])],
    })
  }

  const apply = async () => {
    setApplying(true)
    const result = await applyPlan(pickedIds, { reserve: reserveIds })
    setApplying(false)

    const parts: string[] = []
    if (result.favorited > 0) parts.push(`${result.favorited} favorited`)
    if (result.reserved > 0) parts.push(`${result.reserved} seat(s) reserved`)
    if (result.failures.length > 0) parts.push(`${result.failures.length} refused`)

    pushToast({
      tone: result.failures.length > 0 ? 'info' : 'success',
      title:
        result.favorited + result.reserved > 0
          ? 'Schedule applied'
          : 'Nothing new to apply',
      detail: parts.join(' · ') || undefined,
    })

    onDone()
    onClose()
  }

  const onPlan = step.key === 'plan'

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={onPlan ? 'max-w-3xl' : 'max-w-2xl'}
      title={
        <span className="inline-flex items-center gap-2">
          <Icon name="spark" className="size-4 text-accent-text" />
          Generate my schedule
        </span>
      }
      footer={
        <>
          {stepIndex > 0 ? (
            <Button onClick={() => setStepIndex((n) => n - 1)} disabled={applying}>
              <Icon name="chevronRight" className="size-3.5 rotate-180" />
              Back
            </Button>
          ) : (
            <Button onClick={() => setStepIndex(STEPS.length - 1)}>
              Skip setup
            </Button>
          )}

          <p className="mr-auto pl-1 text-[11px] leading-tight text-fg-subtle">
            <span className="font-display text-sm font-semibold text-fg-strong">
              {pickedIds.length}
            </span>{' '}
            session{pickedIds.length === 1 ? '' : 's'}
            {onPlan && stats.reservable > 0 ? (
              <span className="block text-fg-faint">
                {reserveIds.size} seat{reserveIds.size === 1 ? '' : 's'} held
              </span>
            ) : (
              ' so far'
            )}
          </p>

          {onPlan ? (
            <Button
              variant="primary"
              onClick={() => void apply()}
              disabled={applying || pickedIds.length === 0}
            >
              {applying ? (
                <Spinner className="size-4" />
              ) : (
                <Icon name="check" className="size-4" />
              )}
              {applying
                ? 'Applying…'
                : reserveIds.size > 0
                  ? `Reserve ${reserveIds.size}, favorite ${pickedIds.length - reserveIds.size}`
                  : `Favorite ${pickedIds.length}`}
            </Button>
          ) : (
            <Button variant="primary" onClick={() => setStepIndex((n) => n + 1)}>
              {stepIndex === STEPS.length - 2 ? 'See my week' : 'Continue'}
              <Icon name="arrowRight" className="size-3.5" />
            </Button>
          )}
        </>
      }
    >

      <div className="mb-5">
        <div className="mb-3 flex gap-1.5">
          {STEPS.map((entry, index) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setStepIndex(index)}
              aria-label={entry.title}
              aria-current={index === stepIndex ? 'step' : undefined}
              className={cx(
                'h-1 flex-1 rounded-full transition',
                index < stepIndex
                  ? 'bg-accent/50'
                  : index === stepIndex
                    ? 'bg-accent'
                    : 'bg-surface-3 hover:bg-line-strong',
              )}
            />
          ))}
        </div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-fg-faint">
          Step {stepIndex + 1} of {STEPS.length}
        </p>
        <h3 className="font-display mt-1 text-xl font-semibold tracking-tight text-fg-strong">
          {step.title}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-fg-muted">{step.hint}</p>
      </div>

      {step.key === 'topics' ? (
        <ChoiceGrid
          options={topicOptions}
          selected={prefs.topics}
          onToggle={(value) => toggle('topics', value)}
          searchLabel="Find a topic…"
          emptyNote="This event does not tag its sessions by topic."
        />
      ) : null}

      {step.key === 'services' ? (
        <ChoiceGrid
          options={serviceOptions}
          selected={prefs.services}
          onToggle={(value) => toggle('services', value)}
          searchLabel="Find a service…"
          emptyNote="This event does not tag its sessions by service."
        />
      ) : null}

      {step.key === 'depth' ? (
        <div className="space-y-5">
          {levelBands.length > 0 ? (
            <section>
              <Label>Depth</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                {levelBands.map((band) => (
                  <BigChoice
                    key={band.key}
                    active={band.levels.every((level) => prefs.levels.includes(level))}
                    icon={band.icon}
                    label={band.label}
                    hint={band.hint}
                    onClick={() => toggleBand(band.levels)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {typeOptions.length > 0 ? (
            <section>
              <Label>Formats</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {typeOptions.map((option) => (
                  <BigChoice
                    key={option.value}
                    active={prefs.types.includes(option.value)}
                    icon={TYPE_ICON[option.value] ?? 'list'}
                    label={option.value}
                    hint={`${option.count.toLocaleString()} sessions`}
                    onClick={() => toggle('types', option.value)}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {step.key === 'pace' ? (
        <div className="space-y-5">
          <section>
            <Label>Days you will be there</Label>
            <div className="flex flex-wrap gap-1.5">
              {days.map((day) => {
                const active = selectedDays.includes(day)
                const label = labelDateKey(day)
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setDaysTouched(true)
                      patch({
                        days: active
                          ? selectedDays.filter((entry) => entry !== day)
                          : [...selectedDays, day],
                      })
                    }}
                    className={cx(
                      'rounded-lg px-2.5 py-1.5 text-[11px] font-bold ring-1 ring-inset transition',
                      active
                        ? 'bg-accent-soft text-accent-text ring-accent-line'
                        : 'bg-surface-2 text-fg-muted ring-line hover:text-fg',
                    )}
                  >
                    {label.weekday} {label.monthDay.replace(/^\w+ /, '')}
                  </button>
                )
              })}
            </div>
          </section>

          <section>
            <Label>Pace</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {PACES.map((pace) => (
                <BigChoice
                  key={pace.key}
                  active={prefs.maxPerDay === pace.maxPerDay}
                  icon={pace.icon}
                  label={pace.label}
                  hint={pace.hint}
                  onClick={() => patch({ maxPerDay: pace.maxPerDay })}
                />
              ))}
            </div>
          </section>

          <section>
            <Label>Hours you will show up for</Label>
            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-fg-muted">
                  From
                </span>
                <input
                  type="time"
                  step={300}
                  value={clockValue(prefs.dayStartMin)}
                  onChange={(changeEvent) => {
                    const minutes = parseClockInput(changeEvent.target.value)
                    if (minutes !== null) patch({ dayStartMin: snapTo5(minutes) })
                  }}
                  className={cx(FIELD, 'w-28 px-3')}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-fg-muted">
                  Until
                </span>
                <input
                  type="time"
                  step={300}
                  value={clockValue(prefs.dayEndMin)}
                  onChange={(changeEvent) => {
                    const minutes = parseClockInput(changeEvent.target.value)
                    if (minutes !== null) patch({ dayEndMin: snapTo5(minutes) })
                  }}
                  className={cx(FIELD, 'w-28 px-3')}
                />
              </label>
              <label className="mb-2 flex cursor-pointer items-center gap-2 text-xs text-fg-muted">
                <input
                  type="checkbox"
                  checked={prefs.protectLunch}
                  onChange={(changeEvent) =>
                    patch({ protectLunch: changeEvent.target.checked })
                  }
                  className="size-4 accent-accent"
                />
                Keep {formatMinutes(prefs.lunchStartMin)}–
                {formatMinutes(prefs.lunchEndMin)} free
              </label>
            </div>
          </section>
        </div>
      ) : null}

      {step.key === 'plan' ? (
        <PlanReview
          plan={plan}
          prefs={effectivePrefs}
          dropped={dropped}
          stats={stats}
          pickedCount={pickedIds.length}
          reserveIds={reserveIds}
          onDrop={(id) => setDropped((current) => new Set(current).add(id))}
          onRestoreAll={() => setDropped(new Set())}
          onLoosen={() => setStepIndex(0)}
          onSetMode={(id, mode) =>
            setFavoriteOnly((current) => {
              const next = new Set(current)
              if (mode === 'reserve') next.delete(id)
              else next.add(id)
              return next
            })
          }
        />
      ) : null}
    </Modal>
  )
}

function Label({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-fg-muted">
      {children}
    </p>
  )
}

function ChoiceGrid({
  options,
  selected,
  onToggle,
  searchLabel,
  emptyNote,
}: {
  options: { value: string; count: number }[]
  selected: string[]
  onToggle: (value: string) => void
  searchLabel: string
  emptyNote: string
}) {
  const [needle, setNeedle] = useState('')
  const [showAll, setShowAll] = useState(false)

  const term = needle.trim().toLowerCase()
  const matching = term
    ? options.filter((option) => option.value.toLowerCase().includes(term))
    : options

  const shown =
    showAll || term
      ? matching
      : [
          ...matching.filter((option) => selected.includes(option.value)),
          ...matching.filter((option) => !selected.includes(option.value)).slice(0, 14),
        ]

  if (options.length === 0) {
    return <p className="text-xs text-fg-subtle">{emptyNote}</p>
  }

  return (
    <div>
      {options.length > 14 ? (
        <div className="relative mb-3">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-fg-faint"
          />
          <input
            value={needle}
            onChange={(inputEvent) => setNeedle(inputEvent.target.value)}
            placeholder={searchLabel}
            aria-label={searchLabel}
            className={cx(FIELD, 'w-full pl-8 pr-3')}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {shown.map((option) => {
          const active = selected.includes(option.value)
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(option.value)}
              className={cx(
                'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs ring-1 ring-inset transition',
                active
                  ? 'bg-accent-soft font-semibold text-accent-text ring-accent-line'
                  : 'bg-surface-2 text-fg-muted ring-line hover:bg-surface-3 hover:text-fg',
              )}
            >
              {active ? <Icon name="check" className="size-3" /> : null}
              {option.value}
              <span className="text-[10px] tabular-nums opacity-60">
                {option.count.toLocaleString()}
              </span>
            </button>
          )
        })}
      </div>

      {!showAll && !term && matching.length > shown.length ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-2.5 text-[11px] font-semibold text-accent-text transition hover:text-accent"
        >
          Show {(matching.length - shown.length).toLocaleString()} more
        </button>
      ) : null}

      {selected.length > 0 ? (
        <p className="mt-3 text-[11px] text-fg-subtle">
          {selected.length} selected
        </p>
      ) : null}
    </div>
  )
}

function BigChoice({
  active,
  icon,
  label,
  hint,
  onClick,
}: {
  active: boolean
  icon: IconName
  label: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-left ring-1 transition',
        active
          ? 'bg-accent-soft ring-accent-line'
          : 'bg-surface-2 ring-line hover:bg-surface-3',
      )}
    >
      <span
        className={cx(
          'mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg transition',
          active ? 'bg-accent text-accent-ink' : 'bg-surface-3 text-fg-muted',
        )}
      >
        <Icon name={icon} className="size-3.5" />
      </span>
      <span className="min-w-0">
        <span
          className={cx(
            'block text-xs font-bold leading-snug',
            active ? 'text-accent-text' : 'text-fg-strong',
          )}
        >
          {label}
        </span>
        <span className="mt-0.5 block text-[10px] text-fg-subtle">{hint}</span>
      </span>
    </button>
  )
}

function PlanReview({
  plan,
  prefs,
  dropped,
  stats,
  pickedCount,
  reserveIds,
  onDrop,
  onRestoreAll,
  onLoosen,
  onSetMode,
}: {
  plan: Plan
  prefs: GeneratePrefs
  dropped: ReadonlySet<string>
  stats: { minutes: number; reservable: number; dayCount: number }
  pickedCount: number
  reserveIds: ReadonlySet<string>
  onDrop: (id: string) => void
  onRestoreAll: () => void
  onLoosen: () => void
  onSetMode: (id: string, mode: 'reserve' | 'favorite') => void
}) {
  if (pickedCount === 0) {
    return (
      <div className="rounded-xl bg-warn-soft px-4 py-8 text-center ring-1 ring-warn-line">
        <Icon name="warning" className="mx-auto mb-2 size-5 text-warn" />
        <p className="text-xs font-bold text-warn">Nothing fits those answers</p>
        <p className="mx-auto mt-1.5 max-w-sm text-[11px] leading-relaxed text-fg-muted">
          Widen the hours, raise the pace, or broaden your interests.
        </p>
        <Button size="sm" onClick={onLoosen} className="mt-3">
          <Icon name="chevronRight" className="size-3.5 rotate-180" />
          Back to the start
        </Button>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <Stat value={pickedCount} label="sessions" tone="text-accent-text" />
        <Stat
          value={stats.minutes === 0 ? '—' : formatDuration(stats.minutes)}
          label="of content"
          tone="text-fg-strong"
        />
        <Stat
          value={stats.dayCount}
          label={stats.dayCount === 1 ? 'day' : 'days'}
          tone="text-plan-personal"
        />
      </div>

      {dropped.size > 0 ? (
        <button
          type="button"
          onClick={onRestoreAll}
          className="mb-2.5 inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1.5 text-[11px] font-medium text-fg-muted ring-1 ring-line transition hover:text-fg-strong"
        >
          <Icon name="refresh" className="size-3" />
          {dropped.size} removed — put {dropped.size === 1 ? 'it' : 'them'} back
        </button>
      ) : null}

      <ul className="space-y-3">
        {plan.days.map((day) => {
          const items = day.items.filter(
            (item) => !dropped.has(item.view.session.sessionId),
          )
          const label = labelDateKey(day.dateKey)
          const dayMinutes = items.reduce(
            (sum, item) => sum + ((item.view.endMin ?? 0) - (item.view.startMin ?? 0)),
            0,
          )

          return (
            <li key={day.dateKey} className="panel rounded-xl p-3">
              <div className="mb-2 flex items-baseline gap-2">
                <h4 className="font-display text-sm font-semibold text-fg-strong">
                  {label.weekday}
                </h4>
                <span className="text-[11px] text-fg-subtle">{label.monthDay}</span>
                <span className="ml-auto text-[11px] font-semibold tabular-nums text-fg-muted">
                  {items.length === 0 ? 'nothing' : formatDuration(dayMinutes)}
                </span>
              </div>

              <DayBar
                windowStart={prefs.dayStartMin}
                windowEnd={prefs.dayEndMin}
                picks={items.map((item) => ({
                  startMin: item.view.startMin ?? 0,
                  endMin: item.view.endMin ?? 0,
                }))}
                busy={day.busy}
              />

              {items.length === 0 ? (
                <p className="mt-2 text-[11px] text-fg-subtle">No session fit this day.</p>
              ) : (
                <ol className="mt-2.5 space-y-1">
                  {items.map((item) => (
                    <li
                      key={item.view.session.sessionId}
                      className="group flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-surface-2"
                    >
                      <span className="w-14 shrink-0 pt-0.5 tabular-nums">
                        <span className="block text-[11px] font-bold text-fg-strong">
                          {formatMinutes(item.view.startMin ?? 0)}
                        </span>
                        <span className="block text-[10px] text-fg-faint">
                          {formatDuration(
                            (item.view.endMin ?? 0) - (item.view.startMin ?? 0),
                          )}
                        </span>
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          {item.view.session.abbreviation ? (
                            <span className="font-mono text-[10px] font-bold text-accent-text">
                              {item.view.session.abbreviation}
                            </span>
                          ) : null}
                          {item.view.session.isReservable ? (
                            <ModeToggle
                              reserving={reserveIds.has(item.view.session.sessionId)}
                              onChange={(mode) =>
                                onSetMode(item.view.session.sessionId, mode)
                              }
                            />
                          ) : (
                            <span
                              className="text-[9px] font-bold uppercase tracking-wider text-fg-faint"
                              title="This session does not take reservations, so it can only be favorited"
                            >
                              favorite only
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs font-medium leading-snug text-fg">
                          {item.view.session.title}
                        </span>
                        {item.reasons.length > 0 ? (
                          <span className="mt-1 flex flex-wrap gap-1">
                            {item.reasons.map((reason) => (
                              <span
                                key={reason}
                                className="rounded bg-surface-2 px-1.5 py-0.5 text-[9px] font-medium text-fg-subtle ring-1 ring-inset ring-line"
                              >
                                {reason}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </span>

                      <button
                        type="button"
                        onClick={() => onDrop(item.view.session.sessionId)}
                        aria-label={`Remove ${item.view.session.title}`}
                        title="Remove from this plan"
                        className="shrink-0 rounded-md p-1 text-fg-faint opacity-0 transition hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <Icon name="close" className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          )
        })}
      </ul>

      <Diagnostics plan={plan} />

      <p className="mt-3 text-[10px] leading-relaxed text-fg-subtle">
        Every pick is favorited so it lands on your calendar. Anything marked{' '}
        <span className="font-semibold text-accent-text">Reserve</span> also holds a
        real seat — that seat comes out of the event's allocation. Switch a session to{' '}
        <span className="font-semibold text-fg-muted">Favorite</span> to keep it on your
        calendar without taking one.
      </p>
    </div>
  )
}

function ModeToggle({
  reserving,
  onChange,
}: {
  reserving: boolean
  onChange: (mode: 'reserve' | 'favorite') => void
}) {
  return (
    <span className="inline-flex overflow-hidden rounded-md ring-1 ring-inset ring-line">
      <button
        type="button"
        aria-pressed={reserving}
        onClick={() => onChange('reserve')}
        title="Hold a real seat"
        className={cx(
          'inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider transition',
          reserving
            ? 'bg-accent text-accent-ink'
            : 'text-fg-faint hover:bg-surface-3 hover:text-fg-muted',
        )}
      >
        <Icon name="ticket" className="size-2.5" />
        Reserve
      </button>
      <button
        type="button"
        aria-pressed={!reserving}
        onClick={() => onChange('favorite')}
        title="Keep it on the calendar without taking a seat"
        className={cx(
          'inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider transition',
          reserving
            ? 'text-fg-faint hover:bg-surface-3 hover:text-fg-muted'
            : 'bg-plan-favorite-soft text-plan-favorite',
        )}
      >
        <Icon name="starFilled" className="size-2.5" />
        Favorite
      </button>
    </span>
  )
}

function Stat({
  value,
  label,
  tone,
}: {
  value: number | string
  label: string
  tone: string
}) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2 ring-1 ring-line">
      <p
        className={cx('font-display text-xl font-semibold leading-none tabular-nums', tone)}
      >
        {value}
      </p>
      <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-fg-subtle">
        {label}
      </p>
    </div>
  )
}

function DayBar({
  windowStart,
  windowEnd,
  picks,
  busy,
}: {
  windowStart: number
  windowEnd: number
  picks: { startMin: number; endMin: number }[]
  busy: Span[]
}) {
  const span = Math.max(1, windowEnd - windowStart)
  const place = (from: number, to: number) => ({
    left: `${(Math.max(0, from - windowStart) / span) * 100}%`,
    width: `${(Math.max(0, Math.min(to, windowEnd) - Math.max(from, windowStart)) / span) * 100}%`,
  })

  return (
    <div className="relative h-3 overflow-hidden rounded-full bg-surface-3">
      {busy.map((block, index) => (
        <span
          key={`busy-${index}`}
          className="absolute inset-y-0 bg-plan-personal/35"
          style={place(block.startMin, block.endMin)}
          title="Already committed"
        />
      ))}
      {picks.map((pick, index) => (
        <span
          key={`pick-${index}`}
          className="absolute inset-y-0 rounded-sm bg-accent"
          style={place(pick.startMin, pick.endMin)}
        />
      ))}
    </div>
  )
}

function Diagnostics({ plan }: { plan: Plan }) {
  const [open, setOpen] = useState(false)

  const rows = [
    { label: 'matched but did not fit', value: plan.totalPassedOver },
    { label: 'that time was already committed', value: plan.excluded.alreadyScheduled },
    { label: 'outside your hours', value: plan.excluded.outsideWindow },
    { label: 'no published time slot', value: plan.excluded.noTimeSlot },
    { label: 'full', value: plan.excluded.full },
    { label: 'matched none of your interests', value: plan.excluded.noMatch },
  ].filter((row) => row.value > 0)

  if (rows.length === 0) return null

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-fg-subtle transition hover:text-fg"
      >
        <Icon name={open ? 'chevronDown' : 'chevronRight'} className="size-3" />
        Why {rows.reduce((sum, row) => sum + row.value, 0).toLocaleString()} others were
        left out
      </button>
      {open ? (
        <ul className="mt-1.5 space-y-0.5 pl-4">
          {rows.map((row) => (
            <li key={row.label} className="text-[11px] text-fg-subtle">
              <span className="font-semibold tabular-nums text-fg-muted">
                {row.value.toLocaleString()}
              </span>{' '}
              {row.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
