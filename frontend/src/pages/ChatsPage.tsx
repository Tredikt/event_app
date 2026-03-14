import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquare } from 'lucide-react'
import toast from 'react-hot-toast'
import { chatApi, type ChatListItem } from '@/api/chat'

function formatTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  return isToday
    ? d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('ru', { day: 'numeric', month: 'short' })
}

export default function ChatsPage() {
  const [chats, setChats] = useState<ChatListItem[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    chatApi.listChats()
      .then((r) => setChats(r.data))
      .catch(() => toast.error('Ошибка загрузки чатов'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="max-w-2xl mx-auto bg-white min-h-screen">
      <div className="px-4 pt-5 pb-3 border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-900">Сообщения</h1>
      </div>

      {loading ? (
        <div className="space-y-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
              <div className="w-12 h-12 rounded-full bg-gray-200 flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-1/3" />
                <div className="h-3 bg-gray-100 rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : chats.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
          <MessageSquare className="w-14 h-14 mb-4 text-gray-200" />
          <p className="font-semibold text-gray-500">Нет сообщений</p>
          <p className="text-sm mt-1">Напишите организатору с&nbsp;страницы мероприятия</p>
        </div>
      ) : (
        <div>
          {chats.map((chat) => {
            const name = `${chat.partner.first_name} ${chat.partner.last_name}`.trim()
            return (
              <button
                key={chat.chat_id}
                onClick={() => navigate(`/chats/${chat.chat_id}`)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 text-left"
              >
                {chat.partner.avatar_url ? (
                  <img src={chat.partner.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-lg flex-shrink-0">
                    {chat.partner.first_name[0]}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm text-gray-900 truncate">{name}</span>
                    {chat.last_message && (
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {formatTime(chat.last_message.created_at)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-sm text-gray-500 truncate">
                      {chat.last_message ? chat.last_message.text : 'Начните общение'}
                    </p>
                    {chat.unread > 0 && (
                      <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-blue-700 text-white text-xs font-bold flex items-center justify-center">
                        {chat.unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
