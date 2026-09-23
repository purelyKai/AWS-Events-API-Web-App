import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import type { AwsEvent } from '../api/types'
import {
  cachedCatalog,
  isNotRegistered,
  prefetchCatalog,
  subscribeCatalogs,
} from '../lib/catalogStore'
import {
  describeWhen,
  eventDays,
  eventMonth,
  formatEventRange,
  groupEvents,
  imminence,
  placeHue,
} from '../lib/events'
import type { EventPhase } from '../lib/events'
import { eventPath, navigate } from '../lib/router'
import { cx } from '../lib/styles'
import { useApp } from '../store/appContext'
import { AccountMenu } from './AccountMenu'
import { ThemeToggle } from './ThemeToggle'
import { Wordmark } from './Wordmark'
import { Badge, Button, EmptyState, Icon, Spinner } from './ui'
import type { IconName } from './ui'

const FLAGSHIP_ID = 'reinvent2026'

const TEST_FIXTURE = /(^|[-_])(test\d*|e2e)([-_]|$)/i
const isFixture = (event: AwsEvent) =>
  TEST_FIXTURE.test(event.eventId) || TEST_FIXTURE.test(event.name)

function iconFor(event: AwsEvent): IconName {
  const text = `${event.eventType} ${event.name}`.toLowerCase()
  if (event.isOnline) return 'globe'
  if (text.includes('re:invent')) return 'spark'
  if (text.includes('summit')) return 'building'
  if (text.includes('symposium') || text.includes('conference')) return 'mic'
  if (text.includes('day') || text.includes('cohort')) return 'users'
  return 'calendar'
}

export function EventsPage() {
  const { events, eventsStatus, eventsError, refreshEvents, signedIn } = useApp()
  const [showPast, setShowPast] = useState(false)

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now())
    }, 60_000)
    return () => {
      window.clearInterval(timer)
    }
  }, [])

  const [, bumpReady] = useState(0)
  useEffect(() => subscribeCatalogs(() => bumpReady((n) => n + 1)), [])

  const visible = useMemo(() => events.filter((e) => !isFixture(e)), [events])
  const grouped = useMemo(() => groupEvents(visible, now), [visible, now])

  const open = (event: AwsEvent) => {
    navigate(eventPath(event.eventId))
  }

  const warm = (event: AwsEvent) => {
    if (event.authenticationRequired && !signedIn) return
    prefetchCatalog(event.eventId)
  }

  const flagship = visible.find((event) => event.eventId === FLAGSHIP_ID)
  const failed = eventsStatus === 'error'
  const firstLoad = eventsStatus === 'loading' && visible.length === 0

  const stage: 'ready' | 'loading' | 'none' = failed
    ? 'none'
    : flagship
      ? 'ready'
      : firstLoad
        ? 'loading'
        : 'none'

  const withoutFlagship = (list: AwsEvent[]) =>
    list.filter((event) => event.eventId !== FLAGSHIP_ID)

  const live = withoutFlagship(grouped.live)
  const upcoming = withoutFlagship(grouped.upcoming)

  return (
    <div className="flex min-h-screen flex-col">

      <div className="relative">
        <section className="hero-band" data-collapsed={stage === 'none'}>
          <span aria-hidden="true" className="hero-hatch" />
          <span aria-hidden="true" className="hero-grain" />

          <Masthead />

          {stage === 'ready' && flagship ? (
            <Stage event={flagship} onOpen={open} onWarm={warm} />
          ) : stage === 'loading' ? (
            <StageSkeleton />
          ) : null}

          <span aria-hidden="true" className="hero-halation" />
          <span aria-hidden="true" className="hero-rail" />
        </section>

        {stage !== 'none' ? <HorizonButton /> : null}
      </div>

      <main id="events" className="work-floor flex-1 pt-18">
        <div className="mx-auto w-full max-w-[1500px] px-5 pb-24">
          {failed ? (
            <EmptyState
              icon="warning"
              title="Could not load events"
              detail={eventsError ?? undefined}
              action={
                <Button variant="primary" size="sm" onClick={refreshEvents}>
                  <Icon name="refresh" className="size-3.5" />
                  Try again
                </Button>
              }
            />
          ) : firstLoad ? (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <li key={i} className="skeleton h-48 rounded-2xl" />
              ))}
            </ul>
          ) : (
            <>
              {live.length > 0 ? (
                <Section
                  title="Happening now"
                  count={live.length}
                  icon="clock"
                  tone="text-success"
                >
                  <Grid events={live} phase="live" now={now} onOpen={open} onWarm={warm} />
                </Section>
              ) : null}

              {upcoming.length > 0 ? (
                <Section
                  title="See our other events"
                  count={upcoming.length}
                  icon="calendar"
                  subtitle="Summits, Cloud & AI Days and symposiums worldwide"
                >
                  <Grid
                    events={upcoming}
                    phase="upcoming"
                    now={now}
                    onOpen={open}
                    onWarm={warm}
                  />
                </Section>
              ) : null}

              {grouped.matched === 0 ? (
                <EmptyState
                  icon="calendar"
                  title="No events to show"
                  detail="The events service returned nothing for this account."
                  action={
                    <Button variant="primary" size="sm" onClick={refreshEvents}>
                      <Icon name="refresh" className="size-3.5" />
                      Try again
                    </Button>
                  }
                />
              ) : null}

              {grouped.past.length > 0 ? (
                <section className="mt-14">

                  <button
                    type="button"
                    onClick={() => setShowPast((v) => !v)}
                    aria-expanded={showPast}
                    className="flex w-full items-center gap-2 border-t border-line pt-6 text-left transition hover:text-fg-strong"
                  >
                    <Icon
                      name={showPast ? 'chevronDown' : 'chevronRight'}
                      className="size-4 text-fg-faint"
                    />
                    <h2 className="text-sm font-bold uppercase tracking-wider text-fg-muted">
                      Past events
                    </h2>
                    <Badge>{grouped.past.length}</Badge>
                    <span className="ml-auto text-[11px] text-fg-subtle">
                      {showPast ? 'hide' : 'show'}
                    </span>
                  </button>

                  {showPast ? (
                    <div className="mt-6">
                      <Grid
                        events={grouped.past}
                        phase="past"
                        now={now}
                        onOpen={open}
                        onWarm={warm}
                      />
                    </div>
                  ) : null}
                </section>
              ) : null}
            </>
          )}

          {eventsStatus === 'loading' && visible.length > 0 ? (
            <p className="mt-10 flex items-center justify-center gap-1.5 text-xs text-fg-subtle">
              <Spinner className="size-3" />
              Loading more events…
            </p>
          ) : null}
        </div>
      </main>
    </div>
  )
}

