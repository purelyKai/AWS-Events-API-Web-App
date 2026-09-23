export const cx = (...parts: (string | false | null | undefined)[]): string =>
  parts.filter(Boolean).join(' ')

export const fieldClass =
  'w-full rounded-lg bg-surface-inset px-3 py-2 text-sm text-fg ' +
  'ring-1 ring-line transition placeholder:text-fg-faint ' +
  'focus:ring-2 focus:ring-accent focus:outline-none'
