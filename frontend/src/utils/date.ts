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

/** Return yyyy-MM-dd string in Moscow timezone (for grouping by day). */
export function mskDateKey(iso: string): string {
  return formatInTimeZone(parseMSK(iso), MSK, 'yyyy-MM-dd')
}

/** Human-readable day label: «Сегодня», «Вчера», or «15 марта» / «15 марта 2024». */
export function dayLabel(iso: string): string {
  const now = new Date()
  const today = formatInTimeZone(now, MSK, 'yyyy-MM-dd')
  const yesterday = formatInTimeZone(new Date(now.getTime() - 86400000), MSK, 'yyyy-MM-dd')
  const key = mskDateKey(iso)
  if (key === today) return 'Сегодня'
  if (key === yesterday) return 'Вчера'
  const thisYear = formatInTimeZone(now, MSK, 'yyyy')
  const msgYear = formatInTimeZone(parseMSK(iso), MSK, 'yyyy')
  return fmtDate(iso, msgYear === thisYear ? 'd MMMM' : 'd MMMM yyyy')
}
