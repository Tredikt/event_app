import { useRef, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import type { EventList } from '@/types'

declare global {
  interface Window {
    ymaps: any
  }
}

interface EventMapProps {
  events?: EventList[]
  center?: [number, number]
  zoom?: number
  height?: string
  onMapClick?: (lat: number, lng: number) => void
  selectedPin?: [number, number] | null
  interactive?: boolean
}

const EMPTY_EVENTS: EventList[] = []

function createPinSvg(color: string): string {
  const svg = `<svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg">
    <path d="M15 0C6.716 0 0 6.716 0 15c0 10.5 15 27 15 27S30 25.5 30 15C30 6.716 23.284 0 15 0z" fill="${color}"/>
    <circle cx="15" cy="15" r="6" fill="white"/>
  </svg>`
  return 'data:image/svg+xml,' + encodeURIComponent(svg)
}

export default function EventMap({
  events = EMPTY_EVENTS,
  center = [47.2357, 39.7015],
  zoom = 12,
  height = '100%',
  onMapClick,
  selectedPin,
  interactive = true,
}: EventMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const onMapClickRef = useRef(onMapClick)
  // Signals that the map instance is ready — triggers Effect 2
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    onMapClickRef.current = onMapClick
  }, [onMapClick])

  // Effect 1: create/destroy map
  useEffect(() => {
    if (!containerRef.current || !window.ymaps) return

    let destroyed = false

    window.ymaps.ready(() => {
      if (destroyed || !containerRef.current) return

      if (mapRef.current) {
        mapRef.current.destroy()
        mapRef.current = null
      }

      const map = new window.ymaps.Map(
        containerRef.current,
        { center, zoom, controls: interactive ? ['zoomControl'] : [] },
        { suppressMapOpenBlock: true }
      )

      if (!interactive) {
        map.behaviors.disable(['drag', 'scrollZoom', 'multiTouch'])
      }

      map.events.add('click', (e: any) => {
        const coords = e.get('coords')
        onMapClickRef.current?.(coords[0], coords[1])
      })

      mapRef.current = map
      setMapReady(true)
    })

    return () => {
      destroyed = true
      mapRef.current?.destroy()
      mapRef.current = null
      setMapReady(false)
    }
  }, [center[0], center[1], zoom, interactive]) // eslint-disable-line react-hooks/exhaustive-deps

  // Effect 2: update placemarks — guaranteed to run after map is ready
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current

    map.geoObjects.removeAll()

    events
      .filter((e) => e.latitude && e.longitude)
      .forEach((event) => {
        const color = event.is_full ? '#9CA3AF' : event.category.color
        const dateStr = event.date ? format(new Date(event.date), 'd MMM, HH:mm', { locale: ru }) : ''
        const fullBadge = event.is_full
          ? ' • <span style="color:#EF4444;">Мест нет</span>'
          : ''
        const balloonContent = `
          <div style="min-width:200px;padding:4px 2px;">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
              <span style="font-size:18px;">${event.category.icon}</span>
              <span style="font-size:12px;font-weight:500;color:${event.category.color};">${event.category.name}</span>
            </div>
            <h3 style="font-weight:600;margin:0 0 4px;font-size:14px;line-height:1.3;">${event.title}</h3>
            <p style="font-size:12px;color:#6B7280;margin:0 0 2px;">📅 ${dateStr}</p>
            <p style="font-size:12px;color:#6B7280;margin:0 0 10px;">👥 ${event.participants_count}/${event.capacity}${fullBadge}</p>
            <a href="/events/${event.id}" style="display:block;text-align:center;background:#0EA5E9;color:white;padding:6px 0;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;">Подробнее →</a>
          </div>
        `
        const placemark = new window.ymaps.Placemark(
          [event.latitude!, event.longitude!],
          { balloonContent },
          {
            iconLayout: 'default#image',
            iconImageHref: createPinSvg(color),
            iconImageSize: [30, 42],
            iconImageOffset: [-15, -42],
            hideIconOnBalloonOpen: false,
          }
        )
        map.geoObjects.add(placemark)
      })

    if (selectedPin) {
      map.geoObjects.add(
        new window.ymaps.Placemark(selectedPin, {}, { preset: 'islands#redDotIcon' })
      )
    }
  }, [mapReady, events, selectedPin?.[0], selectedPin?.[1]]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={containerRef}
      style={{ height, width: '100%', borderRadius: '1rem', overflow: 'hidden' }}
    />
  )
}
