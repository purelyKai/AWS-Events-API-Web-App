import { cx } from '../lib/styles'
import { useApp } from '../store/appContext'
import { Icon } from './ui'
import type { IconName } from './ui'

const TONE: Record<string, { ring: string; icon: IconName; iconClass: string }> = {
  success: {
    ring: 'ring-success-line',
    icon: 'check',
    iconClass: 'text-success bg-success-soft',
  },
  error: {
    ring: 'ring-danger-line',
    icon: 'warning',
    iconClass: 'text-danger bg-danger-soft',
  },
  info: {
    ring: 'ring-info-line',
    icon: 'info',
    iconClass: 'text-info bg-info-soft',
  },
}

export function Toasts() {
  const { toasts, dismissToast } = useApp()

  if (toasts.length === 0) return null

  return (
    <div
      className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[min(22rem,calc(100vw-2.5rem))] flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const tone = TONE[toast.tone] ?? TONE.info
        return (
          <div
            key={toast.id}
            className={cx(
              'panel animate-toast-in pointer-events-auto flex items-start gap-3 rounded-xl px-3.5 py-3 shadow-2xl ring-1',
              tone.ring,
            )}
          >
            <span className={cx('mt-0.5 rounded-lg p-1.5', tone.iconClass)}>
              <Icon name={tone.icon} className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-fg">{toast.title}</p>
              {toast.detail ? (
                <p className="mt-0.5 text-xs leading-snug text-fg-muted">{toast.detail}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss"
              className="rounded p-0.5 text-fg-subtle transition hover:text-fg"
            >
              <Icon name="close" className="size-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
