import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { formatEventRange } from '../lib/events'
import { cx } from '../lib/styles'
import { navigate } from '../lib/router'
import { useApp } from '../store/appContext'
import { AccountMenu } from './AccountMenu'
import { ThemeToggle } from './ThemeToggle'
import { Icon, Spinner } from './ui'
import type { IconName } from './ui'

export type Tab = 'catalog' | 'calendar'

export function PlannerDeck({
  tab,
  onTabChange,
  onGenerate,
  catalogCount,
  scheduleCount,
  children,
}: {
  tab: Tab
  onTabChange: (tab: Tab) => void
  onGenerate: () => void
  catalogCount: number
  scheduleCount: number
  children: ReactNode
}) {
  const { event, days, catalogStatus, loadedCount, catalogTotal, scheduleMode } = useApp()

  const deckRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const node = deckRef.current
    if (!node) return
    const sync = () => {
      document.documentElement.style.setProperty('--deck-h', `${node.offsetHeight}px`)
    }
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(node)
    return () => {
      observer.disconnect()
      document.documentElement.style.removeProperty('--deck-h')
    }
  }, [])

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now())
    }, 60_000)
    return () => {
      window.clearInterval(timer)
    }
  }, [])

  const tzLabel =
    event?.timezoneAbbreviation ?? event?.timezone?.split('/')[1]?.replace('_', ' ')
  const where = event?.isOnline ? 'Online' : event?.address?.city

  return (
    <header ref={deckRef} className="deck sticky top-0 z-40">
      <span aria-hidden="true" className="hero-grain" />

      <div className="relative z-30 mx-auto flex h-14 max-w-[1800px] items-center gap-3 px-4">
        <button
          type="button"
          onClick={() => navigate('/')}
          title="Back to all events"
          aria-label="Back to all events"
          className="group -ml-1 grid size-8 shrink-0 place-items-center rounded-lg text-fg-faint transition hover:bg-surface-1/70 hover:text-accent-text"
        >
          <Icon
            name="chevronRight"
            className="size-4 rotate-180 transition group-hover:-translate-x-0.5"
          />
        </button>

        <div className="min-w-0 leading-tight">
          <p className="font-display truncate text-[15px] font-semibold tracking-tight text-fg-strong">
            {event?.name ?? 'Loading…'}
          </p>

          <p className="hidden truncate text-[11px] text-fg-subtle sm:block">
            {[
              event ? formatEventRange(event) : null,
              where,
              tzLabel,
              event ? phase(now, event.startDate, event.endDate, days.length) : null,
            ]
              .filter(Boolean)
              .join('  ·  ')}
          </p>
        </div>

        <nav className="ml-2 flex shrink-0 items-end gap-1 self-stretch pt-2 sm:ml-5">
          <DeckTab
            active={tab === 'catalog'}
            onClick={() => onTabChange('catalog')}
            icon="list"
            label="Catalog"
            count={catalogCount}
          />
          <DeckTab
            active={tab === 'calendar'}
            onClick={() => onTabChange('calendar')}
            icon="calendar"
            label="My schedule"
            count={scheduleCount}
          />
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {scheduleMode === 'local' ? (
            <span
              className="hidden rounded-md bg-plan-personal-soft px-1.5 py-1 text-[10px] font-bold uppercase tracking-wider text-plan-personal ring-1 ring-plan-personal/40 lg:inline"
              title="This event has no saved schedule; your plan stays in this browser tab"
            >
              local
            </span>
          ) : null}

          <button
            type="button"
            onClick={onGenerate}
            disabled={catalogStatus !== 'ready'}
            title={
              catalogStatus === 'ready'
                ? 'Build a conflict-free schedule from your interests'
                : 'Waiting for the catalog to finish loading'
            }
            className="group inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-accent to-accent-hover px-3.5 py-2 text-xs font-bold text-accent-ink shadow-lg shadow-accent/25 transition hover:shadow-accent/40 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
          >
            {catalogStatus === 'loading' ? (
              <Spinner className="size-3.5" />
            ) : (
              <Icon name="spark" className="size-3.5 transition group-hover:scale-110" />
            )}
            <span className="hidden sm:inline">
              {catalogStatus === 'loading' && loadedCount > 0
                ? catalogTotal > 0
                  ? `${loadedCount.toLocaleString()}/${catalogTotal.toLocaleString()}…`
                  : `${loadedCount.toLocaleString()}…`
                : 'Generate'}
            </span>
          </button>

          <ThemeToggle compact />
          <AccountMenu />
        </div>
      </div>

      <div className="relative z-10 mx-auto max-w-[1800px] px-4 pb-3">{children}</div>

      <span aria-hidden="true" className="hero-halation h-16" />
      <span aria-hidden="true" className="hero-rail" />
    </header>
  )
}

function phase(
  now: number,
  startDate: string,
  endDate: string,
  dayCount: number,
): string | null {
  const start = Date.parse(startDate)
  const end = Date.parse(endDate)
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  if (now > end) return 'ended'
  if (now >= start) {
    const dayOf = Math.floor((now - start) / 86_400_000) + 1
    return dayCount > 0
      ? `day ${Math.min(dayOf, dayCount)} of ${dayCount}`
      : 'under way'
  }
  const out = Math.ceil((start - now) / 86_400_000)
  return `${out} ${out === 1 ? 'day' : 'days'} out`
}

function DeckTab({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  icon: IconName
  label: string
  count: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'group relative inline-flex items-center gap-1.5 rounded-t-lg px-2.5 pb-2.5 pt-1.5 text-xs font-bold transition',
        active ? 'text-fg-strong' : 'text-fg-subtle hover:text-fg',
      )}
    >
      <Icon name={icon} className={cx('size-3.5', active && 'text-accent-text')} />
      <span className="hidden md:inline">{label}</span>
      {count > 0 ? (
        <span
          className={cx(
            'rounded px-1 text-[10px] font-bold tabular-nums transition',
            active ? 'bg-accent-soft text-accent-text' : 'bg-surface-2/70 text-fg-faint',
          )}
        >
          {count.toLocaleString()}
        </span>
      ) : null}
      <span
        aria-hidden="true"
        className={cx(
          'absolute inset-x-1 bottom-0 h-[2px] rounded-full transition',
          active ? 'bg-accent' : 'bg-transparent group-hover:bg-line-strong',
        )}
      />
    </button>
  )
}
