import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  buildPredicate,
  computeFacets,
  countActiveFilters,
  EMPTY_FILTERS,
  sortViews,
} from './sessions'
import type {
  FacetKey,
  FacetOption,
  FilterState,
  Flag,
  SessionView,
  SortKey,
} from './sessions'
import { useApp } from '../store/appContext'

export interface CatalogFilters {
  filters: FilterState
  queryDraft: string
  results: SessionView[]
  facets: Record<FacetKey, FacetOption[]>
  activeCount: number
  setQueryDraft: (value: string) => void
  setSort: (sort: SortKey) => void
  pickDay: (value: string | null) => void
  toggleFacetValue: (facet: FacetKey, value: string) => void
  clearFacet: (facet: FacetKey) => void
  toggleFlag: (flag: Flag) => void
  replaceFilters: (next: FilterState) => void
  reset: () => void
}

export function useCatalogFilters(): CatalogFilters {
  const { catalog, favorites, reserved } = useApp()

  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [queryDraft, setQueryDraft] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((current) =>
        current.query === queryDraft ? current : { ...current, query: queryDraft },
      )
    }, 140)
    return () => {
      window.clearTimeout(timer)
    }
  }, [queryDraft])

  const ctx = useMemo(() => ({ favorites, reserved }), [favorites, reserved])

  const results = useMemo(() => {
    const predicate = buildPredicate(filters, ctx)
    return sortViews(catalog.filter(predicate), filters.sort)
  }, [catalog, filters, ctx])

  const facets = useMemo(
    () => computeFacets(catalog, filters, ctx),
    [catalog, filters, ctx],
  )

  const setSort = useCallback((sort: SortKey) => {
    setFilters((current) => ({ ...current, sort }))
  }, [])

  const pickDay = useCallback((value: string | null) => {
    setFilters((current) => {
      const selections = { ...current.selections }

      if (
        value === null ||
        (selections.day?.length === 1 && selections.day[0] === value)
      ) {
        delete selections.day
      } else {
        selections.day = [value]
      }
      return { ...current, selections }
    })
  }, [])

  const toggleFacetValue = useCallback((facet: FacetKey, value: string) => {
    setFilters((current) => {
      const existing = current.selections[facet] ?? []
      const next = existing.includes(value)
        ? existing.filter((entry) => entry !== value)
        : [...existing, value]
      const selections = { ...current.selections }
      if (next.length > 0) selections[facet] = next
      else delete selections[facet]
      return { ...current, selections }
    })
  }, [])

  const clearFacet = useCallback((facet: FacetKey) => {
    setFilters((current) => {
      const selections = { ...current.selections }
      delete selections[facet]
      return { ...current, selections }
    })
  }, [])

  const toggleFlag = useCallback((flag: Flag) => {
    setFilters((current) => ({
      ...current,
      flags: current.flags.includes(flag)
        ? current.flags.filter((entry) => entry !== flag)
        : [...current.flags, flag],
    }))
  }, [])

  const replaceFilters = useCallback((next: FilterState) => {
    setFilters(next)

    setQueryDraft(next.query)
  }, [])

  const reset = useCallback(() => {
    setFilters(EMPTY_FILTERS)
    setQueryDraft('')
  }, [])

  return {
    filters,
    queryDraft,
    results,
    facets,
    activeCount: countActiveFilters(filters),
    setQueryDraft,
    setSort,
    pickDay,
    toggleFacetValue,
    clearFacet,
    toggleFlag,
    replaceFilters,
    reset,
  }
}
