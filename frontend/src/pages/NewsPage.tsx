import { useState, useEffect } from 'react'
import { Search, MapPin, Trash2, X } from 'lucide-react'
import { newsApi, type NewsPost } from '@/api/news'
import { useAuthStore } from '@/stores/authStore'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

export default function NewsPage() {
  const [posts, setPosts] = useState<NewsPost[]>([])
  const [loading, setLoading] = useState(true)
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
                placeholder="Фильтр по городу..."
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
          posts.map((post) => (
            <div key={post.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {post.image_url && (
                <img src={post.image_url} alt="" className="w-full h-44 object-cover" />
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
                {/* Render Telegram HTML formatting */}
                <div
                  className="text-sm text-gray-600 leading-relaxed news-content"
                  dangerouslySetInnerHTML={{ __html: post.content }}
                />
                <div className="flex items-center gap-2 pt-1 text-xs text-gray-400">
                  {post.city && (
                    <span className="flex items-center gap-0.5">
                      <MapPin className="w-3 h-3" />
                      {post.city}
                    </span>
                  )}
                  <span>{format(new Date(post.created_at), 'd MMMM yyyy', { locale: ru })}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
