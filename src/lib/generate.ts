import type { Span } from './layout'
import { overlaps } from './layout'
import type { SessionView } from './sessions'
import type { DateKey } from './time'

export interface GeneratePrefs {
  days: DateKey[]
  topics: string[]
  areasOfInterest: string[]
  services: string[]
  types: string[]
  levels: string[]
  dayStartMin: number
  dayEndMin: number
  maxPerDay: number
  protectLunch: boolean
  lunchStartMin: number
  lunchEndMin: number
  boostFavorites: boolean
  onlyMatching: boolean
  avoidFull: boolean
}

export const DEFAULT_PREFS: GeneratePrefs = {
  days: [],
  topics: [],
  areasOfInterest: [],
  services: [],
  types: [],
  levels: [],
  dayStartMin: 9 * 60,
  dayEndMin: 18 * 60,
  maxPerDay: 4,
  protectLunch: false,
  lunchStartMin: 12 * 60,
  lunchEndMin: 13 * 60,
  boostFavorites: true,
  onlyMatching: true,
  avoidFull: true,
}

export interface PlannedItem {
  view: SessionView
  score: number
  reasons: string[]
}

export interface DayPlan {
  dateKey: DateKey
  items: PlannedItem[]
  busy: Span[]
  passedOver: number
}

export interface Plan {
  days: DayPlan[]
  totalPicked: number
  totalPassedOver: number
  excluded: {
    noTimeSlot: number
    outsideWindow: number
    full: number
    noMatch: number
    alreadyScheduled: number
  }
}

interface ScoreContext {
  favorites: ReadonlySet<string>
  prefs: GeneratePrefs
}

const countMatches = (values: string[] | undefined, wanted: string[]): number => {
  if (!values || wanted.length === 0) return 0
  const set = new Set(wanted)
  let hits = 0
  for (const value of values) if (set.has(value)) hits += 1
  return hits
}

function scoreSession(
  view: SessionView,
  { favorites, prefs }: ScoreContext,
): { score: number; reasons: string[]; matched: boolean } {
  const { session } = view
  const reasons: string[] = []
  let score = 0
  let matched = false

  const topicHits = countMatches(session.topics, prefs.topics)
  if (topicHits > 0) {
    score += 10 * topicHits
    matched = true
    reasons.push(topicHits > 1 ? `${topicHits} topic matches` : 'topic match')
  }

  const areaHits = countMatches(session.areasOfInterest, prefs.areasOfInterest)
  if (areaHits > 0) {
    score += 8 * areaHits
    matched = true
    reasons.push('area of interest')
  }

  const serviceHits = countMatches(session.services, prefs.services)
  if (serviceHits > 0) {
    score += 7 * serviceHits
    matched = true
    reasons.push('service match')
  }

  if (session.type && prefs.types.includes(session.type)) {
    score += 6
    matched = true
    reasons.push(session.type.toLowerCase())
  }

  if (session.level && prefs.levels.includes(session.level)) {
    score += 5
    matched = true
    reasons.push('preferred level')
  }

  if (prefs.boostFavorites && favorites.has(session.sessionId)) {
    score += 20
    matched = true
    reasons.push('already a favorite')
  }

  const seats = session.seatAvailability
  if (seats === 'available') score += 3
  else if (seats === 'limited') score += 1
  else if (seats === 'veryLimited') score -= 1

  if (session.isReservable) {
    score += 2
    reasons.push('reservable')
  }

  return { score: Math.max(1, score), reasons, matched }
}

