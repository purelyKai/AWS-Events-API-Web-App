import type { CSSProperties } from 'react'

import type { AwsEvent } from '../api/types'
import { isSupportedOrigin, OAUTH_PORTS } from '../config'
import { formatEventRange } from '../lib/events'
import { navigate } from '../lib/router'
import { useApp } from '../store/appContext'
import { ThemeToggle } from './ThemeToggle'
import { Wordmark } from './Wordmark'
import { Button, Icon, Spinner } from './ui'
import type { IconName } from './ui'

const FEATURES: { icon: IconName; title: string; detail: string }[] = [
  {
    icon: 'search',
    title: 'Search the whole catalog',
    detail:
      'Full-text across titles, abstracts, speakers and services, with faceted filters for day, level, track and venue.',
  },
  {
    icon: 'ticket',
    title: 'Reserve and favorite',
    detail:
      'Hold seats on reservable sessions, star anything you want to keep an eye on, and see live seat availability.',
  },
  {
    icon: 'calendar',
    title: 'Drag out your own time',
    detail:
      'Drag across the calendar to block personal time, then drag or resize it to adjust. Reservations land on the grid automatically.',
  },
]

export function SignInScreen({
  busy,
  error,
  event,
}: {
  busy?: boolean
  error?: string | null
  event?: AwsEvent
}) {
  const { signIn, events, eventsError } = useApp()

  const originOk = isSupportedOrigin()

  return (
    <div className="flex min-h-screen flex-col">

      <div className="lit-bar">
        <span aria-hidden="true" className="hero-grain" />

        <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center gap-3 px-6 pt-6">
          <span className="grid size-8 place-items-center rounded-lg bg-accent text-accent-ink shadow-sm">
            <Icon name="layers" className="size-4.5" />
          </span>
          <p className="text-sm font-bold tracking-tight text-fg-strong">AWS Events</p>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>

        <div
          className="relative z-10 mx-auto w-full max-w-4xl px-6 pb-16 pt-8 text-center"

          style={{ '--wordmark-size': 'clamp(2rem, min(10vw, 17vh), 8rem)' } as CSSProperties}
        >
          {event ? (
            <>
              <Wordmark name={event.name} />
              <p className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-semibold text-fg-muted">
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="calendar" className="size-3.5 text-accent-text" />
                  {formatEventRange(event)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="pin" className="size-3.5 text-accent-text" />
                  {event.isOnline ? 'Online' : (event.address?.city ?? '—')}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="user" className="size-3.5 text-accent-text" />
                  attendee sign-in
                </span>
              </p>
            </>
          ) : (
            <>
              <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight text-fg-strong sm:text-5xl">
                AWS Events
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-fg-muted">
                Pick any event, browse its catalog, reserve sessions, and build your
                week on an interactive calendar.
                {events.length > 0 ? ` ${events.length} events available.` : ''}
              </p>
            </>
          )}
        </div>

        <span aria-hidden="true" className="hero-halation h-20" />
        <span aria-hidden="true" className="hero-rail z-20" />
      </div>

      <main className="work-floor flex-1 px-6 pb-16 pt-12">
        <div className="mx-auto w-full max-w-md">
          {error ? (
            <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-danger-soft px-3.5 py-3 ring-1 ring-danger-line">
              <Icon name="warning" className="mt-0.5 size-4 shrink-0 text-danger" />
              <p className="text-xs leading-snug text-danger">{error}</p>
            </div>
          ) : null}

          {!originOk ? (
            <div className="mb-4 rounded-xl bg-warn-soft px-3.5 py-3 text-[11px] leading-relaxed text-warn ring-1 ring-warn-line">
              <p className="font-bold">Sign-in is not available from this address</p>
              <p className="mt-1">
                This app is registered only for{' '}
                <span className="font-mono">localhost</span> and{' '}
                <span className="font-mono">127.0.0.1</span> on ports {OAUTH_PORTS[0]}–
                {OAUTH_PORTS[OAUTH_PORTS.length - 1]}. You are on{' '}
                <span className="font-mono">{window.location.host}</span>. Open it on one
                of those addresses to sign in — events that don't require an attendee
                still work here.
              </p>
            </div>
          ) : null}

          <Button
            variant="primary"
            onClick={signIn}
            disabled={busy || !originOk}
            className="w-full rounded-xl py-3 text-sm"
          >
            {busy ? (
              <>
                <Spinner className="size-4" />
                Completing sign-in…
              </>
            ) : (
              <>
                <Icon name="user" className="size-4" />
                {event ? 'Sign in to open this event' : 'Sign in to continue'}
              </>
            )}
          </Button>

          {event ? (
            <button
              type="button"
              onClick={() => navigate('/')}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs text-fg-muted transition hover:bg-surface-2 hover:text-fg"
            >
              <Icon name="chevronRight" className="size-3.5 rotate-180" />
              Back to all events
            </button>
          ) : null}

          <p className="mt-4 text-center text-[11px] leading-relaxed text-fg-subtle">
            Events marked <span className="font-semibold text-success">open</span> can be
            browsed and planned without signing in — those plans stay in your browser.
            Sign-in is only needed for events that require an attendee.
          </p>

          {eventsError ? (
            <p className="mt-3 text-center text-[11px] text-warn">
              Could not load the event list: {eventsError}
            </p>
          ) : null}
        </div>

        <ul className="mx-auto mt-12 grid w-full max-w-4xl gap-4 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <li key={feature.title} className="tile tile-t1 rounded-2xl p-4 text-left">
              <span className="mb-3 grid size-9 place-items-center rounded-xl bg-accent-soft text-accent-text ring-1 ring-accent-line">
                <Icon name={feature.icon} className="size-4.5" />
              </span>
              <p className="text-xs font-bold text-fg-strong">{feature.title}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-fg-muted">
                {feature.detail}
              </p>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}
