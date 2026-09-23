import { createContext, useContext } from 'react'

import type { AwsEvent, PersonalTime, PersonalTimeInput } from '../api/types'
import type { UserInfo } from '../auth/authStore'
import type { SessionView } from '../lib/sessions'
import type { DateKey } from '../lib/time'

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

export type CatalogBlock = 'notRegistered' | 'unavailable' | null

export interface Toast {
  id: number
  tone: 'success' | 'error' | 'info'
  title: string
  detail?: string
}

export interface ApplyPlanResult {
  favorited: number
  reserved: number
  failures: { sessionId: string; code: string; conflictsWith?: string[] }[]
}

export interface AppValue {
  signedIn: boolean
  user: UserInfo | null
  signIn: () => void
  signOutApp: () => void
  events: AwsEvent[]
  eventsStatus: LoadStatus
  eventsError: string | null
  refreshEvents: () => void
  eventId: string | null
  event: AwsEvent | null
  eventError: string | null
  days: DateKey[]
  timeZone: string
  scheduleMode: 'remote' | 'local'
  requiresAuth: boolean
  catalog: SessionView[]
  byId: Map<string, SessionView>
  catalogStatus: LoadStatus
  loadedCount: number
  catalogTotal: number
  catalogError: string | null
  catalogBlock: CatalogBlock
  refreshCatalog: () => void
  favorites: Set<string>
  reserved: Set<string>
  personalTime: PersonalTime[]
  scheduleStatus: LoadStatus
  pending: Set<string>
  toggleFavorite: (sessionId: string) => Promise<void>
  toggleReservation: (sessionId: string) => Promise<void>
  applyPlan: (
    sessionIds: string[],
    options: { reserve: ReadonlySet<string> },
  ) => Promise<ApplyPlanResult>

  addPersonalTime: (inputs: PersonalTimeInput[]) => Promise<boolean>
  editPersonalTime: (id: string, input: PersonalTimeInput) => Promise<boolean>
  removePersonalTime: (id: string) => Promise<boolean>
  toasts: Toast[]
  pushToast: (toast: Omit<Toast, 'id'>) => void
  dismissToast: (id: number) => void
}

export const AppContext = createContext<AppValue | null>(null)

export function useApp(): AppValue {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp must be used inside <AppProvider>')
  return value
}
