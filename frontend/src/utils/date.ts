import { formatInTimeZone } from 'date-fns-tz'
import { ru } from 'date-fns/locale'

const MSK = 'Europe/Moscow'

/** Parse an ISO string from the backend as Moscow time (naive strings treated as MSK). */
function parseMSK(iso: string): Date {
  // Backend returns naive datetimes stored in Moscow time.
  // If no tz suffix — append +03:00 so JS parses correctly.
  if (!iso.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(iso)) {
    return new Date(iso + '+03:00')
  }
  return new Date(iso)
}

/** Format a date string in Moscow timezone with Russian locale. */
export function fmtDate(iso: string | null | undefined, fmt: string): string {
  if (!iso) return ''
  try {
    return formatInTimeZone(parseMSK(iso), MSK, fmt, { locale: ru })
  } catch {
    return ''
  }
}

/** Format time only (HH:mm) in Moscow timezone. */
export function fmtTime(iso: string | null | undefined): string {
  return fmtDate(iso, 'HH:mm')
}

/** Return true if the Moscow date is today. */
export function isMoscowToday(iso: string): boolean {
  const now = new Date()
  const todayMsk = formatInTimeZone(now, MSK, 'yyyy-MM-dd')
  const dateMsk = formatInTimeZone(parseMSK(iso), MSK, 'yyyy-MM-dd')
  return todayMsk === dateMsk
}

/** Format chat timestamp: time if today, else short date. */
export function fmtChatTs(iso: string): string {
  if (isMoscowToday(iso)) {
    return fmtDate(iso, 'HH:mm')
  }
  return fmtDate(iso, 'd MMM')
}

/** Return true if the Moscow datetime is in the past. */
export function isMoscowPast(iso: string): boolean {
  return parseMSK(iso) < new Date()
}
