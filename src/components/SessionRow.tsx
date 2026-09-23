import { memo } from 'react'
import type { CSSProperties } from 'react'

import type { SessionView } from '../lib/sessions'
import {
  describeSlot,
  domainCode,
  domainHue,
  levelDepth,
  SEAT_LABELS,
  SEAT_TONE,
  shortLevel,
  TYPE_ICON,
} from '../lib/sessions'
import { labelDateKey } from '../lib/time'
import { cx } from '../lib/styles'
import { Icon, Spinner } from './ui'

interface Props {
  view: SessionView
  isFavorite: boolean
  isReserved: boolean
  isPending: boolean
  isSelected: boolean
  showDay: boolean
  onOpen: (sessionId: string) => void
  onToggleFavorite: (sessionId: string) => void
  onToggleReservation: (sessionId: string) => void
}

const NOTCHES = [0, 1, 2, 3, 4]

export const SessionRow = memo(function SessionRow({
  view,
  isFavorite,
  isReserved,
  isPending,
  isSelected,
  showDay,
  onOpen,
  onToggleFavorite,
  onToggleReservation,
}: Props) {
  const { session } = view
  const slot = describeSlot(view)
  const day = view.dateKey ? labelDateKey(view.dateKey) : null
  const level = shortLevel(session.level)
  const depth = levelDepth(session.level)
  const seats = session.seatAvailability
  const code = domainCode(session.abbreviation)
  const typeIcon = session.type ? TYPE_ICON[session.type] : undefined

  const clock = (slot?.split(' – ')[0] ?? '').split(' ')

  return (
    <div
      id={`session-${session.sessionId}`}
      style={{ '--chip-hue': `${domainHue(code)}deg` } as CSSProperties}
      className={cx(
        'group relative flex gap-3 border-l-2 py-3 pl-3 pr-3 transition',

        'scroll-mt-[calc(var(--deck-h,12rem)+0.5rem)]',
        isSelected
          ? 'border-accent bg-accent-soft/70 shadow-[inset_0_0_24px_-8px_var(--color-accent)]'
          : 'border-transparent hover:bg-surface-2/60',
      )}
    >

      <span
        aria-hidden="true"
        className="level-meter mt-1 h-8 shrink-0"
        title={session.level}
      >
        {NOTCHES.map((i) => (
          <i key={i} data-on={4 - i < depth} style={{ opacity: 0.45 + (4 - i) * 0.14 }} />
        ))}
      </span>

      <button
        type="button"
        onClick={() => onOpen(session.sessionId)}
        aria-current={isSelected ? 'true' : undefined}
        className="flex min-w-0 flex-1 gap-3 text-left"
      >

        <span className="w-[4.25rem] shrink-0 tabular-nums">
          {showDay && day ? (
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-fg-faint">
              {day.weekday} {day.monthDay.replace(/^\w+ /, '')}
            </span>
          ) : null}
          <span
            className={cx(
              'block rounded-lg px-1.5 py-1 text-center ring-1 transition',
              isReserved
                ? 'bg-accent text-accent-ink ring-accent'
                : isFavorite
                  ? 'bg-plan-favorite-soft text-plan-favorite ring-plan-favorite/30'
                  : 'bg-surface-2/60 text-fg-strong ring-line/60',
            )}
          >
            {day ? (
              <>
                <span className="block text-xs font-bold leading-none">
                  {view.isAllDay ? 'All' : (clock[0] ?? '—')}
                </span>
                <span className="mt-0.5 block text-[9px] font-semibold leading-none opacity-70">
                  {view.isAllDay
                    ? 'day'
                    : `${clock[1] ?? ''}${view.durationMin ? ` · ${view.durationMin}m` : ''}`}
                </span>
              </>
            ) : (
              <span className="block text-[10px] font-semibold leading-none">TBD</span>
            )}
          </span>
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {session.abbreviation ? (
              <span className="domain-chip rounded px-1.5 py-0.5 font-mono text-[10px] font-bold">
                {session.abbreviation}
              </span>
            ) : null}
            {session.type ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-fg-subtle">
                {typeIcon ? <Icon name={typeIcon} className="size-3" /> : null}
                {session.type}
              </span>
            ) : null}
            {level ? (
              <span className="text-[10px] font-semibold text-fg-faint">L{level}</span>
            ) : null}
            {seats ? (
              <span
                className={cx(
                  'rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                  SEAT_TONE[seats] ?? '',
                )}
              >
                {SEAT_LABELS[seats] ?? seats}
              </span>
            ) : null}
          </span>

          <span
            className={cx(
              'mt-1 block text-sm font-semibold leading-snug transition',
              isSelected ? 'text-accent-text' : 'text-fg group-hover:text-fg-strong',
            )}
          >
            {session.title}
          </span>

          {session.room || session.venue || session.topics?.[0] ? (
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-fg-subtle">
              {session.room || session.venue ? (
                <span className="inline-flex items-center gap-1">
                  <Icon name="pin" className="size-3" />
                  {[session.venue, session.room].filter(Boolean).join(' · ')}
                </span>
              ) : null}
              {session.topics?.[0] ? (
                <span className="truncate">{session.topics[0]}</span>
              ) : null}
            </span>
          ) : null}
        </span>
      </button>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => onToggleFavorite(session.sessionId)}
          disabled={isPending}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          className={cx(
            'rounded-lg p-1.5 transition disabled:opacity-50',
            isFavorite
              ? 'bg-plan-favorite-soft text-plan-favorite ring-1 ring-plan-favorite/40'
              : 'text-fg-faint hover:bg-surface-3 hover:text-plan-favorite',
          )}
        >
          <Icon name={isFavorite ? 'starFilled' : 'star'} className="size-4" />
        </button>

        {session.isReservable ? (
          <button
            type="button"
            onClick={() => onToggleReservation(session.sessionId)}
            disabled={isPending}
            title={isReserved ? 'Cancel this reservation' : 'Hold a seat'}
            className={cx(
              'inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-bold transition disabled:opacity-50',
              isReserved
                ? 'bg-accent text-accent-ink hover:bg-danger hover:text-white'
                : 'bg-surface-2 text-fg-muted ring-1 ring-line hover:bg-accent hover:text-accent-ink',
            )}
          >
            {isPending ? (
              <Spinner className="size-3" />
            ) : (
              <Icon name={isReserved ? 'check' : 'ticket'} className="size-3" />
            )}
            {isReserved ? 'Held' : 'Reserve'}
          </button>
        ) : null}
      </div>
    </div>
  )
})
