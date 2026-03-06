import { Search, SlidersHorizontal, X } from 'lucide-react'
import clsx from 'clsx'
import type { Category } from '@/types'

interface Props {
  categories: Category[]
  selectedCategory: number | null
  onCategoryChange: (id: number | null) => void
  search: string
  onSearchChange: (s: string) => void
  onlyAvailable: boolean
  onAvailableChange: (v: boolean) => void
}

export default function FilterBar({
  categories, selectedCategory, onCategoryChange,
  search, onSearchChange, onlyAvailable, onAvailableChange,
}: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Поиск мероприятий..."
          className="input pl-10 pr-8"
        />
        {search && (
          <button onClick={() => onSearchChange('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => onCategoryChange(null)}
          className={clsx(
            'badge transition-colors cursor-pointer border',
            selectedCategory === null
              ? 'bg-blue-700 text-white border-blue-700'
              : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
          )}
        >
          Все
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => onCategoryChange(selectedCategory === cat.id ? null : cat.id)}
            className={clsx(
              'badge transition-colors cursor-pointer border',
              selectedCategory === cat.id
                ? 'text-white border-transparent'
                : 'bg-white text-gray-600 border-gray-200 hover:border-opacity-50'
            )}
            style={
              selectedCategory === cat.id
                ? { backgroundColor: cat.color, borderColor: cat.color }
                : { '--hover-color': cat.color } as React.CSSProperties
            }
          >
            {cat.icon} {cat.name}
          </button>
        ))}
        <button
          onClick={() => onAvailableChange(!onlyAvailable)}
          className={clsx(
            'badge transition-colors cursor-pointer border ml-auto',
            onlyAvailable ? 'bg-green-500 text-white border-green-500' : 'bg-white text-gray-600 border-gray-200'
          )}
        >
          <SlidersHorizontal className="w-3 h-3" />
          Есть места
        </button>
      </div>
    </div>
  )
}
