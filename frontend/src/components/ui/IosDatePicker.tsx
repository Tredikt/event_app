import { useState, useRef, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

const ITEM_H = 44

const MONTHS = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
]

function daysInMonth(month: number, year: number) {
  return new Date(year, month, 0).getDate()
}

function range(from: number, to: number) {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i)
}

// ─── WheelColumn ────────────────────────────────────────────────────────────

interface ColProps {
  items: { value: number; label: string }[]
  value: number
  onChange: (v: number) => void
  className?: string
}

function WheelColumn({ items, value, onChange, className = 'flex-1' }: ColProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const programmatic = useRef(false)
  const snapTimer = useRef<ReturnType<typeof setTimeout>>()

  const scrollToIdx = useCallback((idx: number, smooth = false) => {
    const el = listRef.current
    if (!el) return
    programmatic.current = true
    if (smooth) {
      el.scrollTo({ top: idx * ITEM_H, behavior: 'smooth' })
      setTimeout(() => { programmatic.current = false }, 400)
    } else {
      el.scrollTop = idx * ITEM_H
      // double rAF ensures scroll event has already fired
      requestAnimationFrame(() => requestAnimationFrame(() => { programmatic.current = false }))
    }
  }, [])

  // On mount: set initial scroll without animation
  useEffect(() => {
    const idx = items.findIndex(i => i.value === value)
    if (idx >= 0) scrollToIdx(idx)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // When value/items change externally (e.g. day clamping): scroll smoothly
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const idx = items.findIndex(i => i.value === value)
    if (idx < 0) return
    if (Math.abs(el.scrollTop - idx * ITEM_H) > 2) scrollToIdx(idx, true)
  }, [value, items, scrollToIdx])

  const snap = useCallback(() => {
    const el = listRef.current
    if (!el || programmatic.current) return
    const idx = Math.max(0, Math.min(Math.round(el.scrollTop / ITEM_H), items.length - 1))
    programmatic.current = true
    el.scrollTo({ top: idx * ITEM_H, behavior: 'smooth' })
    setTimeout(() => { programmatic.current = false }, 400)
    if (items[idx]) onChange(items[idx].value)
  }, [items, onChange])

  const handleScroll = () => {
    if (programmatic.current) return
    clearTimeout(snapTimer.current)
    snapTimer.current = setTimeout(snap, 120)
  }

  return (
    <div className={`relative overflow-hidden ${className}`} style={{ height: ITEM_H * 5 }}>
      {/* top fade */}
      <div
        className="absolute top-0 left-0 right-0 z-20 pointer-events-none"
        style={{ height: ITEM_H * 2, background: 'linear-gradient(to bottom, white 30%, rgba(255,255,255,0.2))' }}
      />
      {/* bottom fade */}
      <div
        className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none"
        style={{ height: ITEM_H * 2, background: 'linear-gradient(to top, white 30%, rgba(255,255,255,0.2))' }}
      />
      {/* selection band */}
      <div
        className="absolute left-0 right-0 z-20 pointer-events-none"
        style={{ top: ITEM_H * 2, height: ITEM_H, borderTop: '0.5px solid #d1d5db', borderBottom: '0.5px solid #d1d5db' }}
      />
      <div
        ref={listRef}
        onScroll={handleScroll}
        style={{ height: ITEM_H * 5, overflowY: 'scroll', scrollbarWidth: 'none' } as React.CSSProperties}
        className="[&::-webkit-scrollbar]:hidden"
      >
        <div style={{ height: ITEM_H * 2 }} />
        {items.map(item => (
          <div key={item.value} style={{ height: ITEM_H }} className="flex items-center justify-center">
            <span className="text-[17px] text-gray-900 select-none">{item.label}</span>
          </div>
        ))}
        <div style={{ height: ITEM_H * 2 }} />
      </div>
    </div>
  )
}

// ─── IosDatePicker ──────────────────────────────────────────────────────────

interface Props {
  value: string
  onChange: (v: string) => void
  error?: boolean
}

export default function IosDatePicker({ value, onChange, error }: Props) {
  const [open, setOpen] = useState(false)

  const parse = (v: string) => {
    const d = v ? new Date(v) : new Date()
    return isNaN(d.getTime()) ? new Date() : d
  }

  const [day, setDay] = useState(() => parse(value).getDate())
  const [month, setMonth] = useState(() => parse(value).getMonth() + 1)
  const [year, setYear] = useState(() => parse(value).getFullYear())
  const [hour, setHour] = useState(() => parse(value).getHours())
  const [minute, setMinute] = useState(() => parse(value).getMinutes())

  // Clamp day when month/year changes
  useEffect(() => {
    const max = daysInMonth(month, year)
    if (day > max) setDay(max)
  }, [month, year]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpen = () => {
    const d = parse(value)
    setDay(d.getDate())
    setMonth(d.getMonth() + 1)
    setYear(d.getFullYear())
    setHour(d.getHours())
    setMinute(d.getMinutes())
    setOpen(true)
  }

  const handleConfirm = () => {
    const d = Math.min(day, daysInMonth(month, year))
    const str = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    onChange(str)
    setOpen(false)
  }

  const nowYear = new Date().getFullYear()
  const dayItems   = range(1, daysInMonth(month, year)).map(d => ({ value: d, label: String(d) }))
  const monthItems = MONTHS.map((m, i) => ({ value: i + 1, label: m }))
  const yearItems  = range(nowYear, nowYear + 5).map(y => ({ value: y, label: String(y) }))
  const hourItems  = range(0, 23).map(h => ({ value: h, label: String(h).padStart(2, '0') }))
  const minItems   = range(0, 59).map(m => ({ value: m, label: String(m).padStart(2, '0') }))

  const displayDate = value ? format(parse(value), 'd MMMM yyyy, HH:mm', { locale: ru }) : null

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className={`input w-full text-left ${error ? 'border-red-400 ring-1 ring-red-400' : ''}`}
      >
        {displayDate
          ? <span className="text-gray-900">{displayDate}</span>
          : <span className="text-gray-400">Выберите дату и время</span>}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div
            className="relative w-full bg-white rounded-t-3xl shadow-2xl"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-gray-500 text-[15px] py-1 px-2 -ml-2"
              >
                Отмена
              </button>
              <span className="text-[15px] font-semibold text-gray-900">Дата и время</span>
              <button
                type="button"
                onClick={handleConfirm}
                className="text-blue-700 text-[15px] font-semibold py-1 px-2 -mr-2"
              >
                Готово
              </button>
            </div>

            {/* Wheels */}
            <div className="flex items-center px-4 pb-2">
              <WheelColumn items={dayItems}   value={day}    onChange={setDay}    className="w-10" />
              <WheelColumn items={monthItems} value={month}  onChange={setMonth}  className="flex-1" />
              <WheelColumn items={yearItems}  value={year}   onChange={setYear}   className="w-[72px]" />

              {/* divider */}
              <div className="w-4" />

              <WheelColumn items={hourItems}  value={hour}   onChange={setHour}   className="w-12" />
              {/* colon centered on selection band */}
              <div style={{ height: ITEM_H * 5 }} className="flex items-center justify-center w-5">
                <span className="text-[17px] text-gray-400 font-medium leading-none">:</span>
              </div>
              <WheelColumn items={minItems}   value={minute} onChange={setMinute} className="w-12" />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