function Masthead() {
  return (
    <header className="relative z-30 mx-auto flex w-full max-w-[1500px] flex-wrap items-center gap-4 px-5 pb-6 pt-7">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-lg bg-accent text-accent-ink shadow-sm">
          <Icon name="layers" className="size-4.5" />
        </span>
        <p className="truncate text-sm font-bold tracking-tight text-fg-strong">
          AWS Events
        </p>
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />
        <AccountMenu />
      </div>
    </header>
  )
}

function Stage({
  event,
  onOpen,
  onWarm,
}: {
  event: AwsEvent
  onOpen: (event: AwsEvent) => void
  onWarm: (event: AwsEvent) => void
}) {
  const sessionCount = cachedCatalog(event.eventId)?.length ?? null

  const facts: { icon: IconName; value: string }[] = [
    { icon: 'calendar', value: formatEventRange(event) },
    { icon: 'pin', value: event.isOnline ? 'Online' : (event.address?.city ?? '—') },
    sessionCount
      ? { icon: 'layers', value: `${sessionCount.toLocaleString()} sessions` }
      : { icon: 'ticket', value: 'Reserve your seats' },
  ]

  return (
    <div
      onMouseEnter={() => onWarm(event)}
      onFocus={() => onWarm(event)}
      className="relative z-10 grid min-h-0 place-items-center px-5 pb-16 pt-2 text-center"
    >

      <div className="w-full">
        <Wordmark name={event.name} />

        <Countdown startDate={event.startDate} endDate={event.endDate} />

        <p className="mx-auto mt-7 max-w-xl text-sm leading-relaxed text-fg-muted sm:text-base">
          Search the full catalog, hold seats on the sessions you want, block out
          your own time, and have a conflict-free week built for you.
        </p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => onOpen(event)}
            className="group inline-flex items-center gap-2 rounded-full bg-accent px-7 py-3.5 text-sm font-bold text-accent-ink shadow-lg shadow-accent/25 transition hover:bg-accent-hover"
          >
            Plan your week
            <Icon
              name="arrowRight"
              className="size-4 transition group-hover:translate-x-0.5"
            />
          </button>
          {event.authenticationRequired ? (
            <span className="text-[11px] text-fg-subtle">
              attendee sign-in required
            </span>
          ) : null}
        </div>

        <dl className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-xs font-semibold text-fg-muted">
          {facts.map((fact, i) => (
            <div key={fact.icon} className="flex items-center gap-2">
              {i > 0 ? (
                <span aria-hidden="true" className="mr-4 h-3 w-px bg-line-strong" />
              ) : null}
              <Icon name={fact.icon} className="size-3.5 text-accent-text" />
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

function Countdown({ startDate, endDate }: { startDate: string; endDate: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => {
      window.clearInterval(timer)
    }
  }, [])

  const start = Date.parse(startDate)
  const end = Date.parse(endDate)
  if (Number.isNaN(start) || Number.isNaN(end)) return null

  if (now >= end) {
    return (
      <p className="mt-7 text-xs font-bold uppercase tracking-[0.2em] text-fg-subtle">
        That's a wrap
      </p>
    )
  }

  const live = now >= start
  const remaining = Math.max(0, (live ? end : start) - now)
  const days = Math.floor(remaining / 86_400_000)
  const hours = Math.floor(remaining / 3_600_000) % 24
  const minutes = Math.floor(remaining / 60_000) % 60
  const seconds = Math.floor(remaining / 1000) % 60

  return (
    <div className="mt-9">
      <div
        role="timer"

        aria-live="off"
        aria-label={
          live
            ? `${days} days left of ${'re:Invent'}`
            : `${days} days until re:Invent begins`
        }
        className="flex items-start justify-center gap-2 sm:gap-4"
      >
        <Unit value={days} label="days" />
        <Colon />
        <Unit value={hours} label="hrs" pad />
        <Colon />
        <Unit value={minutes} label="min" pad />
        <Colon />
        <Unit value={seconds} label="sec" pad />
      </div>
      <p className="mt-2.5 text-[10px] font-bold uppercase tracking-[0.22em] text-accent-text">
        {live ? 'left of the week' : 'until doors open'}
      </p>
    </div>
  )
}

function Unit({
  value,
  label,
  pad = false,
}: {
  value: number
  label: string
  pad?: boolean
}) {
  return (
    <span className="flex w-[3.5ch] flex-col items-center sm:w-[4ch]">
      <span className="font-display text-3xl font-semibold leading-none tabular-nums text-fg-strong sm:text-5xl">
        {pad ? String(value).padStart(2, '0') : value}
      </span>
      <span className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-fg-faint">
        {label}
      </span>
    </span>
  )
}

function Colon() {
  return (
    <span
      aria-hidden="true"
      className="font-display -mt-0.5 text-2xl font-light leading-none text-line-strong sm:text-4xl"
    >
      :
    </span>
  )
}

function StageSkeleton() {
  return (
    <div className="relative z-10 grid min-h-0 place-items-center px-5 pb-24 pt-8">
      <div className="w-full max-w-3xl space-y-6">
        <div className="skeleton mx-auto h-6 w-36 rounded-full" />
        <div className="skeleton mx-auto h-24 w-full rounded-2xl" />
        <div className="skeleton mx-auto h-4 w-2/3 rounded-full" />
        <div className="skeleton mx-auto h-12 w-48 rounded-full" />
      </div>
    </div>
  )
}

function HorizonButton() {
  return (
    <button
      type="button"
      onClick={() =>
        document
          .getElementById('events')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      aria-label="Skip to the other events"
      title="See our other events"
      className="absolute bottom-0 left-1/2 z-20 grid size-10 -translate-x-1/2 translate-y-1/2 place-items-center rounded-full bg-surface-1 text-fg-muted ring-1 ring-line transition hover:text-accent-text hover:ring-accent-line"
    >
      <Icon name="chevronDown" className="size-4" />
    </button>
  )
}

function Section({
  title,
  subtitle,
  count,
  icon,
  tone,
  children,
}: {
  title: string
  subtitle?: string
  count: number
  icon: IconName
  tone?: string
  children: ReactNode
}) {
  return (
    <section className="mt-14 first:mt-0">
      <div className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2
          className={cx(
            'inline-flex items-center gap-2 text-lg font-bold tracking-tight',
            tone ?? 'text-fg-strong',
          )}
        >
          <Icon name={icon} className="size-4" />
          {title}
        </h2>
        <Badge>{count}</Badge>
        {subtitle ? <p className="text-xs text-fg-subtle">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  )
}

function Grid({
  events,
  phase,
  now,
  onOpen,
  onWarm,
}: {
  events: AwsEvent[]
  phase: EventPhase
  now: number
  onOpen: (event: AwsEvent) => void
  onWarm: (event: AwsEvent) => void
}) {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {events.map((event) => (
        <li
          key={event.eventId}

          className={eventDays(event) >= 3 ? 'sm:col-span-2' : undefined}
        >
          <EventTile
            event={event}
            phase={phase}
            now={now}
            onOpen={onOpen}
            onWarm={onWarm}
          />
        </li>
      ))}
    </ul>
  )
}

const TIER_CLASS = ['tile-t0', 'tile-t1', 'tile-t2', 'tile-t3'] as const

function EventTile({
  event,
  phase,
  now,
  onOpen,
  onWarm,
}: {
  event: AwsEvent
  phase: EventPhase
  now: number
  onOpen: (event: AwsEvent) => void
  onWarm: (event: AwsEvent) => void
}) {
  const where = event.isOnline ? 'Online' : (event.address?.city ?? '—')

  const blocked = isNotRegistered(event.eventId)
  const days = eventDays(event)
  const tier = imminence(event, now)
  const soon = phase === 'upcoming' && tier === 3

  return (
    <button
      type="button"
      onClick={() => onOpen(event)}
      onMouseEnter={() => onWarm(event)}
      onFocus={() => onWarm(event)}
      style={{ '--tile-hue': `${placeHue(event)}deg` } as CSSProperties}
      className={cx(
        'tile tile-glow group relative isolate flex h-full w-full flex-col overflow-hidden',
        'rounded-2xl p-5 text-left transition duration-200',
        'focus-visible:ring-2 focus-visible:ring-accent',
        phase === 'past'
          ? 'tile-past opacity-70 hover:opacity-100'
          : cx(TIER_CLASS[tier], 'hover:-translate-y-0.5 hover:border-line-strong'),
        soon && 'border-accent-line',
      )}
    >

      <span aria-hidden="true" className="tile-month">
        {eventMonth(event)}
      </span>

      <div className="relative z-10 flex flex-1 flex-col">
        <div className="mb-4 flex items-start gap-3">
          <span
            className={cx(
              'grid size-10 shrink-0 place-items-center rounded-xl ring-1',
              phase === 'live'
                ? 'bg-success-soft text-success ring-success-line'
                : phase === 'past'
                  ? 'bg-surface-2 text-fg-subtle ring-line'
                  : 'bg-accent-soft text-accent-text ring-accent-line',
            )}
          >
            <Icon name={iconFor(event)} className="size-5" />
          </span>

          <div className="min-w-0 flex-1">
            <span className="block truncate text-[10px] font-bold uppercase tracking-wider text-fg-faint">
              {where}
              {event.timezoneAbbreviation ? ` · ${event.timezoneAbbreviation}` : ''}
            </span>
            <h3
              className={cx(
                'mt-0.5 font-bold leading-snug text-fg-strong transition group-hover:text-accent-text',

                days >= 3 ? 'text-lg' : 'line-clamp-2 text-sm',
              )}
            >
              {event.name}
            </h3>
          </div>

          {phase === 'live' ? (
            <Badge className="bg-success-soft text-success ring-success-line">
              <span className="mr-0.5 inline-block size-1.5 animate-pulse rounded-full bg-success" />
              live
            </Badge>
          ) : soon ? (
            <Badge className="bg-accent text-accent-ink ring-transparent">
              this week
            </Badge>
          ) : null}
        </div>

        <p className="flex items-center gap-1.5 text-xs font-semibold text-fg">
          <Icon name="calendar" className="size-3 shrink-0 text-fg-faint" />
          <span className="truncate">{formatEventRange(event)}</span>
          {days > 1 ? (
            <span className="shrink-0 text-[11px] font-medium text-fg-subtle">
              · {days} days
            </span>
          ) : null}
        </p>

        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-5">
          <span className="text-[11px] font-medium text-fg-subtle">
            {describeWhen(event, now)}
          </span>
          {event.authenticationRequired ? (
            <Badge title="Sessions and your schedule require attendee sign-in">
              sign-in
            </Badge>
          ) : (
            <Badge
              className="bg-success-soft text-success ring-success-line"
              title="Browse without signing in — plans are kept in your browser"
            >
              open
            </Badge>
          )}
          {blocked ? (
            <Badge
              className="bg-warn-soft text-warn ring-warn-line"
              title="Signed in, but this account is not registered as an attendee"
            >
              not registered
            </Badge>
          ) : null}
          <span className="ml-auto text-accent-text opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100">
            <Icon name="arrowRight" className="size-4" />
          </span>
        </div>
      </div>
    </button>
  )
}
