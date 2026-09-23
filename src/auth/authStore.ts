import {
  CLIENT_ID,
  OAUTH_DOMAIN,
  IDP_LOGOUT_ENDPOINT,
  LOGOUT_REDIRECT_URI,
  REDIRECT_URI,
  SCOPES,
  STORAGE_KEYS,
  STORAGE_PREFIX,
} from '../config'
import { createCodeVerifier, createState, deriveCodeChallenge } from './pkce'

const CATALOG_KEY_PREFIX = `${STORAGE_PREFIX}catalog.`

export interface Tokens {
  accessToken: string
  refreshToken?: string
  idToken?: string
  expiresAt: number
}

export interface UserInfo {
  email?: string
  username?: string
}

const listeners = new Set<() => void>()

function readTokens(): Tokens | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.tokens)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Tokens
    return parsed?.accessToken ? parsed : null
  } catch {
    return null
  }
}

let tokens: Tokens | null = readTokens()

function writeTokens(next: Tokens | null) {
  tokens = next
  try {
    if (next) localStorage.setItem(STORAGE_KEYS.tokens, JSON.stringify(next))
    else localStorage.removeItem(STORAGE_KEYS.tokens)
  } catch {}
  for (const fn of listeners) fn()
}

export const subscribeAuth = (fn: () => void): (() => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export const isSignedIn = (): boolean => tokens !== null

export function getUserInfo(): UserInfo | null {
  if (!tokens?.idToken) return null
  try {
    const payload = tokens.idToken.split('.')[1]
    const json = JSON.parse(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
    ) as Record<string, unknown>
    const pick = (key: string) =>
      typeof json[key] === 'string' ? (json[key] as string) : undefined
    return {
      email: pick('email'),
      username: pick('cognito:username') ?? pick('sub'),
    }
  } catch {
    return null
  }
}

export async function beginSignIn(): Promise<void> {
  const verifier = createCodeVerifier()
  const state = createState()
  const challenge = await deriveCodeChallenge(verifier)

  sessionStorage.setItem(
    STORAGE_KEYS.pkce,
    JSON.stringify({ verifier, state, returnTo: location.pathname }),
  )

  const url = new URL(`${OAUTH_DOMAIN}/oauth2/authorize`)
  url.searchParams.set('client_id', CLIENT_ID)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', SCOPES)
  url.searchParams.set('redirect_uri', REDIRECT_URI)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('state', state)

  location.assign(url.toString())
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  id_token?: string
  expires_in: number
  token_type: string
}

async function postToken(body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(`${OAUTH_DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const text = await res.text()
  if (!res.ok) {
    let detail = text
    try {
      const parsed = JSON.parse(text) as { error?: string }
      if (parsed.error) detail = parsed.error
    } catch {}
    throw new Error(`Token request failed (${res.status}): ${detail}`)
  }
  return JSON.parse(text) as TokenResponse
}

function store(res: TokenResponse, fallbackRefresh?: string) {
  writeTokens({
    accessToken: res.access_token,
    refreshToken: res.refresh_token ?? fallbackRefresh,
    idToken: res.id_token,
    expiresAt: Date.now() + (res.expires_in - 60) * 1000,
  })
}

let completionInFlight: Promise<string> | null = null

export function completeSignIn(): Promise<string> {
  completionInFlight ??= exchangeAuthorizationCode()
  return completionInFlight
}

async function exchangeAuthorizationCode(): Promise<string> {
  const params = new URLSearchParams(location.search)

  const error = params.get('error')
  if (error) throw new Error(params.get('error_description') || error)

  const code = params.get('code')
  if (!code) return '/'

  const stashed = sessionStorage.getItem(STORAGE_KEYS.pkce)
  sessionStorage.removeItem(STORAGE_KEYS.pkce)
  if (!stashed) throw new Error('Sign-in session expired. Please try again.')

  const { verifier, state, returnTo } = JSON.parse(stashed) as {
    verifier: string
    state: string
    returnTo?: string
  }

  if (params.get('state') !== state) {
    throw new Error('State mismatch on the sign-in response — request rejected.')
  }

  store(
    await postToken(
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
      }),
    ),
  )

  return returnTo && returnTo !== '/callback' && returnTo !== '/logout'
    ? returnTo
    : '/'
}

let refreshInFlight: Promise<string> | null = null

export async function getAccessToken(): Promise<string | null> {
  if (!tokens) return null
  if (Date.now() < tokens.expiresAt) return tokens.accessToken
  return refreshAccessToken()
}

export async function refreshAccessToken(): Promise<string> {
  if (refreshInFlight) return refreshInFlight

  const refreshToken = tokens?.refreshToken
  if (!refreshToken) {
    signOutLocal()
    throw new Error('Session expired. Please sign in again.')
  }

  refreshInFlight = (async () => {
    try {
      const res = await postToken(
        new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: CLIENT_ID,
          refresh_token: refreshToken,
        }),
      )
      store(res, refreshToken)
      return res.access_token
    } catch (err) {
      signOutLocal()
      throw err
    } finally {
      refreshInFlight = null
    }
  })()

  return refreshInFlight
}

export function signOutLocal() {
  writeTokens(null)
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(CATALOG_KEY_PREFIX)) localStorage.removeItem(key)
    }
  } catch {}
}

async function revokeAndClear(): Promise<void> {
  const refreshToken = tokens?.refreshToken
  signOutLocal()
  if (!refreshToken) return
  try {
    await fetch(`${OAUTH_DOMAIN}/oauth2/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: refreshToken, client_id: CLIENT_ID }),
    })
  } catch {}
}

function oauthLogoutUrl(): string {
  const url = new URL(`${OAUTH_DOMAIN}/logout`)
  url.searchParams.set('client_id', CLIENT_ID)
  url.searchParams.set('logout_uri', LOGOUT_REDIRECT_URI)
  return url.toString()
}

export async function signOut(): Promise<void> {
  await revokeAndClear()

  try {
    sessionStorage.setItem(STORAGE_KEYS.signedOut, '1')
  } catch {}

  const url = new URL(IDP_LOGOUT_ENDPOINT)
  url.searchParams.set('redirect_uri', oauthLogoutUrl())
  location.assign(url.toString())
}
