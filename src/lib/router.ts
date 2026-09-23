import { useEffect, useState } from 'react'

export type Route =
  | { name: 'events' }
  | { name: 'event'; eventId: string }
  | { name: 'callback' }
  | { name: 'logout' }

export function parseRoute(pathname: string): Route {
  if (pathname === '/callback') return { name: 'callback' }
  if (pathname === '/logout') return { name: 'logout' }

  const match = /^\/e\/(.+?)\/?$/.exec(pathname)
  if (match) {
    const eventId = decodeURIComponent(match[1])
    if (eventId) return { name: 'event', eventId }
  }

  return { name: 'events' }
}

export const eventPath = (eventId: string): string =>
  `/e/${encodeURIComponent(eventId)}`

const listeners = new Set<() => void>()

export function navigate(path: string, options: { replace?: boolean } = {}) {
  if (options.replace) window.history.replaceState({}, '', path)
  else window.history.pushState({}, '', path)
  for (const fn of listeners) fn()
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname))

  useEffect(() => {
    const sync = () => {
      setRoute(parseRoute(window.location.pathname))
    }
    listeners.add(sync)
    window.addEventListener('popstate', sync)

    sync()
    return () => {
      listeners.delete(sync)
      window.removeEventListener('popstate', sync)
    }
  }, [])

  return route
}
