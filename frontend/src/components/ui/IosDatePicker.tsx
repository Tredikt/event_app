import { fmtDate } from '@/utils/date'

interface Props {
  value: string
  onChange: (v: string) => void
  error?: boolean
}

/** Convert Moscow ISO string from backend to datetime-local input value (Moscow time). */
function moscowToInput(mskStr: string): string {
  if (!mskStr) return ''
  // Treat no-tz strings as Moscow time (+03:00)
  const iso = mskStr.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(mskStr) ? mskStr : mskStr + '+03:00'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return mskStr.substring(0, 16)
  // Display in Moscow timezone for datetime-local input
  const msk = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${msk.getFullYear()}-${pad(msk.getMonth() + 1)}-${pad(msk.getDate())}T${pad(msk.getHours())}:${pad(msk.getMinutes())}`
}

export default function IosDatePicker({ value, onChange, error }: Props) {
  const localValue = moscowToInput(value)

  // Min = current Moscow time
  const nowMsk = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' }))
  const pad = (n: number) => String(n).padStart(2, '0')
  const minStr = `${nowMsk.getFullYear()}-${pad(nowMsk.getMonth() + 1)}-${pad(nowMsk.getDate())}T${pad(nowMsk.getHours())}:${pad(nowMsk.getMinutes())}`

  const displayDate = localValue ? fmtDate(localValue + '+03:00', 'd MMMM yyyy, HH:mm') : null

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
