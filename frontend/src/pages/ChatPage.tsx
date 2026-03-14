import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Send, Paperclip, X } from 'lucide-react'
import api from '@/api/client'
import toast from 'react-hot-toast'
import { chatApi, type ChatMessage } from '@/api/chat'
import { useAuthStore } from '@/stores/authStore'

// Route WS through the same host as the frontend (Vite proxy in dev, nginx in prod)
const WS_BASE = import.meta.env.VITE_WS_URL ||
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api`

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
  const [uploading, setUploading] = useState(false)
  const [pendingImage, setPendingImage] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

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
        const data = JSON.parse(e.data)
        if (data.type === 'read') {
          // Mark all messages from current user as read
          setMessages((prev) => prev.map((m) => m.sender_id === user?.id ? { ...m, is_read: true } : m))
          return
        }
        const msg: ChatMessage = data
        setMessages((prev) => {
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
    if ((!trimmed && !pendingImage) || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({ text: trimmed || undefined, image_url: pendingImage || undefined }))
    setText('')
    setPendingImage(null)
    inputRef.current?.focus()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const { data } = await api.post<{ url: string }>(`/chats/${id}/upload`, form)
      setPendingImage(data.url)
    } catch {
      toast.error('Ошибка загрузки файла')
    } finally {
      setUploading(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="fixed inset-0 bottom-14 flex flex-col bg-white max-w-2xl mx-auto left-0 right-0">
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
                  {msg.image_url && (
                    <img
                      src={msg.image_url}
                      alt=""
                      className="rounded-xl mb-1 max-w-full max-h-60 object-cover cursor-pointer"
                      onClick={() => window.open(msg.image_url!, '_blank')}
                    />
                  )}
                  {msg.text && <p className="whitespace-pre-wrap break-words">{msg.text}</p>}
                  <p className={`text-[10px] mt-1 ${isMe ? 'text-blue-200' : 'text-gray-400'} text-right flex items-center justify-end gap-0.5`}>
                    {formatTime(msg.created_at)}
                    {isMe && (
                      <span className="ml-1 leading-none">
                        {msg.is_read ? (
                          <span title="Прочитано">✓✓</span>
                        ) : (
                          <span title="Доставлено">✓</span>
                        )}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Pending image preview */}
      {pendingImage && (
        <div className="px-3 pb-2 bg-white flex items-center gap-2">
          <div className="relative inline-block">
            <img src={pendingImage} alt="" className="h-16 w-16 rounded-xl object-cover border border-gray-200" />
            <button
              onClick={() => setPendingImage(null)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-700 text-white rounded-full flex items-center justify-center"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="flex items-center gap-2 px-3 py-3 border-t border-gray-100 bg-white flex-shrink-0">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/mp4"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-9 h-9 rounded-full text-gray-400 hover:text-blue-600 flex items-center justify-center transition-colors flex-shrink-0"
        >
          {uploading ? (
            <span className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
          ) : (
            <Paperclip className="w-5 h-5" />
          )}
        </button>
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
          disabled={!text.trim() && !pendingImage}
          className="w-10 h-10 rounded-full bg-blue-700 disabled:bg-gray-200 text-white flex items-center justify-center transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
