import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import { chatApi, type ChatMessage } from '@/api/chat'
import { useAuthStore } from '@/stores/authStore'

const WS_BASE = import.meta.env.VITE_WS_URL || 'ws://localhost:8000'

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
}

export default function ChatPage() {
  const { chatId } = useParams<{ chatId: string }>()
  const id = Number(chatId)
  const navigate = useNavigate()
  const { token, user } = useAuthStore()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [partnerName, setPartnerName] = useState('')
  const [partnerAvatar, setPartnerAvatar] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Load history + open WS
  useEffect(() => {
    if (!id || !token) return

    chatApi.getMessages(id)
      .then((r) => {
        setMessages(r.data)
      })
      .catch(() => toast.error('Ошибка загрузки сообщений'))
      .finally(() => setLoading(false))

    // Also load partner name via chat list (quick approach)
    chatApi.listChats().then((r) => {
      const found = r.data.find((c) => c.chat_id === id)
      if (found) {
        setPartnerName(`${found.partner.first_name} ${found.partner.last_name}`.trim())
        setPartnerAvatar(found.partner.avatar_url)
      }
    })

    // WebSocket
    const wsUrl = `${WS_BASE}/chats/${id}/ws?token=${token}`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onmessage = (e) => {
      try {
        const msg: ChatMessage = JSON.parse(e.data)
        setMessages((prev) => {
          // avoid duplicates
          if (prev.some((m) => m.id === msg.id)) return prev
          return [...prev, msg]
        })
      } catch { /* ignore */ }
    }

    ws.onerror = () => {
      toast.error('Соединение прервано')
    }

    return () => {
      ws.close()
    }
  }, [id, token])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = () => {
    const trimmed = text.trim()
    if (!trimmed || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({ text: trimmed }))
    setText('')
    inputRef.current?.focus()
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-56px)] max-w-2xl mx-auto bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white shadow-sm flex-shrink-0">
        <button onClick={() => navigate('/chats')} className="text-gray-500 hover:text-gray-800 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        {partnerAvatar ? (
          <img src={partnerAvatar} alt="" className="w-9 h-9 rounded-full object-cover" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold">
            {partnerName[0] ?? '?'}
          </div>
        )}
        <span className="font-semibold text-gray-900 text-sm">{partnerName || '...'}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {loading ? (
          <div className="flex justify-center py-8 text-gray-400 text-sm">Загрузка...</div>
        ) : messages.length === 0 ? (
          <div className="flex justify-center py-8 text-gray-400 text-sm">Начните общение</div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_id === user?.id
            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${
                    isMe
                      ? 'bg-blue-700 text-white rounded-br-sm'
                      : 'bg-gray-100 text-gray-900 rounded-bl-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                  <p className={`text-[10px] mt-1 ${isMe ? 'text-blue-200' : 'text-gray-400'} text-right`}>
                    {formatTime(msg.created_at)}
                  </p>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 px-3 py-3 border-t border-gray-100 bg-white flex-shrink-0">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Сообщение..."
          className="flex-1 bg-gray-100 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          onClick={send}
          disabled={!text.trim()}
          className="w-10 h-10 rounded-full bg-blue-700 disabled:bg-gray-200 text-white flex items-center justify-center transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
