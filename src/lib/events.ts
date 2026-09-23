import type { AwsEvent } from '../api/types'

export type EventPhase = 'live' | 'upcoming' | 'past'

export function classifyEvent(event: AwsEvent, now: number): EventPhase {
  const start = Date.parse(event.startDate)
  const end = Date.parse(event.endDate)

  if (Number.isNaN(start) || Number.isNaN(end)) return 'upcoming'
  if (end < now) return 'past'
  if (start <= now) return 'live'
  return 'upcoming'
}

export interface GroupedEvents {
  live: AwsEvent[]
  upcoming: AwsEvent[]
  past: AwsEvent[]
  matched: number
}

export function groupEvents(events: readonly AwsEvent[], now: number): GroupedEvents {
  const live: AwsEvent[] = []
  const upcoming: AwsEvent[] = []
  const past: AwsEvent[] = []

  for (const event of events) {
    const phase = classifyEvent(event, now)
    if (phase === 'live') live.push(event)
    else if (phase === 'upcoming') upcoming.push(event)
    else past.push(event)
  }

  const byStartAsc = (a: AwsEvent, b: AwsEvent) =>
    Date.parse(a.startDate) - Date.parse(b.startDate) || a.name.localeCompare(b.name)
  const byEndDesc = (a: AwsEvent, b: AwsEvent) =>
    Date.parse(b.endDate) - Date.parse(a.endDate) || a.name.localeCompare(b.name)

  live.sort(byStartAsc)
  upcoming.sort(byStartAsc)
  past.sort(byEndDesc)

  return { live, upcoming, past, matched: live.length + upcoming.length + past.length }
}

const rangeFormatterCache = new Map<string, Intl.DateTimeFormat>()

const dayFormatter = (timeZone: string): Intl.DateTimeFormat => {
  let fmt = rangeFormatterCache.get(timeZone)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      month: 'short',
      day: 'numeric',
    })
    rangeFormatterCache.set(timeZone, fmt)
  }
  return fmt
}

export function formatEventRange(event: AwsEvent): string {
  const timeZone = event.timezone || 'UTC'
  const start = new Date(event.startDate)
  const end = new Date(event.endDate)
  if (Number.isNaN(start.getTime())) return ''

  let fmt: Intl.DateTimeFormat
  try {
    fmt = dayFormatter(timeZone)
  } catch {
    fmt = dayFormatter('UTC')
  }

  const year = new Intl.DateTimeFormat('en-US', {
    timeZone: fmt.resolvedOptions().timeZone,
    year: 'numeric',
  }).format(start)

  const startLabel = fmt.format(start)
  const endLabel = Number.isNaN(end.getTime()) ? startLabel : fmt.format(end)

  return startLabel === endLabel
    ? `${startLabel}, ${year}`
    : `${startLabel} – ${endLabel}, ${year}`
}

export function placeHue(event: AwsEvent): number {
  const key = event.address?.city || event.timezone || event.eventId
  let hash = 0
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) % 3600
  }
  return hash / 10
}

const isoDayCache = new Map<string, Intl.DateTimeFormat>()

const isoDay = (date: Date, timeZone: string): string => {
  let fmt = isoDayCache.get(timeZone)
  if (!fmt) {
    try {
      fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
    } catch {
      fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
    }
    isoDayCache.set(timeZone, fmt)
  }
  return fmt.format(date)
}

export function eventDays(event: AwsEvent): number {
  const start = new Date(event.startDate)
  const end = new Date(event.endDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1

  const timeZone = event.timezone || 'UTC'
  const startDay = Date.parse(`${isoDay(start, timeZone)}T00:00:00Z`)
  const endDay = Date.parse(`${isoDay(end, timeZone)}T00:00:00Z`)
  if (Number.isNaN(startDay) || Number.isNaN(endDay)) return 1

  return Math.max(1, Math.round((endDay - startDay) / 86_400_000) + 1)
}

export type Imminence = 0 | 1 | 2 | 3

export function imminence(event: AwsEvent, now: number): Imminence {
  const start = Date.parse(event.startDate)
  if (Number.isNaN(start)) return 0
  const days = (start - now) / 86_400_000
  if (days < 7) return 3
  if (days < 30) return 2
  if (days < 120) return 1
  return 0
}

const monthFormatterCache = new Map<string, Intl.DateTimeFormat>()

export function eventMonth(event: AwsEvent): string {
  const start = new Date(event.startDate)
  if (Number.isNaN(start.getTime())) return ''
  const timeZone = event.timezone || 'UTC'
  let fmt = monthFormatterCache.get(timeZone)
  if (!fmt) {
    try {
      fmt = new Intl.DateTimeFormat('en-US', { timeZone, month: 'short' })
    } catch {
      fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short' })
    }
    monthFormatterCache.set(timeZone, fmt)
  }
  return fmt.format(start).toUpperCase()
}

const relative = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' })

export function describeWhen(event: AwsEvent, now: number): string {
  const phase = classifyEvent(event, now)
  if (phase === 'live') return 'on now'

  const target = phase === 'past' ? Date.parse(event.endDate) : Date.parse(event.startDate)
  if (Number.isNaN(target)) return ''

  const diffDays = Math.round((target - now) / 86_400_000)
  if (Math.abs(diffDays) >= 60) {
    return relative.format(Math.round(diffDays / 30), 'month')
  }
  if (Math.abs(diffDays) >= 14) {
    return relative.format(Math.round(diffDays / 7), 'week')
  }
  return relative.format(diffDays, 'day')
}
