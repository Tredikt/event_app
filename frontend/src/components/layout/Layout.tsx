import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { MapPin, Calendar, User, Plus, LogOut, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import clsx from 'clsx'

export default function Layout() {
  const { isAuthenticated, user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <NavLink to="/" className="flex items-center gap-2 font-bold text-xl text-sky-600">
            <MapPin className="w-6 h-6" />
            Communicate
          </NavLink>

          <nav className="hidden md:flex items-center gap-1">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                clsx('px-4 py-2 rounded-xl text-sm font-medium transition-colors', isActive ? 'bg-sky-50 text-sky-600' : 'text-gray-600 hover:bg-gray-50')
              }
            >
              <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" />Карта</span>
            </NavLink>
            {isAuthenticated && (
              <>
                <NavLink
                  to="/my-events"
                  className={({ isActive }) =>
                    clsx('px-4 py-2 rounded-xl text-sm font-medium transition-colors', isActive ? 'bg-sky-50 text-sky-600' : 'text-gray-600 hover:bg-gray-50')
                  }
                >
                  <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" />Мои события</span>
                </NavLink>
                <button
                  onClick={() => navigate('/events/new')}
                  className="btn-primary text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Создать
                </button>
              </>
            )}
          </nav>

          <div className="hidden md:flex items-center gap-2">
            {isAuthenticated ? (
              <>
                <NavLink to="/profile" className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors">
                  {user?.avatar_url ? (
                    <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center text-sky-600 font-semibold text-sm">
                      {user?.first_name[0]}
                    </div>
                  )}
                  <span className="text-sm font-medium text-gray-700">{user?.first_name}</span>
                </NavLink>
                <button onClick={handleLogout} className="btn-secondary text-sm">
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login" className="btn-secondary text-sm">Войти</NavLink>
                <NavLink to="/register" className="btn-primary text-sm">Регистрация</NavLink>
              </>
            )}
          </div>

          <button className="md:hidden p-2 rounded-lg hover:bg-gray-100" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {menuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white px-4 py-3 flex flex-col gap-2">
            <NavLink to="/" end onClick={() => setMenuOpen(false)} className="flex items-center gap-2 py-2 text-sm font-medium text-gray-700">
              <MapPin className="w-4 h-4" />Карта
            </NavLink>
            {isAuthenticated ? (
              <>
                <NavLink to="/my-events" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 py-2 text-sm font-medium text-gray-700">
                  <Calendar className="w-4 h-4" />Мои события
                </NavLink>
                <NavLink to="/events/new" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 py-2 text-sm font-medium text-sky-600">
                  <Plus className="w-4 h-4" />Создать событие
                </NavLink>
                <NavLink to="/profile" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 py-2 text-sm font-medium text-gray-700">
                  <User className="w-4 h-4" />{user?.first_name} {user?.last_name}
                </NavLink>
                <button onClick={() => { handleLogout(); setMenuOpen(false) }} className="flex items-center gap-2 py-2 text-sm font-medium text-red-500">
                  <LogOut className="w-4 h-4" />Выйти
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login" onClick={() => setMenuOpen(false)} className="py-2 text-sm font-medium text-gray-700">Войти</NavLink>
                <NavLink to="/register" onClick={() => setMenuOpen(false)} className="py-2 text-sm font-medium text-sky-600">Регистрация</NavLink>
              </>
            )}
          </div>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
