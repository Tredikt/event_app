import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

interface Props {
  value: string
  onChange: (v: string) => void
  error?: boolean
}

/** Convert UTC ISO string from backend to local datetime-local input value */
function utcToLocalInput(utcStr: string): string {
  if (!utcStr) return ''
  // If string has no timezone marker, treat as UTC by appending Z
  const iso = utcStr.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(utcStr) ? utcStr : utcStr + 'Z'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return utcStr.substring(0, 16)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function IosDatePicker({ value, onChange, error }: Props) {
  const localValue = utcToLocalInput(value)

  const minDate = new Date()
  minDate.setMinutes(minDate.getMinutes() - minDate.getTimezoneOffset())
  const minStr = minDate.toISOString().substring(0, 16)

  let displayDate: string | null = null
  if (localValue) {
    try {
      displayDate = format(new Date(localValue), "d MMMM yyyy, HH:mm", { locale: ru })
    } catch { /* ignore */ }
  }

  return (
    <div>
      <input
        type="datetime-local"
        value={localValue}
        onChange={(e) => onChange(e.target.value)}
        min={minStr}
        className={`input w-full ${error ? 'border-red-400 ring-1 ring-red-400' : ''}`}
        style={{ colorScheme: 'light', fontSize: '16px' }}
      />
      {displayDate && (
        <p className="text-xs text-blue-700 mt-1.5 font-medium">{displayDate}</p>
      )}
    </div>
  )
}
