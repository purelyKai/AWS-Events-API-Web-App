import { useState } from 'react'

import type { PersonalTimeInput } from '../api/types'
import {
  formatDuration,
  formatMinutes,
  labelDateKey,
  localSlotToUtcNaive,
  snapTo5,
} from '../lib/time'
import type { DateKey } from '../lib/time'
import { fieldClass } from '../lib/styles'
import { Button, Field, Icon, Modal, Spinner } from './ui'

export interface DraftBlock {
  personalTimeId?: string
  dateKeys: DateKey[]
  startMin: number
  endMin: number
  title: string
  description: string
  location: string
}

const clockValue = (minutes: number): string => formatMinutes(minutes, false)

const parseTimeInput = (value: string): number | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return hour * 60 + minute
}

interface DialogProps {
  draft: DraftBlock | null
  days: DateKey[]
  timeZone: string
  busy: boolean
  onClose: () => void
  onSubmit: (id: string | undefined, inputs: PersonalTimeInput[]) => void
  onDelete: (id: string) => void
}

export function PersonalTimeDialog(props: DialogProps) {
  if (!props.draft) return null
  const { draft } = props
  const key = [
    draft.personalTimeId ?? 'new',
    draft.dateKeys.join(','),
    draft.startMin,
    draft.endMin,
  ].join(':')
  return <DialogBody key={key} {...props} draft={draft} />
}