function bestArrangement(
  candidates: PlannedItem[],
  limit: number,
): PlannedItem[] {
  const n = candidates.length
  if (n === 0 || limit <= 0) return []

  const sorted = [...candidates].sort(
    (a, b) =>
      (a.view.endMin ?? 0) - (b.view.endMin ?? 0) ||
      (a.view.startMin ?? 0) - (b.view.startMin ?? 0),
  )

  const ends = sorted.map((item) => item.view.endMin ?? 0)
  const starts = sorted.map((item) => item.view.startMin ?? 0)

  const compatibleCount = (i: number): number => {
    let low = 0
    let high = i
    while (low < high) {
      const mid = (low + high) >> 1
      if (ends[mid] <= starts[i]) low = mid + 1
      else high = mid
    }
    return low
  }

  const prev = sorted.map((_, i) => compatibleCount(i))

  const dp: number[][] = Array.from({ length: limit + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  )

  for (let k = 1; k <= limit; k += 1) {
    for (let i = 1; i <= n; i += 1) {
      const skip = dp[k][i - 1]
      const take = dp[k - 1][prev[i - 1]] + sorted[i - 1].score
      dp[k][i] = Math.max(skip, take)
    }
  }

  const chosen: PlannedItem[] = []
  let k = limit
  let i = n
  while (i > 0 && k > 0) {
    if (dp[k][i] === dp[k][i - 1]) {
      i -= 1
      continue
    }
    chosen.push(sorted[i - 1])
    i = prev[i - 1]
    k -= 1
  }

  return chosen.reverse()
}

export function generatePlan(
  catalog: readonly SessionView[],
  prefs: GeneratePrefs,
  committed: {
    favorites: ReadonlySet<string>
    reserved: ReadonlySet<string>
    busyByDay: Map<DateKey, Span[]>
  },
): Plan {
  const excluded = {
    noTimeSlot: 0,
    outsideWindow: 0,
    full: 0,
    noMatch: 0,
    alreadyScheduled: 0,
  }

  const hasPrefs =
    prefs.topics.length > 0 ||
    prefs.areasOfInterest.length > 0 ||
    prefs.services.length > 0 ||
    prefs.types.length > 0 ||
    prefs.levels.length > 0

  const wanted = new Set(prefs.days)
  const byDay = new Map<DateKey, PlannedItem[]>()
  for (const day of prefs.days) byDay.set(day, [])

  for (const view of catalog) {
    if (view.isAllDay || view.startMin === undefined || view.endMin === undefined) {
      excluded.noTimeSlot += 1
      continue
    }
    if (!view.dateKey || !wanted.has(view.dateKey)) continue

    if (committed.reserved.has(view.session.sessionId)) {
      excluded.alreadyScheduled += 1
      continue
    }

    if (view.startMin < prefs.dayStartMin || view.endMin > prefs.dayEndMin) {
      excluded.outsideWindow += 1
      continue
    }

    const span: Span = { startMin: view.startMin, endMin: view.endMin }

    if (
      prefs.protectLunch &&
      overlaps(span, { startMin: prefs.lunchStartMin, endMin: prefs.lunchEndMin })
    ) {
      excluded.outsideWindow += 1
      continue
    }

    if (prefs.avoidFull && view.session.seatAvailability === 'unavailable') {
      excluded.full += 1
      continue
    }

    const busy = committed.busyByDay.get(view.dateKey) ?? []
    if (busy.some((block) => overlaps(span, block))) {
      excluded.alreadyScheduled += 1
      continue
    }

    const { score, reasons, matched } = scoreSession(view, {
      favorites: committed.favorites,
      prefs,
    })

    if (hasPrefs && prefs.onlyMatching && !matched) {
      excluded.noMatch += 1
      continue
    }

    byDay.get(view.dateKey)?.push({ view, score, reasons })
  }

  const days: DayPlan[] = []
  let totalPicked = 0
  let totalPassedOver = 0

  for (const day of prefs.days) {
    const candidates = byDay.get(day) ?? []
    const items = bestArrangement(candidates, prefs.maxPerDay)
    const passedOver = candidates.length - items.length
    totalPicked += items.length
    totalPassedOver += passedOver
    days.push({
      dateKey: day,
      items,
      busy: committed.busyByDay.get(day) ?? [],
      passedOver,
    })
  }

  return { days, totalPicked, totalPassedOver, excluded }
}

export function countedOptionsFor(
  catalog: readonly SessionView[],
  pick: (view: SessionView) => string[] | undefined,
  limit = 40,
): { value: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const view of catalog) {
    for (const value of pick(view) ?? []) {
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }))
}
