import { useRef, useEffect, useState } from 'react'
import type { EventList } from '@/types'
import { fmtDate } from '@/utils/date'
import { Locate } from 'lucide-react'

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
  const [mapReady, setMapReady] = useState(false)
  const [locating, setLocating] = useState(false)

  const goToMyLocation = () => {
    if (!navigator.geolocation || !mapRef.current) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const map = mapRef.current
        map.setCenter([coords.latitude, coords.longitude], 15, { duration: 400 })
        // Add/update user location pin
        if ((map as any)._myLocPin) {
          (map as any)._myLocPin.geometry.setCoordinates([coords.latitude, coords.longitude])
        } else {
          const pin = new window.ymaps.Placemark(
            [coords.latitude, coords.longitude],
            { balloonContent: 'Вы здесь' },
            { preset: 'islands#blueCircleDotIcon' }
          )
          map.geoObjects.add(pin)
          ;(map as any)._myLocPin = pin
        }
        setLocating(false)
      },
      (err) => {
        setLocating(false)
        if (err.code === 1) {
          alert('Разрешите доступ к геолокации в настройках браузера (Настройки → Safari → Геолокация)')
        } else {
          alert('Не удалось определить местоположение. Попробуйте ещё раз.')
        }
      },
      { timeout: 10000, enableHighAccuracy: false, maximumAge: 60000 }
    )
  }

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
        const dateStr = event.date ? fmtDate(event.date, 'd MMM, HH:mm') : ''
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
    <div style={{ height, width: '100%', position: 'relative' }}>
      <div
        ref={containerRef}
        style={{ height: '100%', width: '100%', borderRadius: '1rem', overflow: 'hidden' }}
      />
      {interactive && (
        <button
          onClick={goToMyLocation}
          disabled={locating}
          style={{
            position: 'absolute',
            bottom: '70px',
            right: '12px',
            zIndex: 10,
            background: 'white',
            border: 'none',
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '13px',
            fontWeight: 500,
            color: locating ? '#9CA3AF' : '#1D4ED8',
            cursor: locating ? 'default' : 'pointer',
          }}
        >
          <Locate
            style={{
              width: 16,
              height: 16,
              animation: locating ? 'spin 1s linear infinite' : 'none',
            }}
          />
          Где я?
        </button>
      )}
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
