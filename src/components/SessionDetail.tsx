import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import { getSession } from '../api/events'
import type { Session } from '../api/types'
import {
  describeSlot,
  domainCode,
  domainHue,
  levelDepth,
  SEAT_LABELS,
  SEAT_TONE,
  toView,
  TYPE_ICON,
} from '../lib/sessions'
import type { SessionView } from '../lib/sessions'
import { formatDuration, labelDateKey } from '../lib/time'
import { cx } from '../lib/styles'
import { useApp } from '../store/appContext'
import { Badge, Button, Icon, Spinner } from './ui'

const TAG_GROUPS: { key: keyof Session; label: string }[] = [
  { key: 'topics', label: 'Topics' },
  { key: 'areasOfInterest', label: 'Areas of interest' },
  { key: 'services', label: 'AWS services' },
  { key: 'tracks', label: 'Tracks' },
  { key: 'roles', label: 'Roles' },
  { key: 'industries', label: 'Industries' },
  { key: 'segments', label: 'Segments' },
  { key: 'features', label: 'Format' },
  { key: 'experiences', label: 'Experiences' },
  { key: 'focusAreas', label: 'Focus areas' },
  { key: 'customerPersonas', label: 'Personas' },
  { key: 'additionalActivities', label: 'Additional activities' },
]

function useFreshSession(view: SessionView) {
  const { eventId } = useApp()
  const sessionId = view.session.sessionId

  const [fresh, setFresh] = useState<{ sessionId: string; view: SessionView } | null>(
    null,
  )
  const [loadingId, setLoadingId] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId || !eventId) return

    const controller = new AbortController()
    setLoadingId(sessionId)
    getSession(eventId, sessionId, controller.signal)
      .then((res) => {
        setFresh({ sessionId, view: toView(res.session) })
      })
      .catch(() => {})
      .finally(() => {
        setLoadingId((current) => (current === sessionId ? null : current))
      })

    return () => {
      controller.abort()
    }
  }, [eventId, sessionId])

  return {
    shown: fresh && fresh.sessionId === sessionId ? fresh.view : view,
    loading: loadingId === sessionId,
  }
}

