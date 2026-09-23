import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { ApiError } from '../api/client'
import * as api from '../api/events'
import type { AwsEvent, PersonalTime, PersonalTimeInput, Schedule } from '../api/types'
import {
  beginSignIn,
  getUserInfo,
  isSignedIn,
  signOut,
  subscribeAuth,
} from '../auth/authStore'
import type { UserInfo } from '../auth/authStore'
import { AppContext } from './appContext'
import type {
  AppValue,
  ApplyPlanResult,
  CatalogBlock,
  LoadStatus,
  Toast,
} from './appContext'
import { STORAGE_KEYS } from '../config'
import {
  cachedCatalog,
  clearAllCatalogs,
  clearPrefetchedSchedules,
  invalidateCatalog,
  loadCatalog,
  prefetchCatalog,
  prefetchSchedule,
  takePrefetchedSchedule,
} from '../lib/catalogStore'
import {
  EMPTY_SCHEDULE,
  makeLocalPersonalTime,
  readLocalSchedule,
  writeLocalSchedule,
} from '../lib/localSchedule'
import { overlaps } from '../lib/layout'
import { mapPool, REQUEST_CONCURRENCY } from '../lib/pool'
import { describeBulkFailure, toView } from '../lib/sessions'
import type { SessionView } from '../lib/sessions'
import { enumerateEventDays, FALLBACK_TZ } from '../lib/time'

const BULK_LIMIT = 10

const chunk = <T,>(items: T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

const LOCAL_NOTE = 'Kept in this browser tab — this event has no saved schedule.'

const isAbort = (err: unknown): boolean =>
  err instanceof DOMException && err.name === 'AbortError'

const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err)