function DialogBody({
  draft,
  days,
  timeZone,
  busy,
  onClose,
  onSubmit,
  onDelete,
}: DialogProps & { draft: DraftBlock }) {
  const [form, setForm] = useState<DraftBlock>(draft)
  const [error, setError] = useState<string | null>(null)

  const isEdit = Boolean(form.personalTimeId)
  const duration = form.endMin - form.startMin
  const selectedDays = form.dateKeys

  const patch = (next: Partial<DraftBlock>) => {
    setForm((current) => ({ ...current, ...next }))
  }

  const submit = () => {
    const title = form.title.trim()
    const description = form.description.trim()

    if (!title) {
      setError('A title is required.')
      return
    }
    if (title.length > 128) {
      setError('Title must be 128 characters or fewer.')
      return
    }

    if (!description) {
      setError('A description is required.')
      return
    }
    if (description.length > 250) {
      setError('Description must be 250 characters or fewer.')
      return
    }
    if (form.endMin <= form.startMin) {
      setError('The end time must be after the start time.')
      return
    }
    if ((form.endMin - form.startMin) % 5 !== 0) {
      setError('Length must be a whole number of 5-minute increments.')
      return
    }

    if (selectedDays.length === 0) {
      setError('Pick at least one day.')
      return
    }

    const location = form.location.trim()

    onSubmit(
      form.personalTimeId,
      selectedDays.map((dateKey) => ({
        startDateTime: localSlotToUtcNaive(dateKey, form.startMin, timeZone),
        endDateTime: localSlotToUtcNaive(dateKey, form.endMin, timeZone),
        title,
        description,
        ...(location ? { location } : {}),
      })),
    )
  }

  const label = labelDateKey(selectedDays[0] ?? days[0])

  return (
    <Modal
      open
      onClose={onClose}
      title={
        <span className="inline-flex items-center gap-2">
          <Icon name="calendar" className="size-4 text-accent-text" />
          {isEdit ? 'Edit personal time' : 'Block personal time'}
        </span>
      }
      footer={
        <>
          {isEdit ? (
            <Button
              variant="danger"
              onClick={() => {
                if (form.personalTimeId) onDelete(form.personalTimeId)
              }}
              disabled={busy}
              className="mr-auto"
            >
              <Icon name="trash" className="size-3.5" />
              Delete
            </Button>
          ) : null}
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            {busy ? <Spinner className="size-4" /> : <Icon name="check" className="size-4" />}
            {isEdit
              ? 'Save changes'
              : selectedDays.length > 1
                ? `Add on ${selectedDays.length} days`
                : 'Add block'}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">

        <div className="flex items-center justify-between rounded-xl bg-accent-soft px-3 py-2.5 ring-1 ring-accent-line">
          <div>
            <p className="text-xs font-semibold text-accent-text">
              {selectedDays.length > 1
                ? `${selectedDays.length} days`
                : `${label.weekday}, ${label.monthDay}`}
            </p>
            <p className="mt-0.5 text-[11px] text-fg-muted">
              {formatMinutes(form.startMin)} – {formatMinutes(form.endMin)}
              {selectedDays.length > 1 ? ' each day' : ''}
            </p>
          </div>
          <span className="rounded-lg bg-surface-inset px-2 py-1 text-[11px] font-semibold text-fg-muted">
            {duration > 0 ? formatDuration(duration) : '—'}
          </span>
        </div>

        <Field label="Title">
          <input
            data-autofocus
            value={form.title}
            onChange={(event) => patch({ title: event.target.value })}
            maxLength={128}
            placeholder="Lunch with the team"
            className={fieldClass}
          />
        </Field>

        <Field
          label="Description"
          hint="Required. Up to 250 characters."
        >
          <textarea
            value={form.description}
            onChange={(event) => patch({ description: event.target.value })}
            maxLength={250}
            rows={2}
            className={`${fieldClass} resize-none`}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Day">
            <select
              value={selectedDays[0] ?? ''}
              onChange={(event) => patch({ dateKeys: [event.target.value] })}
              className={fieldClass}
              disabled={!isEdit && selectedDays.length > 1}
            >
              {days.map((day) => {
                const dayLabel = labelDateKey(day)
                return (
                  <option key={day} value={day} className="bg-surface-1">
                    {dayLabel.weekday} {dayLabel.monthDay}
                  </option>
                )
              })}
            </select>
          </Field>

          <Field label="Start">
            <input
              type="time"
              step={300}
              value={clockValue(form.startMin)}
              onChange={(event) => {
                const minutes = parseTimeInput(event.target.value)
                if (minutes !== null) patch({ startMin: snapTo5(minutes) })
              }}
              className={fieldClass}
            />
          </Field>

          <Field label="End">
            <input
              type="time"
              step={300}
              value={clockValue(form.endMin)}
              onChange={(event) => {
                const minutes = parseTimeInput(event.target.value)
                if (minutes !== null) patch({ endMin: snapTo5(minutes) })
              }}
              className={fieldClass}
            />
          </Field>
        </div>

        {!isEdit ? (
          <Field
            label={`Repeat on ${selectedDays.length} day${selectedDays.length === 1 ? '' : 's'}`}
            hint="Drag sideways across the calendar to preselect a run of days."
          >
            <div className="flex flex-wrap gap-1.5">
              {days.map((day) => {
                const dayLabel = labelDateKey(day)
                const active = selectedDays.includes(day)
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      patch({
                        dateKeys: active
                          ? selectedDays.filter((entry) => entry !== day)
                          :
                            days.filter((entry) => entry === day || selectedDays.includes(entry)),
                      })
                    }
                    className={
                      'rounded-lg px-2 py-1 text-[11px] font-medium ring-1 ring-inset transition ' +
                      (active
                        ? 'bg-accent-soft text-accent-text ring-accent-line'
                        : 'bg-surface-2 text-fg-muted ring-line hover:bg-surface-3 hover:text-fg')
                    }
                  >
                    {dayLabel.weekday} {dayLabel.monthDay.replace(/^\w+ /, '')}
                  </button>
                )
              })}
            </div>
          </Field>
        ) : null}

        <Field label="Location" hint="Optional.">
          <input
            value={form.location}
            onChange={(event) => patch({ location: event.target.value })}
            maxLength={255}
            placeholder="Venetian, level 2"
            className={fieldClass}
          />
        </Field>

        {error ? (
          <p className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-[11px] leading-snug text-danger ring-1 ring-danger-line">
            <Icon name="warning" className="mt-px size-3.5 shrink-0" />
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
