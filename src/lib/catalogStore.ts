import { ApiError } from '../api/client'
import { getSchedule, listAllSessions } from '../api/events'
import type { Schedule, Session } from '../api/types'
import { CATALOG_TTL_MS, catalogKey } from '../config'

interface Cached {
  savedAt: number
  sessions: Session[]
}

const memory = new Map<string, Cached>()

const notRegistered = new Set<string>()
const inflight = new Map<string, Promise<Session[]>>()
const listeners = new Set<() => void>()

const fresh = (entry: Cached | undefined): boolean =>
  entry !== undefined && Date.now() - entry.savedAt <= CATALOG_TTL_MS

function readPersisted(eventId: string): Cached | null {
  try {
    const raw = localStorage.getItem(catalogKey(eventId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Cached
    if (!Array.isArray(parsed.sessions) || !fresh(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

function persist(eventId: string, entry: Cached) {
  try {
    localStorage.setItem(catalogKey(eventId), JSON.stringify(entry))
  } catch {}
}

const notify = () => {
  for (const fn of listeners) fn()
}

export function subscribeCatalogs(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function cachedCatalog(eventId: string): Session[] | null {
  const inMemory = memory.get(eventId)
  if (fresh(inMemory)) return inMemory!.sessions

  const persisted = readPersisted(eventId)
  if (persisted) {
    memory.set(eventId, persisted)
    return persisted.sessions
  }
  return null
}

export const isCatalogReady = (eventId: string): boolean =>
  cachedCatalog(eventId) !== null

export const isNotRegistered = (eventId: string): boolean => notRegistered.has(eventId)

export function loadCatalog(
  eventId: string,
  onPage?: (page: Session[], loaded: number, totalCount: number) => void,
): Promise<Session[]> {
  const cached = cachedCatalog(eventId)
  if (cached) return Promise.resolve(cached)

  const existing = inflight.get(eventId)
  if (existing) return existing

  const walk = listAllSessions(eventId, onPage)
    .then((sessions) => {
      const entry = { savedAt: Date.now(), sessions }
      memory.set(eventId, entry)
      persist(eventId, entry)
      notify()
      return sessions
    })
    .catch((err: unknown) => {
      if (err instanceof ApiError && err.kind === 'notRegistered') {
        notRegistered.add(eventId)
      }
      throw err
    })
    .finally(() => {
      inflight.delete(eventId)
      notify()
    })

  inflight.set(eventId, walk)
  notify()
  return walk
}

export function prefetchCatalog(eventId: string): void {
  if (isCatalogReady(eventId) || inflight.has(eventId) || notRegistered.has(eventId)) return
  void loadCatalog(eventId).catch(() => {})
}

export function invalidateCatalog(eventId: string): void {
  memory.delete(eventId)
  try {
    localStorage.removeItem(catalogKey(eventId))
  } catch {}
}

export function clearAllCatalogs(): void {
  memory.clear()
  inflight.clear()

  notRegistered.clear()
}

const SCHEDULE_TTL_MS = 30_000
const schedules = new Map<string, { at: number; promise: Promise<Schedule> }>()

export function prefetchSchedule(eventId: string): void {
  const existing = schedules.get(eventId)
  if (existing && Date.now() - existing.at < SCHEDULE_TTL_MS) return
  const promise = getSchedule(eventId).then((res) => res.schedule)
  schedules.set(eventId, { at: Date.now(), promise })

  void promise.catch(() => {
    schedules.delete(eventId)
  })
}

export function takePrefetchedSchedule(eventId: string): Promise<Schedule> | null {
  const entry = schedules.get(eventId)
  if (!entry) return null
  schedules.delete(eventId)
  if (Date.now() - entry.at > SCHEDULE_TTL_MS) return null
  return entry.promise
}

export function clearPrefetchedSchedules(): void {
  schedules.clear()
}
