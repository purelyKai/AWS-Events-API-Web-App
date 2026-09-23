export interface Span {
  startMin: number
  endMin: number
}

export interface Placed<T> {
  item: T
  startMin: number
  endMin: number
  column: number
  columns: number
}

export function layoutSpans<T extends Span>(items: readonly T[]): Placed<T>[] {
  const sorted = [...items].sort(
    (a, b) => a.startMin - b.startMin || a.endMin - b.endMin,
  )

  const out: Placed<T>[] = []
  let cluster: Placed<T>[] = []

  let columnEnds: number[] = []
  let clusterEnd = -Infinity

  const flush = () => {
    for (const placed of cluster) placed.columns = columnEnds.length || 1
    out.push(...cluster)
    cluster = []
    columnEnds = []
    clusterEnd = -Infinity
  }

  for (const item of sorted) {
    if (item.startMin >= clusterEnd && cluster.length > 0) flush()

    let column = columnEnds.findIndex((end) => end <= item.startMin)
    if (column === -1) {
      column = columnEnds.length
      columnEnds.push(item.endMin)
    } else {
      columnEnds[column] = item.endMin
    }

    cluster.push({
      item,
      startMin: item.startMin,
      endMin: item.endMin,
      column,
      columns: 1,
    })
    clusterEnd = Math.max(clusterEnd, item.endMin)
  }

  if (cluster.length > 0) flush()
  return out
}

export const overlaps = (a: Span, b: Span): boolean =>
  a.startMin < b.endMin && b.startMin < a.endMin

export function unionMinutes(spans: readonly Span[]): number {
  if (spans.length === 0) return 0

  const sorted = [...spans].sort((a, b) => a.startMin - b.startMin)
  let total = 0
  let start = sorted[0].startMin
  let end = sorted[0].endMin

  for (let i = 1; i < sorted.length; i += 1) {
    const span = sorted[i]
    if (span.startMin > end) {
      total += end - start
      start = span.startMin
      end = span.endMin
    } else {
      end = Math.max(end, span.endMin)
    }
  }

  return total + (end - start)
}
