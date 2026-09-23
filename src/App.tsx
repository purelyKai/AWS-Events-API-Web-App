import { lazy, Suspense, useEffect, useRef, useState } from 'react'

import { completeSignIn } from './auth/authStore'
import { CatalogControls } from './components/CatalogControls'
import { CatalogView } from './components/CatalogView'
import { EventsPage } from './components/EventsPage'
import { PlannerDeck } from './components/PlannerDeck'
import type { Tab } from './components/PlannerDeck'
import { ScheduleControls } from './components/ScheduleControls'
import { SignInScreen } from './components/SignInScreen'
import { Toasts } from './components/Toasts'
import { ALL_LAYERS } from './lib/plan'
import type { Layers } from './lib/plan'
import { useCatalogFilters } from './lib/useCatalogFilters'
import { navigate, useRoute } from './lib/router'
import { AppProvider } from './store/AppStore'
import { useApp } from './store/appContext'
import { Icon } from './components/ui'

const loadCalendar = () => import('./components/CalendarView')
const loadGenerator = () => import('./components/GenerateDialog')

const CalendarView = lazy(() =>
  loadCalendar().then((m) => ({ default: m.CalendarView })),
)
const GenerateDialog = lazy(() =>
  loadGenerator().then((m) => ({ default: m.GenerateDialog })),
)

type CallbackState = 'exchanging' | 'done'

export default function App() {
  const route = useRoute()

  const [callback, setCallback] = useState<CallbackState>(
    route.name === 'callback' ? 'exchanging' : 'done',
  )
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    if (route.name !== 'callback') return
    let cancelled = false

    completeSignIn()
      .then((returnTo) => {
        if (!cancelled) navigate(returnTo, { replace: true })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setAuthError(err instanceof Error ? err.message : String(err))
        navigate('/', { replace: true })
      })
      .finally(() => {
        if (!cancelled) setCallback('done')
      })

    return () => {
      cancelled = true
    }
  }, [route.name])

  useEffect(() => {
    if (route.name === 'logout') navigate('/', { replace: true })
  }, [route.name])

  const eventId = route.name === 'event' ? route.eventId : null

  return (
    <AppProvider eventId={eventId}>
      <Shell busy={callback === 'exchanging'} authError={authError} />
      <Toasts />
    </AppProvider>
  )
}

function Shell({ busy, authError }: { busy: boolean; authError: string | null }) {
  const { signedIn, eventId, event, eventError, requiresAuth } = useApp()

  if (!eventId) {
    return busy ? <SignInScreen busy error={authError} /> : <EventsPage />
  }

  if (eventError) return <EventLoadError message={eventError} />

  if (!event) return <Splash label="Loading event…" />

  if (requiresAuth && !signedIn) {
    return <SignInScreen busy={busy} error={authError} event={event} />
  }

  return <EventPlanner key={eventId} />
}

function Splash({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <span className="rounded-full bg-surface-1 px-4 py-1.5 text-xs text-fg-muted ring-1 ring-line">
        {label}
      </span>
    </div>
  )
}

function EventLoadError({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-lg px-6 py-24 text-center">
      <h1 className="text-lg font-bold text-fg-strong">That event could not be opened</h1>
      <p className="mt-2 text-sm text-fg-muted">{message}</p>
      <button
        type="button"
        onClick={() => navigate('/')}
        className="mt-5 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-ink transition hover:bg-accent-hover"
      >
        Back to all events
      </button>
    </div>
  )
}

function EventPlanner() {
  const { catalog, reserved, favorites, personalTime, scheduleMode } = useApp()
  const [tab, setTab] = useState<Tab>('catalog')
  const [generateOpen, setGenerateOpen] = useState(false)

  const catalogFilters = useCatalogFilters()
  const [layers, setLayers] = useState<Layers>(ALL_LAYERS)

  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void loadCalendar()
    void loadGenerator()
  }, [])

  return (
    <div className="flex min-h-screen flex-col">
      <PlannerDeck
        tab={tab}
        onTabChange={setTab}
        onGenerate={() => setGenerateOpen(true)}
        catalogCount={catalog.length}
        scheduleCount={reserved.size + favorites.size + personalTime.length}
      >
        {tab === 'catalog' ? (
          <CatalogControls catalog={catalogFilters} searchRef={searchRef} />
        ) : (
          <ScheduleControls layers={layers} onLayersChange={setLayers} />
        )}
      </PlannerDeck>

      <main className="work-floor flex-1">
        {scheduleMode === 'local' ? <LocalModeBanner /> : null}

        {tab === 'catalog' ? (
          <CatalogView catalog={catalogFilters} searchRef={searchRef} />
        ) : (
          <Suspense fallback={<Splash label="Opening your schedule…" />}>
            <CalendarView layers={layers} />
          </Suspense>
        )}
      </main>

      {generateOpen ? (
        <Suspense fallback={null}>
          <GenerateDialog
            open
            onClose={() => setGenerateOpen(false)}

            onDone={() => setTab('calendar')}
          />
        </Suspense>
      ) : null}
    </div>
  )
}

function LocalModeBanner() {
  return (
    <div className="mx-auto max-w-[1800px] px-4 pt-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-plan-personal-soft px-3.5 py-2.5 text-xs text-plan-personal ring-1 ring-plan-personal/40">
        <Icon name="info" className="size-4 shrink-0 text-plan-personal" />
        <span className="min-w-0 flex-1">
          <span className="font-semibold">This event is open to everyone</span> — it has
          no saved schedule, so favorites, reservations and personal time are kept in
          this browser tab only and are not sent to AWS.
        </span>
      </div>
    </div>
  )
}
