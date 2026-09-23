export interface EventAddress {
  city?: string
}

export interface AwsEvent {
  eventId: string
  name: string
  eventType: string
  startDate: string
  endDate: string
  isOnline: boolean
  authenticationRequired: boolean
  timezone?: string
  timezoneAbbreviation?: string
  timeFormat?: string
  address?: EventAddress
  supportedLanguageCodes?: string[]
}

export type SeatAvailability =
  | 'available'
  | 'limited'
  | 'veryLimited'
  | 'unavailable'
  | 'walkUp'

export interface SessionTime {
  date?: string
  time?: string
  length?: string
  timezone?: string
}

export interface Speaker {
  name?: string
}

export interface Session {
  sessionId: string
  title: string
  abbreviation?: string
  abstract?: string
  type?: string
  level?: string
  venue?: string
  room?: string
  isAllDaySession?: boolean
  isReservable?: boolean
  seatAvailability?: SeatAvailability
  sessionTime?: SessionTime
  speakers?: Speaker[]
  tracks?: string[]
  topics?: string[]
  industries?: string[]
  areasOfInterest?: string[]
  roles?: string[]
  services?: string[]
  segments?: string[]
  features?: string[]
  customerPersonas?: string[]
  experiences?: string[]
  additionalActivities?: string[]
  focusAreas?: string[]
}

export interface ListSessionsResponse {
  items: Session[]
  totalCount: number
  nextToken?: string
}

export interface PersonalTime {
  personalTimeId: string
  startDateTime: string
  endDateTime: string
  title: string
  description: string
  location?: string
}

export interface PersonalTimeInput {
  startDateTime: string
  endDateTime: string
  title: string
  description: string
  location?: string
}

export interface Schedule {
  reserved: string[]
  favorites: string[]
  personalTime: PersonalTime[]
}

export type BulkFailureCode =
  | 'sessionNotReservable'
  | 'scheduleConflict'
  | 'alreadyScheduled'
  | 'sessionFull'
  | 'insufficientAccess'
  | 'timePassed'
  | 'alreadyFavorited'
  | 'notFavorited'
  | 'other'

export interface BulkFailure {
  sessionId: string
  code: BulkFailureCode | string
  conflictsWith?: string[]
}

export interface BulkResult {
  successful: string[]
  failed: BulkFailure[]
}
