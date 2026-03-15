import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'

const TRIGGER_PX = 80   // raw gesture distance that triggers reload
const DRAG_RATIO = 0.45 // resistance
const MAX_VISUAL = 100  // max px the spinner travels down

export default function PullToRefresh() {
  const [visual, setVisual] = useState(0)
  const [triggered, setTriggered] = useState(false)
  const startY = useRef<number | null>(null)
  const rawDy = useRef(0)

  useEffect(() => {
    // Only intercept in standalone PWA mode — browser handles it natively
    const isPwa =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    if (!isPwa) return

    const onStart = (e: TouchEvent) => {
      const scrollTop = document.documentElement.scrollTop || document.body.scrollTop
      if (scrollTop === 0) {
        startY.current = e.touches[0].clientY
        rawDy.current = 0
      }
    }

    const onMove = (e: TouchEvent) => {
      if (startY.current === null) return
      const dy = e.touches[0].clientY - startY.current
      if (dy <= 0) {
        startY.current = null
        rawDy.current = 0
        setVisual(0)
        return
      }
      rawDy.current = dy
      setVisual(Math.min(dy * DRAG_RATIO, MAX_VISUAL))
      if (dy > 8) e.preventDefault()
    }

    const onEnd = () => {
      if (startY.current === null) return
      startY.current = null
      if (rawDy.current >= TRIGGER_PX) {
        setTriggered(true)
        setVisual(44) // keep spinner visible while reloading
        setTimeout(() => window.location.reload(), 500)
      } else {
        setVisual(0)
        rawDy.current = 0
      }
    }

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)

    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
    }
  }, [])

  if (visual === 0 && !triggered) return null

  // progress 0→1 as gesture approaches trigger threshold
  const progress = Math.min(visual / (TRIGGER_PX * DRAG_RATIO), 1)
  const rotation = progress * 270

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'center',
        // spinner sits above the screen and pulls down into view
        transform: `translateY(${visual - 48}px)`,
        transition: triggered || visual === 0 ? 'transform 0.3s ease' : 'none',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: 'white',
          boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <RefreshCw
          style={{
            width: 20,
            height: 20,
            color: '#1d4ed8',
            transform: triggered ? undefined : `rotate(${rotation}deg)`,
            animation: triggered ? 'ptr-spin 0.7s linear infinite' : 'none',
            opacity: 0.5 + progress * 0.5,
          }}
        />
      </div>
      <style>{`@keyframes ptr-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
