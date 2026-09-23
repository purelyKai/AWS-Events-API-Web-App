import { getAccessToken, refreshAccessToken, signOutLocal } from '../auth/authStore'
import { API_BASE } from '../config'

export type ApiErrorKind =
  | 'needsSignIn'
  | 'notRegistered'
  | 'notFound'
  | 'throttled'
  | 'unavailable'
  | 'other'

function kindFor(status: number): ApiErrorKind {
  switch (status) {
    case 401:
      return 'needsSignIn'
    case 403:
      return 'notRegistered'
    case 404:
      return 'notFound'
    case 429:
      return 'throttled'
    case 503:
      return 'unavailable'
    default:
      return 'other'
  }
}

export class ApiError extends Error {
  readonly status: number
  readonly kind: ApiErrorKind

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.kind = kindFor(status)
  }

  get needsSignIn(): boolean {
    return this.kind === 'needsSignIn'
  }
}

const RETRY_STATUSES = new Set([429, 503])

const maxAttemptsFor = (status: number) => (status === 429 ? 3 : 2)

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function retryDelayMs(res: Response, attempt: number): number {
  const header = res.headers.get('retry-after')
  if (header) {
    const seconds = Number(header)
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 10_000)
    const at = Date.parse(header)
    if (!Number.isNaN(at)) return Math.min(Math.max(at - Date.now(), 0), 10_000)
  }

  return 250 * 2 ** (attempt - 1) + Math.random() * 150
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
  anonymous?: boolean
  signal?: AbortSignal
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(API_BASE + path, location.origin)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value))
    }
  }
  return url.pathname + url.search
}

async function readError(res: Response): Promise<ApiError> {
  let message = `Request failed with status ${res.status}`
  try {
    const text = await res.text()
    if (text) {
      try {
        const parsed = JSON.parse(text) as { message?: string }
        if (parsed.message) message = parsed.message
      } catch {
        message = text.slice(0, 300)
      }
    }
  } catch {}
  return new ApiError(res.status, message)
}

export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, query, anonymous = false, signal } = options

  const send = (token: string | null): Promise<Response> => {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    return fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  }

  const token = anonymous ? null : await getAccessToken()
  let res = await send(token)

  for (
    let attempt = 1;
    attempt < maxAttemptsFor(res.status) && RETRY_STATUSES.has(res.status);
    attempt += 1
  ) {
    await sleep(retryDelayMs(res, attempt))
    res = await send(token)
  }

  if (res.status === 401 && !anonymous && token) {
    let renewed: string
    try {
      renewed = await refreshAccessToken()
    } catch {
      signOutLocal()
      throw new ApiError(401, 'Your session expired. Please sign in again.')
    }
    res = await send(renewed)
    if (res.status === 401) {
      throw new ApiError(
        401,
        'Signed in, but this request was not authorized. Try signing out and back in.',
      )
    }
  }

  if (!res.ok) throw await readError(res)

  if (res.status === 204) return undefined as T
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}
