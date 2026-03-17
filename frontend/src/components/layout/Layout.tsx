import { useEffect, useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { Home, Newspaper, Plus, MessageSquare, User } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { authApi } from '@/api/auth'
import clsx from 'clsx'
import PullToRefresh from '@/components/ui/PullToRefresh'

export default function Layout() {
  const { isAuthenticated, user, updateUser } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [keyboardOpen, setKeyboardOpen] = useState(false)

  useEffect(() => {
    if (isAuthenticated) {
      authApi.getMe().then((r) => updateUser(r.data)).catch(() => {})
    }
  }, [])

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const onResize = () => setKeyboardOpen(vv.height < window.innerHeight * 0.75)
    vv.addEventListener('resize', onResize)
    return () => vv.removeEventListener('resize', onResize)
  }, [])

  return (
    <div className="min-h-screen flex flex-col">
      <PullToRefresh />
      <main className="flex-1 pb-16">
        <Outlet />
      </main>

      {/* Mobile bottom navigation */}
      <nav className={clsx("md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100 shadow-[0_-1px_8px_rgba(0,0,0,0.06)] transition-transform duration-200", keyboardOpen && "translate-y-full")}>
        <div className="flex items-stretch h-14">

          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              clsx('flex-1 flex flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors',
                isActive ? 'text-blue-700' : 'text-gray-400')
            }
          >
            <Home className="w-5 h-5" />
            <span>Главная</span>
          </NavLink>

          <NavLink
            to="/news"
            className={({ isActive }) =>
              clsx('flex-1 flex flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors',
                isActive ? 'text-blue-700' : 'text-gray-400')
            }
          >
            <Newspaper className="w-5 h-5" />
            <span>Новости</span>
          </NavLink>

          {/* Centre FAB */}
          <div className="flex-1 flex flex-col items-center justify-center -mt-4">
            <button
              onClick={() => isAuthenticated ? navigate('/events/new') : navigate('/login')}
              className="w-12 h-12 rounded-full bg-blue-700 hover:bg-blue-800 active:bg-blue-900 text-white flex items-center justify-center shadow-md transition-colors"
            >
              <Plus className="w-6 h-6" />
            </button>
          </div>

          <NavLink
            to="/chats"
            className={({ isActive }) =>
              clsx('flex-1 flex flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors relative',
                isAuthenticated
                  ? (isActive ? 'text-blue-700' : 'text-gray-400')
                  : 'text-gray-200 pointer-events-none')
            }
            onClick={(e) => { if (!isAuthenticated) { e.preventDefault(); navigate('/login') } }}
          >
            <MessageSquare className="w-5 h-5" />
            <span>Чаты</span>
          </NavLink>

          <NavLink
            to="/profile"
            className={({ isActive }) =>
              clsx('flex-1 flex flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors',
                isAuthenticated
                  ? (isActive ? 'text-blue-700' : 'text-gray-400')
                  : 'text-gray-400')
            }
            onClick={(e) => { if (!isAuthenticated) { e.preventDefault(); navigate('/login') } }}
          >
            {isAuthenticated && user?.avatar_url ? (
              <>
                <img
                  src={user.avatar_url}
                  alt=""
                  className={clsx('w-5 h-5 rounded-full object-cover',
                    location.pathname === '/profile' ? 'ring-2 ring-blue-700' : '')}
                />
                <span>Профиль</span>
              </>
            ) : (
              <>
                <User className="w-5 h-5" />
                <span>Профиль</span>
              </>
            )}
          </NavLink>

        </div>
      </nav>
    </div>
  )
}
