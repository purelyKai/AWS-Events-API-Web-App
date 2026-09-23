import { request } from './client'
import type {
  AwsEvent,
  BulkResult,
  ListSessionsResponse,
  PersonalTimeInput,
  Schedule,
  Session,
} from './types'

const path = (eventId: string, suffix = '') =>
  `/v1/events/${encodeURIComponent(eventId)}${suffix}`

export const listEvents = async (
  includePast: boolean,
  signal?: AbortSignal,
): Promise<AwsEvent[]> =>
  (
    await request<{ items: AwsEvent[] }>('/v1/events', {
      anonymous: true,
      query: includePast ? { includePast: true } : undefined,
      signal,
    })
  ).items

export const getEvent = async (
  eventId: string,
  signal?: AbortSignal,
): Promise<AwsEvent> =>
  (await request<{ event: AwsEvent }>(path(eventId), { anonymous: true, signal })).event

export const getSession = (eventId: string, sessionId: string, signal?: AbortSignal) =>
  request<{ session: Session }>(
    path(eventId, `/sessions/${encodeURIComponent(sessionId)}`),
    { signal },
  )

const listSessionsPage = (
  eventId: string,
  nextToken: string | undefined,
  signal?: AbortSignal,
) =>
  request<ListSessionsResponse>(path(eventId, '/sessions'), {
    query: { locale: 'en-US', nextToken },
    signal,
  })

export async function listAllSessions(
  eventId: string,
  onPage?: (page: Session[], loadedSoFar: number, totalCount: number) => void,
  signal?: AbortSignal,
): Promise<Session[]> {
  const all: Session[] = []
  let nextToken: string | undefined
  let pages = 0

  do {
    const page = await listSessionsPage(eventId, nextToken, signal)
    all.push(...page.items)
    nextToken = page.nextToken
    onPage?.(page.items, all.length, page.totalCount)
    pages += 1

    if (pages > 200) break
  } while (nextToken)

  return all
}

export const getSchedule = (eventId: string, signal?: AbortSignal) =>
  request<{ schedule: Schedule }>(path(eventId, '/schedule'), { signal })

export const reserveSessions = (eventId: string, sessionIds: string[]) =>
  request<{ result: BulkResult }>(path(eventId, '/reservations'), {
    method: 'POST',
    body: { sessionIds },
  })

export const cancelReservation = (eventId: string, sessionId: string) =>
  request<void>(path(eventId, `/reservations/${encodeURIComponent(sessionId)}`), {
    method: 'DELETE',
  })

export const addFavorites = (eventId: string, sessionIds: string[]) =>
  request<{ result: BulkResult }>(path(eventId, '/favorites'), {
    method: 'POST',
    body: { sessionIds },
  })

export const removeFavorite = (eventId: string, sessionId: string) =>
  request<void>(path(eventId, `/favorites/${encodeURIComponent(sessionId)}`), {
    method: 'DELETE',
  })

export const createPersonalTime = (eventId: string, input: PersonalTimeInput) =>
  request<void>(path(eventId, '/personal-time'), { method: 'POST', body: input })

export const updatePersonalTime = (
  eventId: string,
  id: string,
  input: PersonalTimeInput,
) =>
  request<void>(path(eventId, `/personal-time/${encodeURIComponent(id)}`), {
    method: 'PUT',
    body: input,
  })

export const deletePersonalTime = (eventId: string, id: string) =>
  request<void>(path(eventId, `/personal-time/${encodeURIComponent(id)}`), {
    method: 'DELETE',
  })
