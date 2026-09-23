export function Wordmark({ name }: { name: string }) {
  const lockup = name.replace(/\s+\d{4}\s*$/, '')
  const at = lockup.indexOf(':')

  return (
    <h1 className="hero-wordmark" aria-label={name}>
      {at < 0 ? (
        <span className="wm-tail">{lockup}</span>
      ) : (
        <>
          <span className="wm-head">{lockup.slice(0, at)}</span>
          <span className="wm-colon">:</span>
          <span className="wm-tail">{lockup.slice(at + 1)}</span>
        </>
      )}
    </h1>
  )
}
