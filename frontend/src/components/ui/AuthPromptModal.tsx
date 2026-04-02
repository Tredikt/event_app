import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'

interface Props {
  onClose: () => void
  message?: string
}

export default function AuthPromptModal({ onClose, message }: Props) {
  const navigate = useNavigate()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="text-3xl mb-3">👋</div>
        <h2 className="text-lg font-bold text-gray-900 mb-1">Нужна регистрация</h2>
        <p className="text-sm text-gray-500 mb-5">
          {message ?? 'Для этого действия необходимо войти в аккаунт.'}
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => { navigate('/register'); onClose() }}
            className="flex-1 py-3 rounded-xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 transition-colors"
          >
            Регистрация
          </button>
          <button
            onClick={() => { navigate('/login'); onClose() }}
            className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition-colors"
          >
            Войти
          </button>
        </div>
      </div>
    </div>
  )
}
