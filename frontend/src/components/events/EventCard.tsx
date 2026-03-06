import { Link } from 'react-router-dom'
import { MapPin, Users } from 'lucide-react'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import clsx from 'clsx'
import type { EventList } from '@/types'

interface Props {
  event: EventList
  compact?: boolean
  wide?: boolean
}

function shortAddress(address: string): string {
  const parts = address.split(',').map((s) => s.trim())
  // "26, Большая Садовая улица, Ленинский район, Ростов-на-Дону, ..."
  // → "26, Большая Садовая улица"
  return parts.slice(0, 2).join(', ')
}

export default function EventCard({ event, compact = false, wide = false }: Props) {
  const fillPercent = (event.participants_count / event.capacity) * 100
  const dateStr = format(new Date(event.date), 'd MMM, HH:mm', { locale: ru })

  return (
    <Link
      to={`/events/${event.id}`}
      className="card flex flex-col overflow-hidden hover:shadow-md transition-shadow group"
    >
      {/* Image / placeholder */}
      <div className={clsx('relative overflow-hidden flex-shrink-0', wide ? 'h-40' : compact ? 'h-28' : 'h-32')}>
        {event.image_url ? (
          <img
            src={event.image_url}
            alt={event.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center relative"
            style={{
              background: `linear-gradient(135deg, ${event.category.color}cc 0%, ${event.category.color}88 100%)`,
            }}
          >
            {/* subtle dot grid */}
            <div
              className="absolute inset-0 opacity-20"
              style={{
                backgroundImage: 'radial-gradient(circle, white 1.5px, transparent 1.5px)',
                backgroundSize: '18px 18px',
              }}
            />
            <span className="text-6xl drop-shadow-sm select-none z-10">{event.category.icon}</span>
          </div>
        )}

        {/* Category badge */}
        <div className="absolute top-2 left-2">
          <span className="badge text-white text-xs font-medium shadow-sm" style={{ backgroundColor: event.category.color }}>
            {event.category.icon}{wide ? ` ${event.category.name}` : ''}
          </span>
        </div>

        {/* Full badge */}
        {event.is_full && (
          <div className="absolute top-2 right-2 badge bg-gray-900/70 text-white text-xs">
            Мест нет
          </div>
        )}

        {/* Date chip pinned to bottom-right */}
        <div className="absolute bottom-2 right-2 bg-black/40 backdrop-blur-sm text-white text-xs px-2 py-0.5 rounded-full">
          {dateStr}
        </div>
      </div>

      {/* Body */}
      <div className={clsx('flex flex-col gap-1.5 flex-1', wide ? 'p-3.5' : 'p-2.5')}>
        <h3 className={clsx(
          'font-semibold text-gray-900 line-clamp-2 leading-snug group-hover:text-blue-700 transition-colors',
          wide ? 'text-sm' : 'text-xs'
        )}>
          {event.title}
        </h3>

        <div className="flex items-start gap-1 text-xs text-gray-500">
          <MapPin className="w-3 h-3 flex-shrink-0 mt-0.5" />
          <span className="line-clamp-1 text-[11px]">{shortAddress(event.address)}</span>
        </div>

        {/* Footer: participants + progress */}
        <div className="mt-auto pt-1">
          <div className="flex items-center justify-between text-[11px] text-gray-500 mb-1">
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {event.participants_count} / {event.capacity}
            </span>
            <span className={clsx('font-medium', event.is_full ? 'text-red-500' : 'text-blue-700')}>
              {event.is_full ? 'Нет мест' : `${Math.round(fillPercent)}%`}
            </span>
          </div>
          <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={clsx('h-full rounded-full transition-all', event.is_full ? 'bg-red-400' : 'bg-blue-600')}
              style={{ width: `${Math.min(fillPercent, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </Link>
  )
}
