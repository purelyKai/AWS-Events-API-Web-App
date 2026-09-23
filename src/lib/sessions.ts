import type { Session } from '../api/types'
import { type DateKey, formatMinutes, parseClock } from './time'

const LAST = '￿'

export interface SessionView {
  session: Session
  dateKey?: DateKey
  startMin?: number
  endMin?: number
  durationMin?: number
  isAllDay: boolean
  haystack: string
}

const searchableParts = (session: Session): string[] => [
  session.title,
  session.abbreviation ?? '',
  session.abstract ?? '',
  session.type ?? '',
  session.level ?? '',
  session.venue ?? '',
  session.room ?? '',
  ...(session.speakers?.map((s) => s.name ?? '') ?? []),
  ...(session.tracks ?? []),
  ...(session.topics ?? []),
  ...(session.services ?? []),
  ...(session.areasOfInterest ?? []),
  ...(session.roles ?? []),
  ...(session.industries ?? []),
  ...(session.segments ?? []),
  ...(session.features ?? []),
  ...(session.experiences ?? []),
  ...(session.focusAreas ?? []),
  ...(session.customerPersonas ?? []),
]

export function toView(session: Session): SessionView {
  const time = session.sessionTime
  const startMin = time?.time ? parseClock(time.time) : null
  const rawLength = time?.length ? Number(time.length) : Number.NaN
  const durationMin =
    Number.isFinite(rawLength) && rawLength > 0 ? rawLength : undefined

  const placed = Boolean(time?.date) && startMin !== null

  return {
    session,
    dateKey: time?.date,
    startMin: placed ? startMin : undefined,
    endMin: placed ? startMin + (durationMin ?? 60) : undefined,
    durationMin,
    isAllDay: Boolean(session.isAllDaySession),
    haystack: searchableParts(session).join('  ').toLowerCase(),
  }
}

export type FacetKey =
  | 'day'
  | 'type'
  | 'level'
  | 'topics'
  | 'areasOfInterest'
  | 'services'
  | 'tracks'
  | 'roles'
  | 'industries'
  | 'venue'
  | 'features'
  | 'segments'
  | 'experiences'
  | 'focusAreas'

interface FacetDef {
  key: FacetKey
  label: string
  values: (view: SessionView) => string[]
}

const one = (value: string | undefined): string[] => (value ? [value] : [])

export const FACETS: readonly FacetDef[] = [
  { key: 'day', label: 'Day', values: (v) => one(v.dateKey) },
  { key: 'type', label: 'Session type', values: (v) => one(v.session.type) },
  { key: 'level', label: 'Level', values: (v) => one(v.session.level) },
  { key: 'topics', label: 'Topic', values: (v) => v.session.topics ?? [] },
  {
    key: 'areasOfInterest',
    label: 'Area of interest',
    values: (v) => v.session.areasOfInterest ?? [],
  },
  { key: 'services', label: 'AWS service', values: (v) => v.session.services ?? [] },
  { key: 'tracks', label: 'Track', values: (v) => v.session.tracks ?? [] },
  { key: 'roles', label: 'Role', values: (v) => v.session.roles ?? [] },
  { key: 'industries', label: 'Industry', values: (v) => v.session.industries ?? [] },
  { key: 'venue', label: 'Venue', values: (v) => one(v.session.venue) },
  { key: 'features', label: 'Format', values: (v) => v.session.features ?? [] },
  { key: 'segments', label: 'Segment', values: (v) => v.session.segments ?? [] },
  { key: 'experiences', label: 'Experience', values: (v) => v.session.experiences ?? [] },
  { key: 'focusAreas', label: 'Focus area', values: (v) => v.session.focusAreas ?? [] },
] as const

export type FacetSelections = Partial<Record<FacetKey, string[]>>

export interface FacetOption {
  value: string
  count: number
}

export type Flag = 'reservable' | 'seatsOpen' | 'favorites' | 'reserved' | 'scheduled'

export type SortKey = 'time' | 'code' | 'title'

export interface FilterState {
  query: string
  selections: FacetSelections
  flags: Flag[]
  sort: SortKey
}

export const EMPTY_FILTERS: FilterState = {
  query: '',
  selections: {},
  flags: [],
  sort: 'time',
}

export const countActiveFilters = (filters: FilterState): number =>
  Object.values(filters.selections).reduce(
    (sum, values) => sum + (values?.length ?? 0),
    0,
  ) + filters.flags.length

export const tokenize = (query: string): string[] =>
  query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)

interface PredicateContext {
  favorites: ReadonlySet<string>
  reserved: ReadonlySet<string>
}

