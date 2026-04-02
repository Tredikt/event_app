import { useState, useEffect } from 'react'
import { reportsApi } from '@/api/reports'
import toast from 'react-hot-toast'

interface Props {
  targetUserId: number
  targetName?: string
  onClose: () => void
}

export default function ReportModal({ targetUserId, targetName, onClose }: Props) {
  const [reasons, setReasons] = useState<string[]>([])
  const [reason, setReason] = useState('')
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    reportsApi.getReasons().then(({ data }) => setReasons(data))
  }, [])

  const handleSubmit = async () => {
    if (!reason) return
    setSubmitting(true)
    try {
      await reportsApi.create({
        reported_user_id: targetUserId,
        reason,
        comment: comment.trim() || undefined,
      })
      toast.success('Жалоба отправлена')
      onClose()
    } catch {
      toast.error('Ошибка при отправке жалобы')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 pb-4 sm:pb-0" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-gray-900">
          Жалоба{targetName ? ` на ${targetName}` : ''}
        </h3>
        <div className="space-y-2">
          {reasons.map((r) => (
            <button
              key={r}
              onClick={() => setReason(r)}
              className={`w-full text-left px-4 py-3 rounded-xl text-sm border transition-colors ${
                reason === r
                  ? 'border-red-400 bg-red-50 text-red-700 font-medium'
                  : 'border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Дополнительный комментарий (необязательно)"
          className="input w-full resize-none text-sm"
          rows={3}
        />
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
          >
            Отмена
          </button>
          <button
            onClick={handleSubmit}
            disabled={!reason || submitting}
            className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            {submitting ? 'Отправка...' : 'Отправить'}
          </button>
        </div>
      </div>
    </div>
  )
}
