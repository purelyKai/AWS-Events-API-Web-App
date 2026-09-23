export const API_BASE = '/api'

export const OAUTH_DOMAIN = 'https://oauth.awsevents.com'

export const CLIENT_ID = '7vmom55m1qstvq8i71ph127bfq'

export const IDP_LOGOUT_ENDPOINT = 'https://idp.awsevents.com/oidc/logout'

export const SCOPES = 'openid email events/access'

export const OAUTH_PORTS = [8484, 8485, 8486, 8487, 8488, 8489]

export const OAUTH_HOSTS = ['localhost', '127.0.0.1', '[::1]']

export const REDIRECT_URI = `${location.origin}/callback`

export const LOGOUT_REDIRECT_URI = `${location.origin}/logout`

export function isSupportedOrigin(): boolean {
  const { hostname, port, protocol } = location
  if (protocol !== 'http:' && protocol !== 'https:') return false
  if (!OAUTH_HOSTS.includes(hostname)) return false
  return OAUTH_PORTS.includes(Number(port))
}

export const CATALOG_TTL_MS = 2 * 60 * 60 * 1000

export const STORAGE_PREFIX = 'awsevents.'

export const catalogKey = (eventId: string) => `${STORAGE_PREFIX}catalog.${eventId}`

export const STORAGE_KEYS = {
  tokens: `${STORAGE_PREFIX}tokens`,
  pkce: `${STORAGE_PREFIX}pkce`,
  signedOut: `${STORAGE_PREFIX}signedOut`,
} as const
