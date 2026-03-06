import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Layout from '@/components/layout/Layout'
import HomePage from '@/pages/HomePage'
import EventDetailPage from '@/pages/EventDetailPage'
import CreateEventPage from '@/pages/CreateEventPage'
import EditEventPage from '@/pages/EditEventPage'
import ProfilePage from '@/pages/ProfilePage'
import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'
import MyEventsPage from '@/pages/MyEventsPage'
import ToursPage from '@/pages/ToursPage'
import ConnectTelegramPage from '@/pages/ConnectTelegramPage'
import { useAuthStore } from '@/stores/authStore'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <>
      <Toaster
        position="top-center"
        toastOptions={{
          style: { borderRadius: '12px', fontFamily: 'Inter, sans-serif' },
          duration: 3500,
        }}
      />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/telegram/connect" element={<PrivateRoute><ConnectTelegramPage /></PrivateRoute>} />
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/tours" element={<ToursPage />} />
          <Route path="/events/:id" element={<EventDetailPage />} />
          <Route
            path="/events/new"
            element={<PrivateRoute><CreateEventPage /></PrivateRoute>}
          />
          <Route
            path="/events/:id/edit"
            element={<PrivateRoute><EditEventPage /></PrivateRoute>}
          />
          <Route
            path="/profile"
            element={<PrivateRoute><ProfilePage /></PrivateRoute>}
          />
          <Route
            path="/my-events"
            element={<PrivateRoute><MyEventsPage /></PrivateRoute>}
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
