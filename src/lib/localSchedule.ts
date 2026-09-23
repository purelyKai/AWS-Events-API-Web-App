import type { PersonalTime, Schedule } from '../api/types'
import { STORAGE_PREFIX } from '../config'

const key = (eventId: string) => `${STORAGE_PREFIX}local.${eventId}`

export const EMPTY_SCHEDULE: Schedule = {
  reserved: [],
  favorites: [],
  personalTime: [],
}

export function readLocalSchedule(eventId: string): Schedule {
  try {
    const raw = sessionStorage.getItem(key(eventId))
    if (!raw) return EMPTY_SCHEDULE
    const parsed = JSON.parse(raw) as Partial<Schedule>
    return {
      reserved: Array.isArray(parsed.reserved) ? parsed.reserved : [],
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
      personalTime: Array.isArray(parsed.personalTime) ? parsed.personalTime : [],
    }
  } catch {
    return EMPTY_SCHEDULE
  }
}

export function writeLocalSchedule(eventId: string, schedule: Schedule) {
  try {
    sessionStorage.setItem(key(eventId), JSON.stringify(schedule))
  } catch {}
}

export function newLocalId(): string {
  if (typeof crypto?.randomUUID === 'function') return `local-${crypto.randomUUID()}`
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return `local-${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`
}

export function makeLocalPersonalTime(
  input: Omit<PersonalTime, 'personalTimeId'>,
): PersonalTime {
  return { ...input, personalTimeId: newLocalId() }
}
