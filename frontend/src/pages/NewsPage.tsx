import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Search, MapPin, Trash2, X, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react'
import { newsApi, type NewsPost } from '@/api/news'
import { useAuthStore } from '@/stores/authStore'
import toast from 'react-hot-toast'
import { getServerData } from '@/serverData'
import { fmtDate } from '@/utils/date'

const PREVIEW_LENGTH = 130

function NewsCarousel({ images, fallback }: { images: string[]; fallback?: string }) {
  const all = images.length > 0 ? images : fallback ? [fallback] : []
  const [idx, setIdx] = useState(0)
  const touchStartX = useRef<number | null>(null)

  const prev = useCallback(() => setIdx((i) => (i - 1 + all.length) % all.length), [all.length])
  const next = useCallback(() => setIdx((i) => (i + 1) % all.length), [all.length])

  if (all.length === 0) return null

  return (
    <div
      className="relative w-full overflow-hidden select-none"
      style={{ maxHeight: '280px' }}
      onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null || all.length <= 1) return
        const diff = touchStartX.current - e.changedTouches[0].clientX
        if (Math.abs(diff) > 40) diff > 0 ? next() : prev()
        touchStartX.current = null
      }}
    >
      <img
        key={idx}
        src={all[idx]}
        alt=""
        className="w-full object-cover"
        style={{ maxHeight: '280px' }}
      />

      {all.length > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={next}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {all.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                className={`rounded-full transition-all ${i === idx ? 'w-4 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/50'}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function NewsContent({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = content.length > PREVIEW_LENGTH

  const html = (text: string) => text.replace(/\n/g, '<br>')

  if (!isLong || expanded) {
    return (
      <div className="space-y-1">
        <div
          className="text-sm text-gray-600 leading-relaxed news-content"
          dangerouslySetInnerHTML={{ __html: html(content) }}
        />
        {isLong && (
          <button
            onClick={() => setExpanded(false)}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            Свернуть
          </button>
        )}
      </div>
    )
  }

  const preview = content.slice(0, PREVIEW_LENGTH).trimEnd()
  return (
    <div className="space-y-1">
      <div
        className="text-sm text-gray-600 leading-relaxed news-content"
        dangerouslySetInnerHTML={{ __html: html(preview) + '…' }}
      />
      <button
        onClick={() => setExpanded(true)}
        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
      >
        Показать ещё
      </button>
    </div>
  )
}

export default function NewsPage() {
  const initial = getServerData()
  const [posts, setPosts] = useState<NewsPost[]>(initial.news ?? [])
  const [loading, setLoading] = useState(!initial.news)
  const [cityFilter, setCityFilter] = useState('')
  const [cityInput, setCityInput] = useState('')
  const { user } = useAuthStore()

  const fetchPosts = async (filter: string) => {
    setLoading(true)
    try {
      const { data } = await newsApi.list(filter || undefined)
      setPosts(data)
    } catch {
      toast.error('Не удалось загрузить новости')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPosts(cityFilter)
  }, [cityFilter])

  const handleCitySearch = () => setCityFilter(cityInput.trim())

  const handleDelete = async (id: number) => {
    try {
      await newsApi.delete(id)
      setPosts(posts.filter((p) => p.id !== id))
      toast.success('Пост удалён')
    } catch {
      toast.error('Ошибка при удалении')
    }
  }

  // Build carousel images for a post: prefer images array, fall back to image_url / event_image_url
  const getImages = (post: NewsPost): string[] => {
    if (post.images && post.images.length > 0) return post.images.map((img) => img.image_url)
    const fb = post.image_url || post.event_image_url
    return fb ? [fb] : []
  }

  return (
    <div className="bg-gray-50 pb-24 min-h-screen">
      {/* Search by city */}
      <div className="sticky top-0 z-20 bg-white px-4 pt-3 pb-3 border-b border-gray-100 shadow-sm">
        <div className="max-w-2xl mx-auto space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                value={cityInput}
                onChange={(e) => setCityInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCitySearch()}
                className="w-full pl-9 pr-4 py-2.5 bg-gray-100 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white transition-colors"
                placeholder="Город..."
                style={{ fontSize: '16px' }}
              />
            </div>
            <button
              onClick={handleCitySearch}
              className="px-4 py-2.5 bg-blue-700 text-white rounded-xl text-sm font-medium"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>
          {cityFilter && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Город:</span>
              <span className="flex items-center gap-1 bg-blue-100 text-blue-700 text-xs font-medium px-2.5 py-1 rounded-full">
                {cityFilter}
                <button onClick={() => { setCityFilter(''); setCityInput('') }}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Posts list */}
      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl shadow-sm p-4 animate-pulse space-y-2">
              <div className="h-4 bg-gray-200 rounded w-2/3" />
              <div className="h-3 bg-gray-100 rounded w-full" />
              <div className="h-3 bg-gray-100 rounded w-4/5" />
            </div>
          ))
        ) : posts.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-5xl mb-3">📰</div>
            <p className="font-semibold text-gray-500">Новостей пока нет</p>
            {cityFilter && <p className="text-sm mt-1">Попробуйте другой город</p>}
          </div>
        ) : (
          posts.map((post) => {
            const images = getImages(post)
            return (
              <div key={post.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {images.length > 0 && (
                  <NewsCarousel
                    images={post.images.map((img) => img.image_url)}
                    fallback={post.image_url || post.event_image_url}
                  />
                )}
                <div className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-gray-900 text-sm leading-snug flex-1">{post.title}</h3>
                    {user?.is_admin && (
                      <button onClick={() => handleDelete(post.id)} className="text-gray-300 hover:text-red-400 flex-shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <NewsContent content={post.content} />
                  <div className="flex items-center gap-2 pt-1 text-xs text-gray-400">
                    {post.city && (
                      <span className="flex items-center gap-0.5">
                        <MapPin className="w-3 h-3" />
                        {post.city}
                      </span>
                    )}
                    <span>{fmtDate(post.created_at, 'd MMMM yyyy')}</span>
                  </div>
                  {post.event_id && (
                    <Link
                      to={`/events/${post.event_id}`}
                      className="flex items-center justify-center gap-2 w-full mt-1 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium text-sm transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      К мероприятию
                    </Link>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