export function SessionDetailBody({
  view,
  onClose,
}: {
  view: SessionView
  onClose?: () => void
}) {
  const { favorites, reserved, pending, toggleFavorite, toggleReservation } = useApp()
  const { shown, loading } = useFreshSession(view)

  const { session } = shown
  const sessionId = session.sessionId
  const isFavorite = favorites.has(sessionId)
  const isReserved = reserved.has(sessionId)
  const isPending = pending.has(sessionId)
  const slot = describeSlot(shown)
  const day = shown.dateKey ? labelDateKey(shown.dateKey) : null
  const seats = session.seatAvailability
  const code = domainCode(session.abbreviation)
  const depth = levelDepth(session.level)
  const typeIcon = session.type ? TYPE_ICON[session.type] : undefined

  return (
    <div
      style={{ '--chip-hue': `${domainHue(code)}deg` } as CSSProperties}
      className="flex h-full min-h-0 flex-col"
    >
      <header className="flex items-start gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {session.abbreviation ? (
              <span className="domain-chip rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold">
                {session.abbreviation}
              </span>
            ) : null}
            {session.type ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-fg-subtle">
                {typeIcon ? <Icon name={typeIcon} className="size-3" /> : null}
                {session.type}
              </span>
            ) : null}
            {session.level ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-fg-subtle">
                <LevelMeter depth={depth} title={session.level} />
                {session.level}
              </span>
            ) : null}
            {seats ? (
              <Badge className={SEAT_TONE[seats] ?? ''}>
                {SEAT_LABELS[seats] ?? seats}
              </Badge>
            ) : null}
            {loading ? <Spinner className="size-3 text-fg-subtle" /> : null}
          </div>
          <h2 className="mt-2 text-base font-bold leading-snug text-fg-strong">
            {session.title}
          </h2>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1.5 text-fg-muted transition hover:bg-surface-2 hover:text-fg-strong"
          >
            <Icon name="close" />
          </button>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <dl className="mb-5 grid gap-2.5 sm:grid-cols-2">
          <Fact
            icon="calendar"
            label="When"
            value={
              day
                ? `${day.weekday}, ${day.monthDay}${slot ? ` · ${slot}` : ''}`
                : 'Not scheduled yet'
            }
          />
          <Fact
            icon="clock"
            label="Duration"
            value={
              shown.isAllDay
                ? 'All day'
                : shown.durationMin
                  ? formatDuration(shown.durationMin)
                  : '—'
            }
          />
          <Fact
            icon="pin"
            label="Where"
            value={[session.venue, session.room].filter(Boolean).join(' · ') || '—'}
          />
          <Fact
            icon="ticket"
            label="Reservations"
            value={
              session.isReservable ? 'Open for reservations' : 'No reservation needed'
            }
          />
        </dl>

        {session.speakers && session.speakers.length > 0 ? (
          <Group label="Speakers">
            <ul className="flex flex-wrap gap-1.5">
              {session.speakers.map((speaker, index) => (
                <li
                  key={`${speaker.name ?? 'speaker'}-${index}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-2 py-1 text-xs text-fg ring-1 ring-line"
                >
                  <span className="grid size-4 place-items-center rounded-full bg-gradient-to-br from-plan-favorite to-plan-personal text-[9px] font-bold text-accent-ink">
                    {(speaker.name ?? '?').charAt(0).toUpperCase()}
                  </span>
                  {speaker.name ?? 'Unnamed speaker'}
                </li>
              ))}
            </ul>
          </Group>
        ) : null}

        {session.abstract ? (
          <Group label="Abstract">
            <p className="whitespace-pre-line text-[13px] leading-relaxed text-fg-muted">
              {session.abstract.trim()}
            </p>
          </Group>
        ) : null}

        {TAG_GROUPS.map((group) => {
          const values = session[group.key]
          if (!Array.isArray(values) || values.length === 0) return null
          return (
            <Group key={group.key} label={group.label}>
              <ul className="flex flex-wrap gap-1">
                {(values as string[]).map((value) => (
                  <li key={value}>
                    <Badge>{value}</Badge>
                  </li>
                ))}
              </ul>
            </Group>
          )
        })}

        <p className="mt-6 font-mono text-[10px] text-fg-faint">
          sessionId {session.sessionId}
        </p>
      </div>

      <footer className="flex items-center gap-2 border-t border-line px-5 py-4">
        <Button
          onClick={() => void toggleFavorite(sessionId)}
          disabled={isPending}
          className={cx(
            'flex-1',
            isFavorite && 'text-plan-favorite ring-plan-favorite/40 bg-plan-favorite-soft',
          )}
        >
          <Icon name={isFavorite ? 'starFilled' : 'star'} className="size-4" />
          {isFavorite ? 'Favorited' : 'Add favorite'}
        </Button>

        {session.isReservable ? (
          <Button
            variant={isReserved ? 'danger' : 'primary'}
            onClick={() => void toggleReservation(sessionId)}
            disabled={isPending}
            className="flex-1"
          >
            {isPending ? (
              <Spinner className="size-4" />
            ) : (
              <Icon name={isReserved ? 'close' : 'ticket'} className="size-4" />
            )}
            {isReserved ? 'Cancel reservation' : 'Reserve seat'}
          </Button>
        ) : (
          <span className="flex-1 text-center text-[11px] leading-tight text-fg-subtle">
            This session does not take reservations
          </span>
        )}
      </footer>
    </div>
  )
}

export function SessionDetail({
  view,
  onClose,
}: {
  view: SessionView | undefined
  onClose: () => void
}) {
  useEffect(() => {
    if (!view) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [view, onClose])

  if (!view) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className="absolute inset-0 bg-scrim backdrop-blur-sm"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={view.session.title}
        className="animate-rise relative h-full w-full max-w-xl border-l border-line bg-surface-1 shadow-2xl backdrop-blur-xl"
      >

        <SessionDetailBody
          key={view.session.sessionId}
          view={view}
          onClose={onClose}
        />
      </aside>
    </div>
  )
}

export function SessionDetailPane({ view }: { view: SessionView | undefined }) {
  return (
    <div className="panel flex h-full min-h-0 flex-col overflow-hidden rounded-2xl">
      {view ? (
        <SessionDetailBody key={view.session.sessionId} view={view} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <span className="grid size-11 place-items-center rounded-2xl bg-surface-2 text-fg-muted ring-1 ring-line">
            <Icon name="list" className="size-5" />
          </span>
          <p className="text-sm font-semibold text-fg">Pick a session</p>
          <p className="max-w-[24ch] text-xs leading-relaxed text-fg-subtle">
            Its abstract, speakers, room and seat status appear here.
          </p>
        </div>
      )}
    </div>
  )
}

function LevelMeter({ depth, title }: { depth: number; title?: string }) {
  return (
    <span aria-hidden="true" className="level-meter h-3 w-2" title={title}>
      {[0, 1, 2, 3, 4].map((i) => (
        <i key={i} data-on={4 - i < depth} style={{ opacity: 0.45 + (4 - i) * 0.14 }} />
      ))}
    </span>
  )
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-fg-subtle">
        {label}
      </h3>
      {children}
    </section>
  )
}

function Fact({
  icon,
  label,
  value,
}: {
  icon: 'calendar' | 'clock' | 'pin' | 'ticket'
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2.5 ring-1 ring-line">
      <dt className="flex items-center gap-1.5 text-[11px] font-medium text-fg-subtle">
        <Icon name={icon} className="size-3" />
        {label}
      </dt>
      <dd className="mt-0.5 text-xs font-semibold text-fg">{value}</dd>
    </div>
  )
}
