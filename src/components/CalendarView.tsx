import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import type { PersonalTime, PersonalTimeInput } from '../api/types'
import { layoutSpans, overlaps, unionMinutes } from '../lib/layout'
import type { Layers } from '../lib/plan'
import { describeSlot } from '../lib/sessions'
import type { SessionView } from '../lib/sessions'
import {
  clamp,
  currentSlot,
  formatDuration,
  formatMinutes,
  labelDateKey,
  localSlotToUtcNaive,
  snapTo5,
  utcNaiveToLocalSlot,
} from '../lib/time'
import type { DateKey } from '../lib/time'
import { cx } from '../lib/styles'
import { useApp } from '../store/appContext'
import { PersonalTimeDialog } from './PersonalTimeDialog'
import type { DraftBlock } from './PersonalTimeDialog'
import { SessionDetail } from './SessionDetail'
import { Badge, Button, EmptyState, Icon } from './ui'

const PX_PER_MIN = 1.15

const MIN_BLOCK_MIN = 5
const DEFAULT_START_MIN = 6 * 60
const DEFAULT_END_MIN = 23 * 60

const CLICK_SUPPRESS_MS = 300

const LOAD_BASELINE_MIN = 6 * 60

const DEFAULT_TITLE = 'Personal time'
const DEFAULT_DESCRIPTION = 'Blocked on my re:Invent schedule.'

type Kind = 'reserved' | 'favorite' | 'personal'

interface Entry {
  key: string
  kind: Kind
  startMin: number
  endMin: number
  title: string
  subtitle?: string
  sessionId?: string
  personal?: PersonalTime
  split?: boolean
}

type DragMode = 'create' | 'move' | 'resize-start' | 'resize-end'

interface DragState {
  mode: DragMode
  dateKey: DateKey
  anchorDateKey: DateKey
  startMin: number
  endMin: number
  anchorMin: number
  personal?: PersonalTime
  moved: boolean
}

