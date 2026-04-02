import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, MapPin, CalendarDays, Award, Plus, Trash2, ImageIcon, Loader, Flag } from 'lucide-react'
import toast from 'react-hot-toast'
import { fmtDate } from '@/utils/date'
import { usersApi, type OrganizerProfile } from '@/api/users'
import { newsApi, type NewsPost } from '@/api/news'
import { useAuthStore } from '@/stores/authStore'
import ReportModal from '@/components/ui/ReportModal'
import type { EventList } from '@/types'

const PREVIEW_LENGTH = 130

function PostContent({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = content.length > PREVIEW_LENGTH
  if (!isLong || expanded) {
    return <p className="text-xs text-gray-500 leading-relaxed whitespace-pre-wrap">{content}</p>
  }
  return (
    <div>
      <p className="text-xs text-gray-500 leading-relaxed">{content.slice(0, PREVIEW_LENGTH)}...</p>
      <button onClick={() => setExpanded(true)} className="text-xs text-blue-600 font-medium mt-0.5">
        Показать ещё
      </button>
    </div>
  )
}

export default function OrganizerPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const userId = Number(id)
  const { user } = useAuthStore()
  const isOwn = user?.id === userId

  const [profile, setProfile] = useState<OrganizerProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const [eventsTab, setEventsTab] = useState<'upcoming' | 'past'>('upcoming')
  const [upcomingEvents, setUpcomingEvents] = useState<EventList[]>([])
  const [pastEvents, setPastEvents] = useState<EventList[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)

  const [showReportModal, setShowReportModal] = useState(false)

  const [posts, setPosts] = useState<NewsPost[]>([])
  const [postsLoading, setPostsLoading] = useState(false)
  const [showPostForm, setShowPostForm] = useState(false)
  const [postTitle, setPostTitle] = useState('')
  const [postContent, setPostContent] = useState('')
  const [postImage, setPostImage] = useState<File | null>(null)
  const [postImagePreview, setPostImagePreview] = useState<string | null>(null)
  const [postSubmitting, setPostSubmitting] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!userId) return
    usersApi.getProfile(userId)
      .then((p) => setProfile(p.data))
      .catch(() => { toast.error('Пользователь не найден'); navigate('/') })
      .finally(() => setLoading(false))
  }, [userId])

  useEffect(() => {
    if (!userId) return
    setEventsLoading(true)
    Promise.all([
      usersApi.getEvents(userId, 'upcoming'),
      usersApi.getEvents(userId, 'past'),
    ]).then(([u, p]) => {
      setUpcomingEvents(u.data)
      setPastEvents(p.data)
    }).catch(() => {}).finally(() => setEventsLoading(false))
  }, [userId])

  useEffect(() => {
    if (!userId) return
    setPostsLoading(true)
    newsApi.list({ author_id: userId })
      .then((r) => setPosts(r.data))
      .catch(() => {})
      .finally(() => setPostsLoading(false))
  }, [userId])

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPostImage(file)
    const reader = new FileReader()
    reader.onload = () => setPostImagePreview(reader.result as string)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handlePostSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!postTitle.trim() || !postContent.trim()) {
      toast.error('Заполните заголовок и текст')
      return
    }
    setPostSubmitting(true)
    try {
      const form = new FormData()
      form.append('title', postTitle.trim())
      form.append('content', postContent.trim())
      if (postImage) form.append('image', postImage)
      const { data } = await newsApi.create(form)
      setPosts((prev) => [data, ...prev])
      setProfile((p) => p ? { ...p, posts_count: p.posts_count + 1 } : p)
      setPostTitle('')
      setPostContent('')
      setPostImage(null)
      setPostImagePreview(null)
      setShowPostForm(false)
      toast.success('Публикация создана!')
    } catch {
      toast.error('Ошибка публикации')
    } finally {
      setPostSubmitting(false)
    }
  }

  const handleDeletePost = async (postId: number) => {
    try {
      await newsApi.delete(postId)
      setPosts((prev) => prev.filter((p) => p.id !== postId))
      setProfile((p) => p ? { ...p, posts_count: Math.max(0, p.posts_count - 1) } : p)
      toast.success('Пост удалён')
    } catch {
      toast.error('Ошибка удаления')
    }
  }

  if (loading || !profile) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 animate-pulse space-y-4">
        <div className="h-24 bg-gray-100 rounded-2xl" />
        <div className="h-48 bg-gray-100 rounded-2xl" />
      </div>
    )
  }


  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4 pb-24">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
        <ArrowLeft className="w-4 h-4" />Назад
      </button>

      {/* Profile card */}
      <div className="bg-white rounded-2xl shadow-sm p-5">
        <div className="flex items-start gap-4">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-2xl font-bold flex-shrink-0">
              {profile.first_name[0]}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900">{profile.first_name} {profile.last_name}</h1>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <CalendarDays className="w-4 h-4 text-blue-700 mx-auto mb-1" />
            <p className="text-lg font-bold text-gray-900">{profile.events_count}</p>
            <p className="text-xs text-gray-500">мероприятий</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <Award className="w-4 h-4 text-blue-700 mx-auto mb-1" />
            <p className="text-lg font-bold text-gray-900">{profile.posts_count}</p>
            <p className="text-xs text-gray-500">публикаций</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <MapPin className="w-4 h-4 text-blue-700 mx-auto mb-1" />
            <p className="text-sm font-bold text-gray-900 truncate">{profile.city || '—'}</p>
            <p className="text-xs text-gray-500">город</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <CalendarDays className="w-3 h-3" />
            На сайте с {fmtDate(profile.created_at, 'MMMM yyyy')}
          </span>
        </div>

        {profile.bio && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{profile.bio}</p>
          </div>
        )}

        {!isOwn && user && (
          <div className="mt-4 pt-3 border-t border-gray-100">
            <button
              onClick={() => setShowReportModal(true)}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              <Flag className="w-3 h-3" />
              Пожаловаться
            </button>
          </div>
        )}
      </div>

      {/* Events section */}
      <div className="bg-white rounded-2xl shadow-sm p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Мероприятия</h2>
        <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => setEventsTab('upcoming')}
            className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${eventsTab === 'upcoming' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Предстоящие ({upcomingEvents.length})
          </button>
          <button
            onClick={() => setEventsTab('past')}
            className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${eventsTab === 'past' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Прошедшие ({pastEvents.length})
          </button>
        </div>
        {eventsLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : (eventsTab === 'upcoming' ? upcomingEvents : pastEvents).length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-4">
            {eventsTab === 'upcoming' ? 'Нет предстоящих мероприятий' : 'Нет прошедших мероприятий'}
          </p>
        ) : (
          <div className="space-y-2">
            {(eventsTab === 'upcoming' ? upcomingEvents : pastEvents).map((e) => (
              <button
                key={e.id}
                onClick={() => navigate(`/events/${e.id}`, { state: { from: `/users/${userId}` } })}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
              >
                {e.image_url ? (
                  <img src={e.image_url} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-blue-100 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900 truncate">{e.title}</p>
                  {e.date && (
                    <p className="text-xs text-gray-500 mt-0.5">{fmtDate(e.date, 'd MMMM yyyy')}</p>
                  )}
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">{e.participants_count}/{e.capacity}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Vlog section */}
      <div className="bg-white rounded-2xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Влог</h2>
          {isOwn && !showPostForm && (
            <button
              onClick={() => setShowPostForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 text-white text-sm font-medium rounded-xl hover:bg-blue-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Публикация
            </button>
          )}
        </div>

        {isOwn && showPostForm && (
          <form onSubmit={handlePostSubmit} className="mb-4 space-y-3 bg-gray-50 rounded-xl p-4">
            <input
              value={postTitle}
              onChange={(e) => setPostTitle(e.target.value)}
              className="input w-full"
              placeholder="Заголовок"
            />
            <textarea
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
              className="input w-full resize-none"
              rows={4}
              placeholder="Текст публикации..."
            />
            {postImagePreview && (
              <div className="relative">
                <img src={postImagePreview} alt="" className="w-full rounded-xl object-cover max-h-48" />
                <button
                  type="button"
                  onClick={() => { setPostImage(null); setPostImagePreview(null) }}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center"
                >
                  ×
                </button>
              </div>
            )}
            <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 text-gray-600 text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                <ImageIcon className="w-4 h-4" />
                Фото
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => { setShowPostForm(false); setPostTitle(''); setPostContent(''); setPostImage(null); setPostImagePreview(null) }}
                className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={postSubmitting}
                className="px-4 py-2 rounded-xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 transition-colors disabled:opacity-60 flex items-center gap-1.5"
              >
                {postSubmitting ? <Loader className="w-4 h-4 animate-spin" /> : 'Опубликовать'}
              </button>
            </div>
          </form>
        )}

        {postsLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : posts.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-6">
            {isOwn ? 'Нет публикаций. Создайте первую!' : 'Публикаций пока нет'}
          </p>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => {
              const imgUrl = post.images.length > 0 ? post.images[0].image_url : post.image_url
              return (
                <div key={post.id} className="rounded-xl border border-gray-100 overflow-hidden">
                  {imgUrl && (
                    <img src={imgUrl} alt="" className="w-full object-cover max-h-48" />
                  )}
                  <div className="p-3 space-y-1">
                    <div className="flex items-start gap-2 justify-between">
                      <p className="font-medium text-sm text-gray-900 leading-snug flex-1">{post.title}</p>
                      {isOwn && (
                        <button
                          onClick={() => handleDeletePost(post.id)}
                          className="text-gray-300 hover:text-red-400 flex-shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <PostContent content={post.content} />
                    <p className="text-xs text-gray-400">{fmtDate(post.created_at, 'd MMMM yyyy')}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showReportModal && profile && (
        <ReportModal
          targetUserId={userId!}
          targetName={profile.first_name}
          onClose={() => setShowReportModal(false)}
        />
      )}
    </div>
  )
}