export function buildPredicate(
  filters: FilterState,
  ctx: PredicateContext,
  skipFacet?: FacetKey,
): (view: SessionView) => boolean {
  const terms = tokenize(filters.query)

  const active = FACETS.filter(
    (facet) =>
      facet.key !== skipFacet && (filters.selections[facet.key]?.length ?? 0) > 0,
  ).map((facet) => ({
    values: facet.values,
    wanted: new Set(filters.selections[facet.key]),
  }))

  const flags = new Set(filters.flags)

  return (view) => {
    for (const term of terms) {
      if (!view.haystack.includes(term)) return false
    }

    for (const { values, wanted } of active) {
      let hit = false
      for (const value of values(view)) {
        if (wanted.has(value)) {
          hit = true
          break
        }
      }
      if (!hit) return false
    }

    if (flags.has('reservable') && !view.session.isReservable) return false
    if (flags.has('seatsOpen')) {
      const seats = view.session.seatAvailability
      if (seats !== 'available' && seats !== 'limited' && seats !== 'walkUp') {
        return false
      }
    }
    if (flags.has('favorites') && !ctx.favorites.has(view.session.sessionId)) return false
    if (flags.has('reserved') && !ctx.reserved.has(view.session.sessionId)) return false
    if (flags.has('scheduled') && view.startMin === undefined) return false

    return true
  }
}

export function computeFacets(
  views: readonly SessionView[],
  filters: FilterState,
  ctx: PredicateContext,
): Record<FacetKey, FacetOption[]> {
  const out = {} as Record<FacetKey, FacetOption[]>

  for (const facet of FACETS) {
    const matches = buildPredicate(filters, ctx, facet.key)
    const counts = new Map<string, number>()

    for (const view of views) {
      if (!matches(view)) continue
      for (const value of facet.values(view)) {
        counts.set(value, (counts.get(value) ?? 0) + 1)
      }
    }

    for (const value of filters.selections[facet.key] ?? []) {
      if (!counts.has(value)) counts.set(value, 0)
    }

    out[facet.key] = [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
  }

  return out
}

export function sortViews(views: SessionView[], sort: SortKey): SessionView[] {
  const copy = [...views]

  if (sort === 'code') {
    copy.sort((a, b) =>
      (a.session.abbreviation ?? LAST).localeCompare(b.session.abbreviation ?? LAST),
    )
  } else if (sort === 'title') {
    copy.sort((a, b) => a.session.title.localeCompare(b.session.title))
  } else {
    copy.sort((a, b) => {
      const dayDiff = (a.dateKey ?? LAST).localeCompare(b.dateKey ?? LAST)
      if (dayDiff !== 0) return dayDiff
      const minDiff = (a.startMin ?? 99_999) - (b.startMin ?? 99_999)
      if (minDiff !== 0) return minDiff
      return a.session.title.localeCompare(b.session.title)
    })
  }

  return copy
}

export function describeSlot(view: SessionView): string | null {
  if (view.isAllDay) return 'All day'
  if (view.startMin === undefined) return null
  return `${formatMinutes(view.startMin)} – ${formatMinutes(view.endMin ?? view.startMin)}`
}

export const SEAT_LABELS: Record<string, string> = {
  available: 'Seats available',
  limited: 'Limited seats',
  veryLimited: 'Very limited',
  unavailable: 'Full',
  walkUp: 'Walk-up',
}

export const SEAT_TONE: Record<string, string> = {
  available: 'text-success bg-success-soft ring-success-line',
  limited: 'text-warn bg-warn-soft ring-warn-line',
  veryLimited: 'text-orange-300 bg-orange-500/10 ring-orange-500/25',
  unavailable: 'text-danger bg-danger-soft ring-danger-line',
  walkUp: 'text-info bg-info-soft ring-info-line',
}

export function shortLevel(level: string | undefined): string | null {
  if (!level) return null
  const match = /^(\d{3})/.exec(level.trim())
  return match ? match[1] : level
}

export function levelDepth(level: string | undefined): number {
  const short = shortLevel(level)
  const n = short ? Number(short) / 100 : Number.NaN
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 0
}

export function domainCode(abbreviation: string | undefined): string | null {
  const match = /^([A-Za-z]{2,4})/.exec(abbreviation?.trim() ?? '')
  return match ? match[1].toUpperCase() : null
}

export function domainHue(code: string | null): number {
  if (!code) return 36
  let hash = 0
  for (let i = 0; i < code.length; i += 1) {
    hash = (hash * 31 + code.charCodeAt(i)) % 3600
  }
  return hash / 10
}

export const TYPE_ICON: Record<string, 'mic' | 'users' | 'layers' | 'list' | 'spark'> = {
  'Breakout session': 'mic',
  'Chalk talk': 'users',
  "Builders' session": 'layers',
  'Code talk': 'list',
  'Gamified learning': 'spark',
  Workshop: 'layers',
  Keynote: 'mic',
}

export function describeBulkFailure(code: string, conflictTitles: string[]): string {
  switch (code) {
    case 'sessionNotReservable':
      return 'This session does not take reservations.'
    case 'scheduleConflict':
      return conflictTitles.length > 0
        ? `Clashes with ${conflictTitles.join(', ')}.`
        : 'Clashes with something already on your schedule.'
    case 'alreadyScheduled':
      return 'Already on your schedule.'
    case 'sessionFull':
      return 'The session is full.'
    case 'insufficientAccess':
      return 'Your registration does not include this session.'
    case 'timePassed':
      return 'This session has already started.'
    case 'alreadyFavorited':
      return 'Already in your favorites.'
    case 'notFavorited':
      return 'That session was not in your favorites.'
    default:
      return 'This one was refused.'
  }
}