export function CalendarView({ layers }: { layers: Layers }) {
  const {
    days,
    timeZone,
    byId,
    reserved,
    favorites,
    personalTime,
    addPersonalTime,
    editPersonalTime,
    removePersonalTime,
  } = useApp()

  const [drag, setDragState] = useState<DragState | null>(null)
  const [draft, setDraft] = useState<DraftBlock | null>(null)
  const [saving, setSaving] = useState(false)
  const [openSessionId, setOpenSessionId] = useState<string | null>(null)

  const columnsRef = useRef<HTMLDivElement>(null)
  const lastDragEnd = useRef(0)

  const [minuteTick, setMinuteTick] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => {
      setMinuteTick((n) => n + 1)
    }, 60_000)
    return () => {
      window.clearInterval(timer)
    }
  }, [])
  const nowSlot = useMemo(() => {
    void minuteTick
    return currentSlot(timeZone)
  }, [timeZone, minuteTick])

  const dragRef = useRef<DragState | null>(null)
  const setDrag = useCallback((next: DragState | null) => {
    dragRef.current = next
    setDragState(next)
  }, [])
  const dragging = drag !== null

  const entriesByDay = useMemo(() => {
    const map = new Map<DateKey, Entry[]>()
    for (const day of days) map.set(day, [])

    const push = (day: DateKey, entry: Entry) => {
      map.get(day)?.push(entry)
    }

    const addSession = (view: SessionView, kind: Kind) => {
      if (!view.dateKey || view.startMin === undefined || view.isAllDay) return
      push(view.dateKey, {
        key: `${kind}:${view.session.sessionId}`,
        kind,
        startMin: view.startMin,
        endMin: view.endMin ?? view.startMin + 60,
        title: view.session.title,
        subtitle:
          [view.session.abbreviation, view.session.room].filter(Boolean).join(' · ') ||
          undefined,
        sessionId: view.session.sessionId,
      })
    }

    if (layers.reserved) {
      for (const id of reserved) {
        const view = byId.get(id)
        if (view) addSession(view, 'reserved')
      }
    }

    if (layers.favorite) {
      for (const id of favorites) {
        if (layers.reserved && reserved.has(id)) continue
        const view = byId.get(id)
        if (view) addSession(view, 'favorite')
      }
    }

    if (layers.personal) {
      for (const block of personalTime) {
        const start = utcNaiveToLocalSlot(block.startDateTime, timeZone)
        const end = utcNaiveToLocalSlot(block.endDateTime, timeZone)
        if (!start || !end) continue

        if (start.dateKey === end.dateKey) {
          push(start.dateKey, {
            key: `personal:${block.personalTimeId}`,
            kind: 'personal',
            startMin: start.minutes,
            endMin: Math.max(end.minutes, start.minutes + MIN_BLOCK_MIN),
            title: block.title,
            subtitle: block.location,
            personal: block,
          })
        } else {
          push(start.dateKey, {
            key: `personal:${block.personalTimeId}:a`,
            kind: 'personal',
            startMin: start.minutes,
            endMin: 1440,
            title: block.title,
            subtitle: block.location,
            personal: block,
            split: true,
          })
          push(end.dateKey, {
            key: `personal:${block.personalTimeId}:b`,
            kind: 'personal',
            startMin: 0,
            endMin: Math.max(end.minutes, MIN_BLOCK_MIN),
            title: block.title,
            subtitle: block.location,
            personal: block,
            split: true,
          })
        }
      }
    }

    return map
  }, [days, timeZone, byId, reserved, favorites, personalTime, layers])

  const [windowStart, windowEnd] = useMemo(() => {
    let min = DEFAULT_START_MIN
    let max = DEFAULT_END_MIN
    for (const entries of entriesByDay.values()) {
      for (const entry of entries) {
        min = Math.min(min, Math.floor(entry.startMin / 60) * 60)
        max = Math.max(max, Math.ceil(entry.endMin / 60) * 60)
      }
    }
    return [clamp(min, 0, 1380), clamp(max, 60, 1440)]
  }, [entriesByDay])

  const gridHeight = (windowEnd - windowStart) * PX_PER_MIN

  const minutesFromClientY = useCallback(
    (clientY: number): number => {
      const rect = columnsRef.current?.getBoundingClientRect()
      if (!rect) return windowStart

      const raw = windowStart + (clientY - rect.top) / PX_PER_MIN
      return clamp(snapTo5(raw), windowStart, windowEnd)
    },
    [windowStart, windowEnd],
  )

  const dayFromClientX = useCallback(
    (clientX: number): DateKey | null => {
      const rect = columnsRef.current?.getBoundingClientRect()
      if (!rect || days.length === 0) return null
      const index = Math.floor(((clientX - rect.left) / rect.width) * days.length)
      return days[clamp(index, 0, days.length - 1)] ?? null
    },
    [days],
  )

  const dragDays = useCallback(
    (state: DragState): DateKey[] => {
      if (state.mode !== 'create') return [state.dateKey]
      const from = days.indexOf(state.anchorDateKey)
      const to = days.indexOf(state.dateKey)
      if (from === -1 || to === -1) return [state.dateKey]
      const [lo, hi] = from <= to ? [from, to] : [to, from]
      return days.slice(lo, hi + 1)
    },
    [days],
  )

  const moving = useMemo(() => {
    const block = drag?.personal
    if (!block) return null
    for (const [day, entries] of entriesByDay) {
      for (const entry of entries) {
        if (entry.personal?.personalTimeId === block.personalTimeId && !entry.split) {
          return { entry, homeDay: day }
        }
      }
    }
    return null
  }, [drag?.personal, entriesByDay])

  const persistMove = useCallback(
    async (block: PersonalTime, dateKey: DateKey, startMin: number, endMin: number) => {
      await editPersonalTime(block.personalTimeId, {
        startDateTime: localSlotToUtcNaive(dateKey, startMin, timeZone),
        endDateTime: localSlotToUtcNaive(dateKey, endMin, timeZone),
        title: block.title,
        description: block.description,
        ...(block.location ? { location: block.location } : {}),
      })
    },
    [editPersonalTime, timeZone],
  )

  useEffect(() => {
    if (!dragging) return

    const onMove = (event: PointerEvent) => {
      const current = dragRef.current
      if (!current) return
      event.preventDefault()

      const minute = minutesFromClientY(event.clientY)

      if (current.mode === 'create') {
        setDrag({
          ...current,
          dateKey: dayFromClientX(event.clientX) ?? current.dateKey,
          startMin: Math.min(current.anchorMin, minute),
          endMin: Math.max(current.anchorMin, minute),
          moved: true,
        })
      } else if (current.mode === 'move') {
        const length = current.endMin - current.startMin
        const start = snapTo5(
          clamp(minute - current.anchorMin, windowStart, windowEnd - length),
        )
        setDrag({
          ...current,
          dateKey: dayFromClientX(event.clientX) ?? current.dateKey,
          startMin: start,
          endMin: start + length,
          moved: true,
        })
      } else if (current.mode === 'resize-start') {
        setDrag({
          ...current,
          startMin: Math.min(minute, current.endMin - MIN_BLOCK_MIN),
          moved: true,
        })
      } else {
        setDrag({
          ...current,
          endMin: Math.max(minute, current.startMin + MIN_BLOCK_MIN),
          moved: true,
        })
      }
    }

    const onUp = () => {
      const current = dragRef.current
      setDrag(null)
      if (!current) return
      if (current.moved) lastDragEnd.current = performance.now()

      if (current.mode === 'create') {
        if (!current.moved || current.endMin - current.startMin < MIN_BLOCK_MIN) return
        setDraft({
          dateKeys: dragDays(current),
          startMin: current.startMin,
          endMin: current.endMin,
          title: DEFAULT_TITLE,
          description: DEFAULT_DESCRIPTION,
          location: '',
        })
        return
      }

      const block = current.personal
      if (!block || !current.moved) return

      const original = utcNaiveToLocalSlot(block.startDateTime, timeZone)
      const originalEnd = utcNaiveToLocalSlot(block.endDateTime, timeZone)
      const unchanged =
        original?.dateKey === current.dateKey &&
        original?.minutes === current.startMin &&
        originalEnd?.minutes === current.endMin
      if (unchanged) return

      void persistMove(block, current.dateKey, current.startMin, current.endMin)
    }

    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [
    dragging,
    setDrag,
    minutesFromClientY,
    dayFromClientX,
    windowStart,
    windowEnd,
    persistMove,
    timeZone,
    dragDays,
  ])

  const beginCreate = (dateKey: DateKey, clientY: number) => {
    const minute = minutesFromClientY(clientY)
    setDrag({
      mode: 'create',
      dateKey,
      anchorDateKey: dateKey,
      startMin: minute,
      endMin: minute,
      anchorMin: minute,
      moved: false,
    })
  }

  const beginBlockDrag = useCallback(
    (
      mode: 'move' | 'resize-start' | 'resize-end',
      entry: Entry,
      dateKey: DateKey,
      clientY: number,
    ) => {
      if (!entry.personal || entry.split) return
      setDrag({
        mode,
        dateKey,
        anchorDateKey: dateKey,
        startMin: entry.startMin,
        endMin: entry.endMin,
        anchorMin: minutesFromClientY(clientY) - entry.startMin,
        personal: entry.personal,
        moved: false,
      })
    },
    [minutesFromClientY, setDrag],
  )

  const wasJustDragging = () =>
    performance.now() - lastDragEnd.current < CLICK_SUPPRESS_MS

  const activate = useCallback(
    (entry: Entry, dateKey: DateKey) => {
      if (wasJustDragging()) return
      if (entry.kind === 'personal') {
        if (!entry.personal) return
        const start = utcNaiveToLocalSlot(entry.personal.startDateTime, timeZone)
        const end = utcNaiveToLocalSlot(entry.personal.endDateTime, timeZone)
        setDraft({
          personalTimeId: entry.personal.personalTimeId,
          dateKeys: [start?.dateKey ?? dateKey],
          startMin: start?.minutes ?? entry.startMin,
          endMin: end?.minutes ?? entry.endMin,
          title: entry.personal.title,
          description: entry.personal.description,
          location: entry.personal.location ?? '',
        })
      } else if (entry.sessionId) {
        setOpenSessionId(entry.sessionId)
      }
    },
    [timeZone],
  )

  const submitDraft = async (id: string | undefined, inputs: PersonalTimeInput[]) => {
    setSaving(true)

    const ok = id ? await editPersonalTime(id, inputs[0]) : await addPersonalTime(inputs)
    setSaving(false)
    if (ok) setDraft(null)
  }

  const deleteDraft = async (id: string) => {
    setSaving(true)
    const ok = await removePersonalTime(id)
    setSaving(false)
    if (ok) setDraft(null)
  }

  const conflictKeys = useMemo(() => {
    const flagged = new Set<string>()
    for (const entries of entriesByDay.values()) {
      const reservations = entries.filter((entry) => entry.kind === 'reserved')
      for (let i = 0; i < reservations.length; i += 1) {
        for (let j = i + 1; j < reservations.length; j += 1) {
          if (overlaps(reservations[i], reservations[j])) {
            flagged.add(reservations[i].key)
            flagged.add(reservations[j].key)
          }
        }
      }
    }
    return flagged
  }, [entriesByDay])

  const loadByDay = useMemo(() => {
    const out = new Map<DateKey, number>()
    for (const day of days) {
      out.set(day, unionMinutes(entriesByDay.get(day) ?? []))
    }
    return out
  }, [days, entriesByDay])

  const loadPeak = useMemo(
    () => Math.max(LOAD_BASELINE_MIN, ...loadByDay.values()),
    [loadByDay],
  )

  const weekTotalMin = useMemo(
    () => [...loadByDay.values()].reduce((sum, minutes) => sum + minutes, 0),
    [loadByDay],
  )

  const busiest = useMemo(() => {
    let best: { day: DateKey; minutes: number } | null = null
    for (const [day, minutes] of loadByDay) {
      if (minutes > 0 && (!best || minutes > best.minutes)) best = { day, minutes }
    }
    return best
  }, [loadByDay])

  const unscheduled = useMemo(() => {
    const out: { view: SessionView; kind: Kind }[] = []
    for (const id of reserved) {
      const view = byId.get(id)
      if (view && (view.startMin === undefined || view.isAllDay)) {
        out.push({ view, kind: 'reserved' })
      }
    }
    for (const id of favorites) {
      if (reserved.has(id)) continue
      const view = byId.get(id)
      if (view && (view.startMin === undefined || view.isAllDay)) {
        out.push({ view, kind: 'favorite' })
      }
    }
    return out
  }, [reserved, favorites, byId])

  const hourMarks = useMemo(() => {
    const marks: number[] = []
    for (let minute = windowStart; minute <= windowEnd; minute += 60) marks.push(minute)
    return marks
  }, [windowStart, windowEnd])

  if (days.length === 0) {
    return (
      <EmptyState
        icon="calendar"
        title="Event dates unavailable"
        detail="The event record did not include a usable date range."
      />
    )
  }

  const totalEntries = [...entriesByDay.values()].reduce(
    (sum, entries) => sum + entries.length,
    0,
  )

  const openDraftFor = (dateKey: DateKey, startMin: number, endMin: number) => {
    setDraft({
      dateKeys: [dateKey],
      startMin,
      endMin,
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
      location: '',
    })
  }

  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 pb-12 pt-4">
      <div className="flex flex-col gap-5 xl:flex-row">

        <div className="min-w-0 flex-1">

          <div className="rounded-2xl border border-line bg-surface-1">

            <div
              className="lit-bar sticky z-20 flex overflow-hidden rounded-t-2xl"
              style={{ top: 'var(--deck-h, 12rem)' }}
            >
              <div className="relative z-10 w-14 shrink-0 border-r border-line" />
              {days.map((day) => {
                const label = labelDateKey(day)
                const minutes = loadByDay.get(day) ?? 0
                const today = day === nowSlot.dateKey
                return (
                  <div
                    key={day}
                    className={cx(
                      'relative z-10 min-w-0 flex-1 border-r border-line px-2 pb-2 pt-2.5 text-center last:border-r-0',
                      today && 'bg-accent-soft/50',
                    )}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent-text">
                      {label.weekday}
                    </p>
                    <p className="font-display text-2xl font-semibold leading-none tracking-tight text-fg-strong">
                      {label.monthDay.replace(/^\w+ /, '')}
                    </p>

                    <span className="mx-auto mt-1.5 block h-0.5 w-10 overflow-hidden rounded-full bg-line">
                      <span
                        className="block h-full rounded-full bg-accent"
                        style={{ width: `${Math.min(100, (minutes / loadPeak) * 100)}%` }}
                      />
                    </span>
                    <p className="mt-1 text-[10px] font-semibold tabular-nums text-fg-subtle">
                      {minutes === 0 ? 'free' : formatDuration(minutes)}
                    </p>
                  </div>
                )
              })}
              <span aria-hidden="true" className="hero-rail z-20" />
            </div>

            <div className="flex overflow-hidden rounded-b-2xl">

              <div
                className="relative w-14 shrink-0 border-r border-line"
                style={{ height: gridHeight }}
              >
                {hourMarks.map((minute) => (
                  <div
                    key={minute}
                    className="absolute right-1.5 -translate-y-1/2 text-[10px] font-semibold tabular-nums text-fg-faint"
                    style={{ top: (minute - windowStart) * PX_PER_MIN }}
                  >
                    {formatMinutes(minute)}
                  </div>
                ))}
              </div>

              <div ref={columnsRef} className="no-select relative flex flex-1">
                {days.map((day) => {
                  const placed = layoutSpans(entriesByDay.get(day) ?? [])
                  const ghostVisible =
                    drag?.mode === 'create' && drag.moved && dragDays(drag).includes(day)

                  return (
                    <div
                      key={day}
                      className="cal-col relative min-w-0 flex-1 border-r border-line last:border-r-0"
                      style={{ height: gridHeight }}
                      onPointerDown={(event) => {
                        if (event.target !== event.currentTarget || event.button !== 0)
                          return
                        event.preventDefault()
                        beginCreate(day, event.clientY)
                      }}
                    >

                      {hourMarks.map((minute) => (
                        <div key={minute}>
                          <div
                            className="pointer-events-none absolute inset-x-0 border-t border-line"
                            style={{ top: (minute - windowStart) * PX_PER_MIN }}
                          />
                          <div
                            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-line/60"
                            style={{ top: (minute + 30 - windowStart) * PX_PER_MIN }}
                          />
                        </div>
                      ))}

                      {placed.map(({ item, column, columns }) => {
                        const isDragged =
                          drag?.personal !== undefined &&
                          item.personal?.personalTimeId ===
                            drag.personal.personalTimeId &&
                          !item.split

                        if (isDragged && drag.dateKey !== day) return null

                        const startMin = isDragged ? drag.startMin : item.startMin
                        const endMin = isDragged ? drag.endMin : item.endMin

                        return (
                          <CalendarBlock
                            key={item.key}
                            entry={item}
                            dateKey={day}
                            top={(startMin - windowStart) * PX_PER_MIN}
                            height={Math.max(
                              (endMin - startMin) * PX_PER_MIN,
                              MIN_BLOCK_MIN * PX_PER_MIN,
                            )}
                            displayStartMin={startMin}
                            displayEndMin={endMin}
                            column={column}
                            columns={columns}
                            conflicted={conflictKeys.has(item.key)}
                            dragging={isDragged}
                            onActivate={activate}
                            onDragStart={beginBlockDrag}
                          />
                        )
                      })}

                      {drag?.mode === 'move' &&
                      moving &&
                      drag.dateKey === day &&
                      moving.homeDay !== day ? (
                        <CalendarBlock
                          entry={moving.entry}
                          dateKey={day}
                          top={(drag.startMin - windowStart) * PX_PER_MIN}
                          height={Math.max(
                            (drag.endMin - drag.startMin) * PX_PER_MIN,
                            MIN_BLOCK_MIN * PX_PER_MIN,
                          )}
                          displayStartMin={drag.startMin}
                          displayEndMin={drag.endMin}
                          column={0}
                          columns={1}
                          conflicted={false}
                          dragging
                          onActivate={activate}
                          onDragStart={beginBlockDrag}
                        />
                      ) : null}

                      {day === nowSlot.dateKey &&
                      nowSlot.minutes >= windowStart &&
                      nowSlot.minutes <= windowEnd ? (
                        <span
                          aria-hidden="true"
                          className="now-line"
                          style={{ top: (nowSlot.minutes - windowStart) * PX_PER_MIN }}
                        />
                      ) : null}

                      {ghostVisible ? (
                        <div
                          className="drag-ghost pointer-events-none absolute inset-x-1 z-20 rounded-lg px-2 py-1"
                          style={{
                            top: (drag.startMin - windowStart) * PX_PER_MIN,
                            height: Math.max(
                              (drag.endMin - drag.startMin) * PX_PER_MIN,
                              16,
                            ),
                          }}
                        >
                          <p className="truncate text-[10px] font-bold text-fg-strong">
                            {formatMinutes(drag.startMin)} – {formatMinutes(drag.endMin)}
                          </p>
                          <p className="truncate text-[10px] font-medium text-fg-strong/70">
                            {formatDuration(drag.endMin - drag.startMin)}
                            {dragDays(drag).length > 1
                              ? ` · ${dragDays(drag).length} days`
                              : ''}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        <aside className="w-full shrink-0 xl:sticky xl:w-[19rem] xl:self-start"
          style={{ top: 'calc(var(--deck-h, 12rem) + 1.25rem)' }}>
          <div className="flex flex-col gap-3">

            <Button
              variant="primary"
              onClick={() => openDraftFor(days[0], 12 * 60, 13 * 60)}
              className="w-full rounded-2xl py-2.5"
            >
              <Icon name="plus" className="size-4" />
              Add a personal block
            </Button>

            <RailCard>
              <RailHeading>Your week</RailHeading>
              <div className="grid grid-cols-3 gap-2">
                <Stat value={reserved.size} label="seats" tone="text-accent-text" />
                <Stat
                  value={favorites.size}
                  label="starred"
                  tone="text-plan-favorite"
                />
                <Stat
                  value={personalTime.length}
                  label="blocks"
                  tone="text-plan-personal"
                />
              </div>
            </RailCard>

            <RailCard>
              <RailHeading>Load by day</RailHeading>
              <ul className="space-y-1.5">
                {days.map((day) => {
                  const label = labelDateKey(day)
                  const minutes = loadByDay.get(day) ?? 0
                  return (
                    <li key={day} className="flex items-center gap-2">
                      <span className="w-12 shrink-0 text-[11px] font-semibold text-fg-muted">
                        {label.weekday} {label.monthDay.replace(/^\w+ /, '')}
                      </span>
                      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-3">
                        <span
                          className="block h-full rounded-full bg-gradient-to-r from-accent-hover to-accent transition-[width] duration-300"
                          style={{ width: `${(minutes / loadPeak) * 100}%` }}
                        />
                      </span>
                      <span className="w-11 shrink-0 text-right text-[11px] font-semibold tabular-nums text-fg-subtle">
                        {minutes === 0 ? '—' : formatDuration(minutes)}
                      </span>
                    </li>
                  )
                })}
              </ul>
              {busiest ? (
                <p className="mt-3 border-t border-line pt-2.5 text-[11px] leading-relaxed text-fg-subtle">
                  Heaviest day is{' '}
                  <span className="font-semibold text-fg">
                    {labelDateKey(busiest.day).weekday}
                  </span>{' '}
                  at{' '}
                  <span className="font-semibold text-fg">
                    {formatDuration(busiest.minutes)}
                  </span>
                  {' · '}
                  {formatDuration(weekTotalMin)} in total.
                </p>
              ) : null}
            </RailCard>

            {conflictKeys.size > 0 ? (
              <div className="flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2.5 text-xs text-danger ring-1 ring-danger-line">
                <Icon name="warning" className="mt-0.5 size-4 shrink-0" />
                <span>
                  <span className="font-bold">{conflictKeys.size} reserved sessions</span>{' '}
                  overlap. They are outlined in red on the grid.
                </span>
              </div>
            ) : null}

            {totalEntries === 0 ? (
              <div className="rounded-xl bg-info-soft px-3 py-2.5 text-xs leading-relaxed text-info ring-1 ring-info-line">
                Nothing on your schedule yet. Reserve or favorite sessions in the
                catalog, or drag out a block on the grid.
              </div>
            ) : null}

            {unscheduled.length > 0 ? (
              <RailCard>
                <RailHeading>
                  No fixed time
                  <Badge>{unscheduled.length}</Badge>
                </RailHeading>
                <ul className="space-y-1">
                  {unscheduled.map(({ view, kind }) => (
                    <li key={view.session.sessionId}>
                      <button
                        type="button"
                        onClick={() => setOpenSessionId(view.session.sessionId)}
                        className="w-full rounded-lg px-2 py-1.5 text-left transition hover:bg-surface-2"
                      >
                        <span className="flex items-center gap-1.5">
                          <span
                            className={cx(
                              'size-1.5 shrink-0 rounded-full',
                              kind === 'reserved' ? 'bg-accent' : 'bg-plan-favorite',
                            )}
                          />
                          <span className="font-mono text-[10px] font-bold text-accent-text">
                            {view.session.abbreviation ?? '—'}
                          </span>
                          <span className="ml-auto text-[10px] text-fg-faint">
                            {describeSlot(view) ?? 'TBA'}
                          </span>
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-[11px] font-medium text-fg">
                          {view.session.title}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </RailCard>
            ) : null}

            <RailCard>
              <RailHeading>Legend</RailHeading>
              <ul className="space-y-1.5 text-[11px] text-fg-muted">
                <LegendRow kind="reserved" label="Reserved — seat held" />
                <LegendRow kind="favorite" label="Favorite — no seat held" />
                <LegendRow kind="personal" label="Your own time" />
              </ul>
              <div className="mt-3 space-y-1.5 border-t border-line pt-3 text-[11px] leading-relaxed text-fg-subtle">
                <p>
                  <span className="font-semibold text-fg-muted">Drag an empty slot</span>{' '}
                  to block personal time.
                </p>
                <p>
                  <span className="font-semibold text-fg-muted">Drag sideways</span> to
                  repeat it across days.
                </p>
                <p>
                  <span className="font-semibold text-fg-muted">Grab an edge</span> to
                  resize · click a block to edit.
                </p>
              </div>
            </RailCard>
          </div>
        </aside>
      </div>

      <PersonalTimeDialog
        draft={draft}
        days={days}
        timeZone={timeZone}
        busy={saving}
        onClose={() => setDraft(null)}
        onSubmit={(id, inputs) => void submitDraft(id, inputs)}
        onDelete={(id) => void deleteDraft(id)}
      />

      <SessionDetail
        view={openSessionId ? byId.get(openSessionId) : undefined}
        onClose={() => setOpenSessionId(null)}
      />
    </div>
  )
}

function RailCard({ children }: { children: ReactNode }) {
  return <section className="panel rounded-2xl p-3.5">{children}</section>
}

function RailHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-fg-muted">
      {children}
    </h3>
  )
}

function Stat({
  value,
  label,
  tone,
}: {
  value: number
  label: string
  tone: string
}) {
  return (
    <div className="rounded-xl bg-surface-2 px-2 py-2 text-center ring-1 ring-line">
      <p
        className={cx(
          'font-display text-2xl font-semibold leading-none tabular-nums',
          tone,
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
        {label}
      </p>
    </div>
  )
}

function LegendRow({ kind, label }: { kind: Kind; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={cx(
          'relative h-5 w-8 shrink-0 overflow-hidden rounded ring-1',
          KIND_STYLE[kind],
        )}
      >
        <span aria-hidden="true" className={cx('cal-rail', KIND_RAIL[kind])} />
      </span>
      {label}
    </li>
  )
}

const KIND_STYLE: Record<Kind, string> = {
  reserved: 'bg-accent-soft text-accent-text ring-accent-line',
  favorite: 'bg-plan-favorite-soft text-plan-favorite ring-plan-favorite/30',
  personal: 'bg-plan-personal-soft text-plan-personal ring-plan-personal/30',
}

const KIND_RAIL: Record<Kind, string> = {
  reserved: 'cal-rail-solid bg-accent',
  favorite: 'cal-rail-dashed bg-plan-favorite',
  personal: 'cal-rail-thin bg-plan-personal',
}

interface BlockProps {
  entry: Entry
  dateKey: DateKey
  top: number
  height: number
  displayStartMin: number
  displayEndMin: number
  column: number
  columns: number
  conflicted: boolean
  dragging: boolean
  onActivate: (entry: Entry, dateKey: DateKey) => void
  onDragStart: (
    mode: 'move' | 'resize-start' | 'resize-end',
    entry: Entry,
    dateKey: DateKey,
    clientY: number,
  ) => void
}

const CalendarBlock = memo(function CalendarBlock({
  entry,
  dateKey,
  top,
  height,
  displayStartMin,
  displayEndMin,
  column,
  columns,
  conflicted,
  dragging,
  onActivate,
  onDragStart,
}: BlockProps) {
  const draggable = entry.kind === 'personal' && !entry.split
  const compact = height < 34
  const roomy = height >= 58

  return (
    <div
      className={cx(
        'cal-block absolute z-10 overflow-hidden rounded-lg py-1 pl-2.5 pr-1.5 shadow-sm ring-1 transition-shadow',
        KIND_STYLE[entry.kind],
        conflicted && 'ring-2 ring-danger',
        dragging && 'z-30 opacity-95 shadow-xl',
        draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
      )}
      style={{
        top,
        height,
        width: `calc(${100 / columns}% - 4px)`,
        left: `calc(${(column * 100) / columns}% + 2px)`,
      }}
      onPointerDown={(event) => {
        if (!draggable || event.button !== 0) return
        event.stopPropagation()
        event.preventDefault()
        onDragStart('move', entry, dateKey, event.clientY)
      }}
      onClick={(event) => {
        event.stopPropagation()
        onActivate(entry, dateKey)
      }}
      title={`${formatMinutes(displayStartMin)} – ${formatMinutes(displayEndMin)}  ${entry.title}`}
    >

      <span aria-hidden="true" className={cx('cal-rail', KIND_RAIL[entry.kind])} />

      {draggable ? (
        <>
          <span
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-1.5 cursor-ns-resize"
            onPointerDown={(event) => {
              event.stopPropagation()
              event.preventDefault()
              onDragStart('resize-start', entry, dateKey, event.clientY)
            }}
          />
          <span
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
            onPointerDown={(event) => {
              event.stopPropagation()
              event.preventDefault()
              onDragStart('resize-end', entry, dateKey, event.clientY)
            }}
          />
        </>
      ) : null}

      <p
        className={cx(
          'relative z-10 truncate font-bold leading-tight',
          compact ? 'text-[10px]' : 'text-[11px]',
        )}
      >
        {entry.title}
      </p>
      {!compact ? (
        <p className="relative z-10 truncate text-[10px] font-medium leading-tight opacity-75">
          {formatMinutes(displayStartMin)}
          {roomy && entry.subtitle ? ` · ${entry.subtitle}` : ''}
        </p>
      ) : null}
    </div>
  )
})
