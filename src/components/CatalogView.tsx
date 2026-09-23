import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'

import type { CatalogFilters } from '../lib/useCatalogFilters'
import { navigate } from '../lib/router'
import { labelDateKey } from '../lib/time'
import type { DateKey } from '../lib/time'
import { useMediaQuery, WIDE_QUERY } from '../lib/useMediaQuery'
import { useApp } from '../store/appContext'
import { SessionRow } from './SessionRow'
import { SessionDetail, SessionDetailPane } from './SessionDetail'
import { Badge, Button, EmptyState, Icon, Spinner } from './ui'

const PAGE_SIZE = 40

const clampIndex = (index: number, length: number): number =>
  Math.min(length - 1, Math.max(0, index))

export function CatalogView({
  catalog: filters,
  searchRef,
}: {
  catalog: CatalogFilters
  searchRef: RefObject<HTMLInputElement | null>
}) {
  const {
    catalog,
    byId,
    catalogStatus,
    catalogError,
    catalogBlock,
    event,
    favorites,
    reserved,
    pending,
    toggleFavorite,
    toggleReservation,
    refreshCatalog,
  } = useApp()

  const { results, filters: state } = filters

  const [visible, setVisible] = useState(PAGE_SIZE)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const wide = useMediaQuery(WIDE_QUERY)

  useEffect(() => {
    setVisible(PAGE_SIZE)
  }, [state])

  const shown = results.slice(0, visible)

  const effectiveId = selectedId ?? (wide ? (shown[0]?.session.sessionId ?? null) : null)
  const selectedView = effectiveId ? byId.get(effectiveId) : undefined
  const dayPinned = (state.selections.day ?? []).length === 1

  const grouped = state.sort === 'time'
  const groups = useMemo(() => {
    if (!grouped) return [{ day: undefined, rows: shown }]
    const out: { day: DateKey | undefined; rows: typeof shown }[] = []
    for (const view of shown) {
      const last = out[out.length - 1]
      if (last && last.day === view.dateKey) last.rows.push(view)
      else out.push({ day: view.dateKey, rows: [view] })
    }
    return out
  }, [shown, grouped])

  useEffect(() => {
    const onKey = (keyEvent: KeyboardEvent) => {
      const target = keyEvent.target as HTMLElement | null
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        if (keyEvent.key === 'Escape') target.blur()
        return
      }

      if (document.querySelector('[role="dialog"]')) return

      if (keyEvent.key === '/') {
        keyEvent.preventDefault()
        searchRef.current?.focus()
        return
      }

      const down = keyEvent.key === 'ArrowDown' || keyEvent.key === 'j'
      const up = keyEvent.key === 'ArrowUp' || keyEvent.key === 'k'
      if ((!down && !up) || results.length === 0) return
      keyEvent.preventDefault()

      const at = results.findIndex((view) => view.session.sessionId === effectiveId)
      const next = at < 0 ? 0 : clampIndex(at + (down ? 1 : -1), results.length)
      const id = results[next]?.session.sessionId
      if (!id) return

      setSelectedId(id)

      setVisible((current) =>
        next >= current ? Math.min(next + PAGE_SIZE, results.length) : current,
      )
      requestAnimationFrame(() => {
        document.getElementById(`session-${id}`)?.scrollIntoView({ block: 'nearest' })
      })
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [results, effectiveId, searchRef])

  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = sentinelRef.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible((current) => Math.min(current + PAGE_SIZE, results.length))
        }
      },
      { rootMargin: '600px 0px' },
    )
    observer.observe(node)
    return () => {
      observer.disconnect()
    }
  }, [results.length])

  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 pb-10 pt-5">

      {catalogStatus === 'error' && catalog.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-warn-soft px-3.5 py-2.5 text-xs text-warn ring-1 ring-warn-line">
          <Icon name="warning" className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">
            Only {catalog.length.toLocaleString()} sessions loaded — the catalog stopped
            part-way. {catalogError}
          </span>
          <Button size="sm" onClick={refreshCatalog}>
            <Icon name="refresh" className="size-3.5" />
            Retry
          </Button>
        </div>
      ) : null}

      <div className="flex gap-5">
        <div className="min-w-0 flex-1">
          <CatalogBody
            catalogStatus={catalogStatus}
            catalogError={catalogError}
            catalogBlock={catalogBlock}
            eventName={event?.name}
            total={catalog.length}
            results={results.length}
            hasFilters={filters.activeCount > 0 || Boolean(state.query)}
            onReset={filters.reset}
            onRefresh={refreshCatalog}
          >
            <div className="panel divide-y divide-line overflow-hidden rounded-2xl">
              {groups.map((group) => (
                <Fragment key={group.day ?? 'untimed'}>
                  {grouped ? (
                    <DayDivider day={group.day} count={group.rows.length} />
                  ) : null}
                  {group.rows.map((view) => (
                    <SessionRow
                      key={view.session.sessionId}
                      view={view}
                      isFavorite={favorites.has(view.session.sessionId)}
                      isReserved={reserved.has(view.session.sessionId)}
                      isPending={pending.has(view.session.sessionId)}
                      isSelected={effectiveId === view.session.sessionId}
                      showDay={!grouped && !dayPinned}
                      onOpen={setSelectedId}
                      onToggleFavorite={toggleFavorite}
                      onToggleReservation={toggleReservation}
                    />
                  ))}
                </Fragment>
              ))}
            </div>

            <div ref={sentinelRef} className="h-10" />

            {visible < results.length ? (
              <p className="pb-4 text-center text-xs text-fg-subtle">
                Showing {shown.length.toLocaleString()} of{' '}
                {results.length.toLocaleString()} — scroll for more
              </p>
            ) : catalogStatus === 'loading' ? (
              <p className="flex items-center justify-center gap-1.5 pb-4 text-center text-xs text-fg-subtle">
                <Spinner className="size-3" />
                Loading more sessions…
              </p>
            ) : (
              <p className="pb-4 text-center">
                <Badge>End of results</Badge>
              </p>
            )}
          </CatalogBody>
        </div>

        {wide ? (
          <aside
            className="sticky w-[26rem] shrink-0 self-start"
            style={{
              top: 'calc(var(--deck-h, 12rem) + 1.25rem)',
              height: 'calc(100vh - var(--deck-h, 12rem) - 2.5rem)',
            }}
          >
            <SessionDetailPane view={selectedView} />
          </aside>
        ) : null}
      </div>

      {!wide ? (
        <SessionDetail view={selectedView} onClose={() => setSelectedId(null)} />
      ) : null}

    </div>
  )
}

