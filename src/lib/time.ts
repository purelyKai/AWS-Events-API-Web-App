export const FALLBACK_TZ = 'UTC'

export type DateKey = string

export interface CivilTime {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(timeZone)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatterCache.set(timeZone, fmt)
  }
  return fmt
}

function readParts(instant: Date, timeZone: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const part of partsFormatter(timeZone).formatToParts(instant)) {
    if (part.type !== 'literal') out[part.type] = Number(part.value)
  }
  return out
}

export function toCivil(instant: Date, timeZone: string): CivilTime {
  const p = readParts(instant, timeZone)
  return {
    year: p.year,
    month: p.month,
    day: p.day,
    hour: p.hour % 24,
    minute: p.minute,
  }
}

function offsetMs(instant: Date, timeZone: string): number {
  const p = readParts(instant, timeZone)
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second)
  return asIfUtc - instant.getTime()
}

export function zonedToInstant(civil: CivilTime, timeZone: string): Date {
  const naive = Date.UTC(
    civil.year,
    civil.month - 1,
    civil.day,
    civil.hour,
    civil.minute,
    0,
  )
  let ts = naive - offsetMs(new Date(naive), timeZone)
  ts = naive - offsetMs(new Date(ts), timeZone)
  return new Date(ts)
}

const pad = (value: number, width = 2) => String(value).padStart(width, '0')

export const dateKeyOf = (civil: CivilTime): DateKey =>
  `${pad(civil.year, 4)}-${pad(civil.month)}-${pad(civil.day)}`

export function parseDateKey(key: DateKey): {
  year: number
  month: number
  day: number
} {
  const [year, month, day] = key.split('-').map(Number)
  return { year, month, day }
}

export function parseClock(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim())
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  return hour * 60 + minute
}

export function formatMinutes(minutes: number, hour12 = true): string {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440
  const hour = Math.floor(total / 60)
  const minute = total % 60
  if (!hour12) return `${pad(hour)}:${pad(minute)}`
  const suffix = hour < 12 ? 'AM' : 'PM'
  const display = hour % 12 === 0 ? 12 : hour % 12
  return `${display}:${pad(minute)} ${suffix}`
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

export function parseUtcNaive(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number)
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second))
}

export function formatUtcNaive(instant: Date): string {
  return (
    `${pad(instant.getUTCFullYear(), 4)}-${pad(instant.getUTCMonth() + 1)}-` +
    `${pad(instant.getUTCDate())}T${pad(instant.getUTCHours())}:` +
    `${pad(instant.getUTCMinutes())}:00`
  )
}

export function localSlotToUtcNaive(
  dateKey: DateKey,
  minutesFromMidnight: number,
  timeZone: string,
): string {
  const { year, month, day } = parseDateKey(dateKey)
  return formatUtcNaive(
    zonedToInstant(
      {
        year,
        month,
        day,
        hour: Math.floor(minutesFromMidnight / 60),
        minute: minutesFromMidnight % 60,
      },
      timeZone,
    ),
  )
}

export function utcNaiveToLocalSlot(
  value: string,
  timeZone: string,
): { dateKey: DateKey; minutes: number } | null {
  const instant = parseUtcNaive(value)
  if (!instant) return null
  const civil = toCivil(instant, timeZone)
  return { dateKey: dateKeyOf(civil), minutes: civil.hour * 60 + civil.minute }
}

export function enumerateEventDays(
  startIso: string,
  endIso: string,
  timeZone: string,
): DateKey[] {
  const start = new Date(startIso)
  const end = new Date(endIso)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return []

  const first = toCivil(start, timeZone)
  const last = toCivil(end, timeZone)

  const days: DateKey[] = []

  let cursor = Date.UTC(first.year, first.month - 1, first.day)
  const limit = Date.UTC(last.year, last.month - 1, last.day)
  while (cursor <= limit && days.length < 60) {
    const d = new Date(cursor)
    days.push(
      `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    )
    cursor += 86_400_000
  }
  return days
}

const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  timeZone: 'UTC',
})
const monthDayFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

export function labelDateKey(key: DateKey): { weekday: string; monthDay: string } {
  const { year, month, day } = parseDateKey(key)
  const asUtc = new Date(Date.UTC(year, month - 1, day))
  return {
    weekday: weekdayFormatter.format(asUtc),
    monthDay: monthDayFormatter.format(asUtc),
  }
}

const slotFormatterCache = new Map<string, Intl.DateTimeFormat>()

export function currentSlot(timeZone: string): { dateKey: DateKey; minutes: number } {
  let fmt = slotFormatterCache.get(timeZone)
  if (!fmt) {
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }
    try {
      fmt = new Intl.DateTimeFormat('en-CA', { ...options, timeZone })
    } catch {
      fmt = new Intl.DateTimeFormat('en-CA', { ...options, timeZone: 'UTC' })
    }
    slotFormatterCache.set(timeZone, fmt)
  }

  const parts = fmt.formatToParts(new Date())
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '00'

  const hour = Number(part('hour')) % 24

  return {
    dateKey: `${part('year')}-${part('month')}-${part('day')}`,
    minutes: hour * 60 + Number(part('minute')),
  }
}

export const snapTo5 = (minutes: number): number => Math.round(minutes / 5) * 5

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))