export function AppProvider({
  eventId,
  children,
}: {
  eventId: string | null
  children: ReactNode
}) {
  const [signedIn, setSignedIn] = useState(isSignedIn)
  const [user, setUser] = useState<UserInfo | null>(getUserInfo)

  const [events, setEvents] = useState<AwsEvent[]>([])
  const [eventsStatus, setEventsStatus] = useState<LoadStatus>('idle')
  const [eventsError, setEventsError] = useState<string | null>(null)
  const [eventsNonce, setEventsNonce] = useState(0)

  const [loadedEvent, setLoadedEvent] = useState<AwsEvent | null>(null)
  const [eventError, setEventError] = useState<string | null>(null)

  const [catalog, setCatalog] = useState<SessionView[]>([])
  const [catalogStatus, setCatalogStatus] = useState<LoadStatus>('idle')
  const [loadedCount, setLoadedCount] = useState(0)

  const [catalogTotal, setCatalogTotal] = useState(0)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [catalogBlock, setCatalogBlock] = useState<CatalogBlock>(null)
  const [catalogNonce, setCatalogNonce] = useState(0)

  const [favorites, setFavorites] = useState<Set<string>>(() => new Set())
  const [reserved, setReserved] = useState<Set<string>>(() => new Set())
  const [personalTime, setPersonalTime] = useState<PersonalTime[]>([])
  const [scheduleStatus, setScheduleStatus] = useState<LoadStatus>('idle')

  const [pending, setPending] = useState<Set<string>>(() => new Set())
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastSeq = useRef(0)

  const scheduleRef = useRef<Schedule>(EMPTY_SCHEDULE)

  const applySchedule = useCallback((schedule: Schedule) => {
    scheduleRef.current = {
      reserved: [...schedule.reserved],
      favorites: [...schedule.favorites],
      personalTime: [...schedule.personalTime],
    }
    setReserved(new Set(schedule.reserved))
    setFavorites(new Set(schedule.favorites))
    setPersonalTime(schedule.personalTime)
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const pushToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = ++toastSeq.current
    setToasts((current) => [...current, { ...toast, id }])
    const lifetime = toast.tone === 'error' ? 7000 : 4000
    window.setTimeout(() => {
      setToasts((current) => current.filter((entry) => entry.id !== id))
    }, lifetime)
  }, [])

  useEffect(
    () =>
      subscribeAuth(() => {
        setSignedIn(isSignedIn())
        setUser(getUserInfo())
      }),
    [],
  )

  const signIn = useCallback(() => {
    void beginSignIn().catch((err: unknown) => {
      pushToast({ tone: 'error', title: 'Could not start sign-in', detail: errorMessage(err) })
    })
  }, [pushToast])

  const resetUserState = useCallback(() => {
    clearPrefetchedSchedules()
    clearAllCatalogs()

    applySchedule(EMPTY_SCHEDULE)
    setScheduleStatus('idle')
    setCatalog([])
    setCatalogStatus('idle')
    setLoadedCount(0)
    setCatalogTotal(0)
  }, [applySchedule])

  const signOutApp = useCallback(() => {
    resetUserState()
    void signOut()
  }, [resetUserState])

  useEffect(() => {
    try {
      if (!sessionStorage.getItem(STORAGE_KEYS.signedOut)) return
      sessionStorage.removeItem(STORAGE_KEYS.signedOut)
      pushToast({
        tone: 'info',
        title: 'Signed out',
        detail: 'Your AWS session was ended too, so signing in will ask for credentials.',
      })
    } catch {}
  }, [pushToast])

  useEffect(() => {
    const controller = new AbortController()
    setEventsStatus('loading')
    setEventsError(null)

    api
      .listEvents(true, controller.signal)
      .then((items) => {
        setEvents(items)
        setEventsStatus('ready')
      })
      .catch((err: unknown) => {
        if (isAbort(err)) return
        setEventsStatus('error')
        setEventsError(errorMessage(err))
      })
    return () => {
      controller.abort()
    }
  }, [eventsNonce])

  const refreshEvents = useCallback(() => {
    setEventsNonce((n) => n + 1)
  }, [])

  useEffect(() => {
    if (!signedIn) return
    const reinvent = events.find((e) => e.eventId === 'reinvent2026')
    if (!reinvent) return
    prefetchCatalog(reinvent.eventId)
    if (reinvent.authenticationRequired) prefetchSchedule(reinvent.eventId)
  }, [signedIn, events])

  useEffect(() => {
    setLoadedEvent(null)
    setEventError(null)
    if (!eventId) return

    const controller = new AbortController()
    api
      .getEvent(eventId, controller.signal)
      .then(setLoadedEvent)
      .catch((err: unknown) => {
        if (!isAbort(err)) setEventError(errorMessage(err))
      })
    return () => {
      controller.abort()
    }
  }, [eventId])

  const event = useMemo(() => {
    if (!eventId) return null
    if (loadedEvent?.eventId === eventId) return loadedEvent

    return events.find((candidate) => candidate.eventId === eventId) ?? null
  }, [eventId, loadedEvent, events])

  const timeZone = event?.timezone || FALLBACK_TZ

  const requiresAuth = event?.authenticationRequired ?? false
  const scheduleMode: 'remote' | 'local' = requiresAuth ? 'remote' : 'local'

  const days = useMemo(
    () => (event ? enumerateEventDays(event.startDate, event.endDate, timeZone) : []),
    [event, timeZone],
  )

  useEffect(() => {
    if (!eventId || !event || (requiresAuth && !signedIn)) {
      setCatalog([])
      setCatalogStatus('idle')
      setLoadedCount(0)
      setCatalogTotal(0)
      setCatalogBlock(null)
      return
    }

    const ready = catalogNonce === 0 ? cachedCatalog(eventId) : null
    if (ready) {
      setCatalog(ready.map(toView))
      setLoadedCount(ready.length)
      setCatalogStatus('ready')
      return
    }

    setCatalogStatus('loading')
    setCatalogError(null)
    setCatalogBlock(null)
    setLoadedCount(0)

    const accumulated: SessionView[] = []
    let cancelled = false

    loadCatalog(eventId, (page, loaded, total) => {
      if (cancelled) return
      for (const session of page) accumulated.push(toView(session))
      setCatalog(accumulated.slice())
      setLoadedCount(loaded)
      setCatalogTotal(total)
    })
      .then((sessions) => {
        if (cancelled) return

        if (accumulated.length !== sessions.length || sessions.length === 0) {
          setCatalog(sessions.map(toView))
          setLoadedCount(sessions.length)
        }
        setCatalogStatus('ready')
      })
      .catch((err: unknown) => {
        if (cancelled || isAbort(err)) return

        setCatalogStatus('error')
        setCatalogError(errorMessage(err))
        if (err instanceof ApiError) {
          if (err.kind === 'notRegistered') setCatalogBlock('notRegistered')
          else if (err.kind === 'unavailable') setCatalogBlock('unavailable')
        }
      })

    return () => {
      cancelled = true
    }
  }, [signedIn, eventId, event, requiresAuth, catalogNonce])

  const refreshCatalog = useCallback(() => {
    if (eventId) invalidateCatalog(eventId)
    setCatalogNonce((n) => n + 1)
  }, [eventId])

  const byId = useMemo(() => {
    const map = new Map<string, SessionView>()
    for (const view of catalog) map.set(view.session.sessionId, view)
    return map
  }, [catalog])

  const reloadSchedule = useCallback(
    async (signal?: AbortSignal) => {
      if (!eventId) return null

      if (scheduleMode === 'local') return null
      const { schedule } = await api.getSchedule(eventId, signal)
      applySchedule(schedule)
      return schedule
    },
    [applySchedule, eventId, scheduleMode],
  )

  const commitLocal = useCallback(
    (next: Schedule) => {
      applySchedule(next)
      if (eventId) writeLocalSchedule(eventId, next)
    },
    [applySchedule, eventId],
  )

  const snapshot = useCallback((): Schedule => scheduleRef.current, [])

  useEffect(() => {
    if (!eventId || !event) {
      applySchedule(EMPTY_SCHEDULE)
      setScheduleStatus('idle')
      return
    }

    if (scheduleMode === 'local') {
      applySchedule(readLocalSchedule(eventId))
      setScheduleStatus('ready')
      return
    }

    if (!signedIn) {
      applySchedule(EMPTY_SCHEDULE)
      setScheduleStatus('idle')
      return
    }

    const controller = new AbortController()
    let cancelled = false
    setScheduleStatus('loading')

    const warmed = takePrefetchedSchedule(eventId)
    const load = warmed
      ? warmed.then((schedule) => {
          if (!cancelled) applySchedule(schedule)
        })
      : reloadSchedule(controller.signal).then(() => undefined)

    load
      .then(() => {
        if (!cancelled) setScheduleStatus('ready')
      })
      .catch((err: unknown) => {
        if (cancelled || isAbort(err)) return
        setScheduleStatus('error')
        pushToast({
          tone: 'error',
          title: 'Could not load your schedule',
          detail: errorMessage(err),
        })
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [signedIn, eventId, event, scheduleMode, applySchedule, reloadSchedule, pushToast])

  const markPending = useCallback((id: string, active: boolean) => {
    setPending((current) => {
      const next = new Set(current)
      if (active) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const titleOf = useCallback(
    (sessionId: string) => byId.get(sessionId)?.session.title ?? sessionId,
    [byId],
  )

  const reportBulk = useCallback(
    (
      failed: { sessionId: string; code: string; conflictsWith?: string[] }[],
      fallbackTitle: string,
    ): boolean => {
      if (failed.length === 0) return true
      for (const failure of failed) {
        pushToast({
          tone: 'error',
          title: fallbackTitle,
          detail: describeBulkFailure(
            failure.code,
            (failure.conflictsWith ?? []).map(titleOf),
          ),
        })
      }
      return false
    },
    [pushToast, titleOf],
  )

  const toggleFavorite = useCallback(
    async (sessionId: string) => {
      if (!eventId) return

      const before = snapshot()
      const wasFavorite = before.favorites.includes(sessionId)

      const flipped: Schedule = {
        ...before,
        favorites: wasFavorite
          ? before.favorites.filter((id) => id !== sessionId)
          : [...before.favorites, sessionId],
      }

      if (scheduleMode === 'local') {
        commitLocal(flipped)
        return
      }

      markPending(sessionId, true)
      applySchedule(flipped)

      try {
        if (wasFavorite) {
          await api.removeFavorite(eventId, sessionId)
        } else {
          const { result } = await api.addFavorites(eventId, [sessionId])
          if (!reportBulk(result.failed, 'Could not add favorite')) {
            await reloadSchedule()
          }
        }
      } catch (err) {
        applySchedule(before)
        pushToast({
          tone: 'error',
          title: wasFavorite ? 'Could not remove favorite' : 'Could not add favorite',
          detail: errorMessage(err),
        })
      } finally {
        markPending(sessionId, false)
      }
    },
    [
      applySchedule,
      commitLocal,
      eventId,
      markPending,
      pushToast,
      reloadSchedule,
      reportBulk,
      scheduleMode,
      snapshot,
    ],
  )

  const toggleReservation = useCallback(
    async (sessionId: string) => {
      if (!eventId) return
      const before = snapshot()
      const wasReserved = before.reserved.includes(sessionId)

      if (scheduleMode === 'local') {
        if (wasReserved) {
          commitLocal({
            ...before,
            reserved: before.reserved.filter((id) => id !== sessionId),
          })
          pushToast({ tone: 'info', title: 'Reservation removed', detail: LOCAL_NOTE })
          return
        }

        const view = byId.get(sessionId)
        const span =
          view?.startMin !== undefined && view.endMin !== undefined
            ? { startMin: view.startMin, endMin: view.endMin }
            : null

        const clash = span
          ? before.reserved
              .map((id) => byId.get(id))
              .find((other) => {
                if (!other || other.dateKey !== view?.dateKey) return false
                if (other.startMin === undefined || other.endMin === undefined) return false
                return overlaps(span, { startMin: other.startMin, endMin: other.endMin })
              })
          : undefined

        if (clash) {
          pushToast({
            tone: 'error',
            title: 'Could not reserve',
            detail: `Clashes with ${clash.session.title}.`,
          })
          return
        }

        commitLocal({ ...before, reserved: [...before.reserved, sessionId] })
        pushToast({ tone: 'success', title: 'Added to your plan', detail: LOCAL_NOTE })
        return
      }

      markPending(sessionId, true)
      applySchedule({
        ...before,
        reserved: wasReserved
          ? before.reserved.filter((id) => id !== sessionId)
          : [...before.reserved, sessionId],
      })

      try {
        if (wasReserved) {
          await api.cancelReservation(eventId, sessionId)
          pushToast({ tone: 'info', title: 'Reservation cancelled' })
        } else {
          const { result } = await api.reserveSessions(eventId, [sessionId])
          if (result.failed.length > 0) {
            reportBulk(result.failed, 'Could not reserve')
            applySchedule(before)
          } else {
            pushToast({ tone: 'success', title: 'Seat reserved' })
          }
        }
      } catch (err) {
        applySchedule(before)
        pushToast({
          tone: 'error',
          title: wasReserved ? 'Could not cancel reservation' : 'Could not reserve',
          detail: err instanceof ApiError ? err.message : errorMessage(err),
        })
      } finally {
        markPending(sessionId, false)
      }
    },
    [
      applySchedule,
      byId,
      commitLocal,
      eventId,
      markPending,
      pushToast,
      reportBulk,
      scheduleMode,
      snapshot,
    ],
  )

  const applyPlan = useCallback(
    async (
      sessionIds: string[],
      options: { reserve: ReadonlySet<string> },
    ): Promise<ApplyPlanResult> => {
      const result: ApplyPlanResult = { favorited: 0, reserved: 0, failures: [] }
      if (sessionIds.length === 0 || !eventId) return result

      if (scheduleMode === 'local') {
        const before = snapshot()
        const favoriteSet = new Set<string>(before.favorites)
        const reservedSet = new Set<string>(before.reserved)

        for (const id of sessionIds) {
          if (!favoriteSet.has(id)) {
            favoriteSet.add(id)
            result.favorited += 1
          }
          if (
            options.reserve.has(id) &&
            byId.get(id)?.session.isReservable &&
            !reservedSet.has(id)
          ) {
            reservedSet.add(id)
            result.reserved += 1
          }
        }

        commitLocal({
          ...before,
          favorites: [...favoriteSet],
          reserved: [...reservedSet],
        })
        return result
      }

      const live = snapshot()
      const alreadyFavorite = new Set(live.favorites)
      const alreadyReserved = new Set(live.reserved)
      const toFavorite = sessionIds.filter((id) => !alreadyFavorite.has(id))
      const toReserve = sessionIds.filter(
        (id) =>
          options.reserve.has(id) &&
          byId.get(id)?.session.isReservable &&
          !alreadyReserved.has(id),
      )

      type Task =
        | { kind: 'favorite'; batch: string[] }
        | { kind: 'reserve'; batch: string[] }

      const tasks: Task[] = [
        ...chunk(toFavorite, BULK_LIMIT).map((batch) => ({ kind: 'favorite' as const, batch })),
        ...chunk(toReserve, BULK_LIMIT).map((batch) => ({ kind: 'reserve' as const, batch })),
      ]

      const settled = await mapPool(tasks, REQUEST_CONCURRENCY, async (task) => {
        const { result: bulk } =
          task.kind === 'favorite'
            ? await api.addFavorites(eventId, task.batch)
            : await api.reserveSessions(eventId, task.batch)
        return { kind: task.kind, bulk }
      })

      let transportFailure: string | null = null
      for (const outcome of settled) {
        if (outcome.status === 'rejected') {
          transportFailure ??= errorMessage(outcome.reason)
          continue
        }
        const { kind, bulk } = outcome.value
        if (kind === 'favorite') {
          result.favorited += bulk.successful.length
          for (const failure of bulk.failed) {
            if (failure.code !== 'alreadyFavorited') result.failures.push(failure)
          }
        } else {
          result.reserved += bulk.successful.length
          result.failures.push(...bulk.failed)
        }
      }

      if (transportFailure) {
        pushToast({
          tone: 'error',
          title: 'Some of the plan could not be saved',
          detail: transportFailure,
        })
      }

      try {
        await reloadSchedule()
      } catch {}

      return result
    },
    [
      byId,
      commitLocal,
      eventId,
      snapshot,
      pushToast,
      reloadSchedule,
      scheduleMode,
    ],
  )

  const addPersonalTime = useCallback(
    async (inputs: PersonalTimeInput[]): Promise<boolean> => {
      if (!eventId || inputs.length === 0) return false

      const summary = (count: number) =>
        count === 1 ? inputs[0].title : `${inputs[0].title} · ${count} days`

      if (scheduleMode === 'local') {
        const before = snapshot()
        commitLocal({
          ...before,
          personalTime: [
            ...before.personalTime,
            ...inputs.map((input) => makeLocalPersonalTime(input)),
          ],
        })
        pushToast({
          tone: 'success',
          title: 'Added to your plan',
          detail: `${summary(inputs.length)} — ${LOCAL_NOTE}`,
        })
        return true
      }

      const settled = await mapPool(inputs, REQUEST_CONCURRENCY, (input) =>
        api.createPersonalTime(eventId, input),
      )
      const failures = settled
        .filter((outcome) => outcome.status === 'rejected')
        .map((outcome) => errorMessage((outcome as PromiseRejectedResult).reason))

      try {
        await reloadSchedule()
      } catch {}

      if (failures.length === inputs.length) {
        pushToast({
          tone: 'error',
          title: 'Could not add that block',
          detail: failures[0],
        })
        return false
      }

      if (failures.length > 0) {
        pushToast({
          tone: 'info',
          title: `Added ${inputs.length - failures.length} of ${inputs.length} days`,
          detail: failures[0],
        })
        return true
      }

      pushToast({
        tone: 'success',
        title: 'Added to your schedule',
        detail: summary(inputs.length),
      })
      return true
    },
    [commitLocal, eventId, pushToast, reloadSchedule, scheduleMode, snapshot],
  )

  const editPersonalTime = useCallback(
    async (id: string, input: PersonalTimeInput): Promise<boolean> => {
      if (!eventId) return false

      if (scheduleMode === 'local') {
        const before = snapshot()
        commitLocal({
          ...before,
          personalTime: before.personalTime.map((entry) =>
            entry.personalTimeId === id ? { ...entry, ...input } : entry,
          ),
        })
        return true
      }

      const before = snapshot()

      applySchedule({
        ...before,
        personalTime: before.personalTime.map((entry) =>
          entry.personalTimeId === id ? { ...entry, ...input } : entry,
        ),
      })
      try {
        await api.updatePersonalTime(eventId, id, input)
        await reloadSchedule()
        return true
      } catch (err) {
        applySchedule(before)
        pushToast({
          tone: 'error',
          title: 'Could not update that block',
          detail: errorMessage(err),
        })
        return false
      }
    },
    [
      applySchedule,
      commitLocal,
      eventId,
      pushToast,
      reloadSchedule,
      scheduleMode,
      snapshot,
    ],
  )

  const removePersonalTime = useCallback(
    async (id: string): Promise<boolean> => {
      if (!eventId) return false

      if (scheduleMode === 'local') {
        const before = snapshot()
        commitLocal({
          ...before,
          personalTime: before.personalTime.filter(
            (entry) => entry.personalTimeId !== id,
          ),
        })
        pushToast({ tone: 'info', title: 'Block removed' })
        return true
      }

      const before = snapshot()
      applySchedule({
        ...before,
        personalTime: before.personalTime.filter((entry) => entry.personalTimeId !== id),
      })
      try {
        await api.deletePersonalTime(eventId, id)
        pushToast({ tone: 'info', title: 'Block removed' })
        return true
      } catch (err) {
        applySchedule(before)
        pushToast({
          tone: 'error',
          title: 'Could not remove that block',
          detail: errorMessage(err),
        })
        return false
      }
    },
    [applySchedule, commitLocal, eventId, pushToast, scheduleMode, snapshot],
  )

  const value = useMemo<AppValue>(
    () => ({
      signedIn,
      user,
      signIn,
      signOutApp,
      events,
      eventsStatus,
      eventsError,
      refreshEvents,
      eventId,
      event,
      eventError,
      days,
      timeZone,
      scheduleMode,
      requiresAuth,
      catalog,
      byId,
      catalogStatus,
      loadedCount,
      catalogTotal,
      catalogError,
      catalogBlock,
      refreshCatalog,
      favorites,
      reserved,
      personalTime,
      scheduleStatus,
      pending,
      toggleFavorite,
      toggleReservation,
      applyPlan,
      addPersonalTime,
      editPersonalTime,
      removePersonalTime,
      toasts,
      pushToast,
      dismissToast,
    }),
    [
      signedIn,
      user,
      signIn,
      signOutApp,
      events,
      eventsStatus,
      eventsError,
      refreshEvents,
      eventId,
      event,
      eventError,
      days,
      timeZone,
      scheduleMode,
      requiresAuth,
      catalog,
      byId,
      catalogStatus,
      loadedCount,
      catalogTotal,
      catalogError,
      catalogBlock,
      refreshCatalog,
      favorites,
      reserved,
      personalTime,
      scheduleStatus,
      pending,
      toggleFavorite,
      toggleReservation,
      applyPlan,
      addPersonalTime,
      editPersonalTime,
      removePersonalTime,
      toasts,
      pushToast,
      dismissToast,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