function DayDivider({ day, count }: { day: DateKey | undefined; count: number }) {
  if (!day) {
    return (
      <div className="day-band flex items-center gap-2 px-4 py-2.5">
        <Icon name="clock" className="size-3.5 text-fg-faint" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
          Time to be announced
        </span>
        <Badge>{count}</Badge>
      </div>
    )
  }

  const label = labelDateKey(day)
  const [month, dayNum] = label.monthDay.split(' ')
  return (
    <div className="day-band flex items-center gap-3 px-4 py-3">
      <span className="flex items-baseline gap-1.5">
        <span className="font-display text-3xl font-semibold leading-none tracking-tight text-fg-strong">
          {dayNum ?? label.monthDay}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-fg-faint">
          {month}
        </span>
      </span>
      <span className="text-xs font-bold uppercase tracking-[0.18em] text-accent-text">
        {label.weekday}
      </span>

      <span
        aria-hidden="true"
        className="h-px min-w-4 flex-1 bg-gradient-to-r from-accent-line to-transparent"
      />
      <span className="text-[11px] font-bold tabular-nums text-fg-subtle">
        {count.toLocaleString()}
        <span className="ml-1 font-medium text-fg-faint">shown</span>
      </span>
    </div>
  )
}

function CatalogBody({
  catalogStatus,
  catalogError,
  catalogBlock,
  eventName,
  total,
  results,
  hasFilters,
  onReset,
  onRefresh,
  children,
}: {
  catalogStatus: string
  catalogError: string | null
  catalogBlock: string | null
  eventName?: string
  total: number
  results: number
  hasFilters: boolean
  onReset: () => void
  onRefresh: () => void
  children: ReactNode
}) {
  const failed = catalogStatus === 'error'

  if (failed && total === 0 && catalogBlock === 'notRegistered') {
    return (
      <EmptyState
        icon="ticket"
        title="You're not registered for this event"
        detail={`Your account is signed in, but it isn't registered as an attendee of ${
          eventName ?? 'this event'
        }, so its catalog and schedule aren't available. Registration is handled on the event's own site.`}
        action={
          <Button size="sm" onClick={() => navigate('/')}>
            <Icon name="chevronRight" className="size-3.5 rotate-180" />
            Back to all events
          </Button>
        }
      />
    )
  }

  if (failed && total === 0 && catalogBlock === 'unavailable') {
    return (
      <EmptyState
        icon="warning"
        title="This event's catalog is unavailable"
        detail="The events service reported this catalog as temporarily unavailable. Trying again shortly usually works."
        action={
          <Button variant="primary" size="sm" onClick={onRefresh}>
            <Icon name="refresh" className="size-3.5" />
            Try again
          </Button>
        }
      />
    )
  }

  if (failed && total === 0) {
    return (
      <EmptyState
        icon="warning"
        title="Could not load the catalog"
        detail={catalogError ?? undefined}
        action={
          <Button variant="primary" size="sm" onClick={onRefresh}>
            <Icon name="refresh" className="size-3.5" />
            Try again
          </Button>
        }
      />
    )
  }

  if (catalogStatus === 'loading' && total === 0) {
    return (
      <div className="panel divide-y divide-line overflow-hidden rounded-2xl">
        {Array.from({ length: 10 }, (_, index) => (
          <div key={index} className="skeleton h-20" />
        ))}
      </div>
    )
  }

  if (results === 0) {
    const streaming = catalogStatus === 'loading'
    return (
      <EmptyState
        icon="search"
        title={streaming ? 'No matches in the sessions loaded so far' : 'No sessions match'}
        detail={
          streaming
            ? 'The rest of the catalog is still arriving — more may match shortly.'
            : 'Try removing a filter or searching for something broader.'
        }
        action={
          hasFilters ? (
            <Button size="sm" onClick={onReset}>
              Clear filters
            </Button>
          ) : undefined
        }
      />
    )
  }

  return <>{children}</>
}
