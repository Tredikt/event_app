import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

interface Props {
  value: string
  onChange: (v: string) => void
  error?: boolean
}

export default function IosDatePicker({ value, onChange, error }: Props) {
  const normalized = value ? value.substring(0, 16) : ''
  const minDate = new Date()
  minDate.setMinutes(minDate.getMinutes() - minDate.getTimezoneOffset())
  const minStr = minDate.toISOString().substring(0, 16)

  let displayDate: string | null = null
  if (value) {
    try {
      displayDate = format(new Date(value), "d MMMM yyyy, HH:mm", { locale: ru })
    } catch { /* ignore */ }
  }

  return (
    <div>
      <input
        type="datetime-local"
        value={normalized}
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
