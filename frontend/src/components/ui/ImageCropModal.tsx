import { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'
import type { Area } from 'react-easy-crop'
import { X, Check } from 'lucide-react'

interface Props {
  src: string
  onConfirm: (blob: Blob) => void
  onCancel: () => void
}

const ASPECTS = [
  { label: 'Своб.', value: undefined },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '16:9', value: 16 / 9 },
] as const

async function getCroppedBlob(imageSrc: string, cropArea: Area): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = imageSrc
  })

  const canvas = document.createElement('canvas')
  canvas.width = cropArea.width
  canvas.height = cropArea.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(image, cropArea.x, cropArea.y, cropArea.width, cropArea.height, 0, 0, cropArea.width, cropArea.height)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Canvas toBlob failed'))
    }, 'image/jpeg', 0.92)
  })
}

export default function ImageCropModal({ src, onConfirm, onCancel }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [aspectIdx, setAspectIdx] = useState(0)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [loading, setLoading] = useState(false)

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels)
  }, [])

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return
    setLoading(true)
    try {
      const blob = await getCroppedBlob(src, croppedAreaPixels)
      onConfirm(blob)
    } finally {
      setLoading(false)
    }
  }

  const aspect = ASPECTS[aspectIdx].value

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur-sm flex-shrink-0">
        <button type="button" onClick={onCancel} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20">
          <X className="w-5 h-5" />
        </button>
        <span className="text-white font-medium text-sm">Редактировать фото</span>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={loading}
          className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white hover:bg-blue-700 disabled:opacity-60"
        >
          <Check className="w-5 h-5" />
        </button>
      </div>

      {/* Cropper */}
      <div className="relative flex-1">
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          showGrid={false}
          restrictPosition={false}
          style={{
            containerStyle: { background: '#000' },
            cropAreaStyle: { border: '2px solid white', borderRadius: '12px' },
          }}
        />
      </div>

      {/* Aspect ratio selector */}
      <div className="flex items-center justify-center gap-2 px-6 pt-4 bg-black/80 flex-shrink-0">
        {ASPECTS.map((a, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setAspectIdx(i)}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
              aspectIdx === i ? 'bg-white text-black' : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {/* Zoom slider */}
      <div className="flex items-center gap-3 px-6 py-4 bg-black/80 flex-shrink-0">
        <span className="text-white/50 text-xs">−</span>
        <input
          type="range"
          min={0.1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="flex-1 accent-white"
        />
        <span className="text-white/50 text-xs">+</span>
      </div>
    </div>
  )
}
