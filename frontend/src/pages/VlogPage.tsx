import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, ImageIcon, Loader } from 'lucide-react'
import toast from 'react-hot-toast'
import { newsApi, type NewsPost } from '@/api/news'
import { useAuthStore } from '@/stores/authStore'
import { fmtDate } from '@/utils/date'

export default function VlogPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [posts, setPosts] = useState<NewsPost[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const imageRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!user) return
    newsApi.list({ author_id: user.id })
      .then((r) => setPosts(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [user])

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImage(file)
    const reader = new FileReader()
    reader.onload = () => setImagePreview(reader.result as string)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) { toast.error('Заполните заголовок и текст'); return }
    setSubmitting(true)
    try {
      const form = new FormData()
      form.append('title', title.trim())
      form.append('content', content.trim())
      if (image) form.append('image', image)
      const { data } = await newsApi.create(form)
      setPosts((prev) => [data, ...prev])
      setTitle(''); setContent(''); setImage(null); setImagePreview(null)
      setShowForm(false)
      toast.success('Публикация создана!')
    } catch {
      toast.error('Ошибка публикации')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (postId: number) => {
    try {
      await newsApi.delete(postId)
      setPosts((prev) => prev.filter((p) => p.id !== postId))
      toast.success('Пост удалён')
    } catch {
      toast.error('Ошибка удаления')
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24 space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          <ArrowLeft className="w-4 h-4" />Назад
        </button>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-700 text-white text-sm font-medium rounded-xl hover:bg-blue-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Новая публикация
          </button>
        )}
      </div>

      <h1 className="text-xl font-bold text-gray-900">Мой влог</h1>

      {showForm && (
        <div className="card p-4 space-y-3">
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input w-full"
              placeholder="Заголовок"
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="input w-full resize-none"
              rows={4}
              placeholder="Текст публикации..."
            />
            {imagePreview && (
              <div className="relative">
                <img src={imagePreview} alt="" className="w-full rounded-xl object-cover max-h-52" />
                <button
                  type="button"
                  onClick={() => { setImage(null); setImagePreview(null) }}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center text-base"
                >×</button>
              </div>
            )}
            <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => imageRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 text-gray-600 text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                <ImageIcon className="w-4 h-4" />Фото
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => { setShowForm(false); setTitle(''); setContent(''); setImage(null); setImagePreview(null) }}
                className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 transition-colors disabled:opacity-60 flex items-center gap-1.5"
              >
                {submitting ? <Loader className="w-4 h-4 animate-spin" /> : 'Опубликовать'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="card h-24 animate-pulse bg-gray-100" />)}
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-3">✏️</div>
          <p className="font-semibold text-gray-500">Публикаций пока нет</p>
          <p className="text-sm mt-1">Создайте первую запись в вашем влоге</p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => {
            const imgUrl = post.images.length > 0 ? post.images[0].image_url : post.image_url
            return (
              <div key={post.id} className="card overflow-hidden">
                {imgUrl && <img src={imgUrl} alt="" className="w-full object-cover max-h-56" />}
                <div className="p-4 space-y-1.5">
                  <div className="flex items-start gap-2 justify-between">
                    <p className="font-semibold text-gray-900 flex-1 leading-snug">{post.title}</p>
                    <button
                      onClick={() => handleDelete(post.id)}
                      className="text-gray-300 hover:text-red-400 flex-shrink-0 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-sm text-gray-500 leading-relaxed line-clamp-3">{post.content}</p>
                  <p className="text-xs text-gray-400">{fmtDate(post.created_at, 'd MMMM yyyy')}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
