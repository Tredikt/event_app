import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Layout from '@/components/layout/Layout'
import { useAuthStore } from '@/stores/authStore'

// Eagerly load only the most critical pages
import HomePage from '@/pages/HomePage'
import LoginPage from '@/pages/LoginPage'

// Lazy load everything else
const EventDetailPage    = lazy(() => import('@/pages/EventDetailPage'))
const CreateEventPage    = lazy(() => import('@/pages/CreateEventPage'))
const EditEventPage      = lazy(() => import('@/pages/EditEventPage'))
const ProfilePage        = lazy(() => import('@/pages/ProfilePage'))
const RegisterPage       = lazy(() => import('@/pages/RegisterPage'))
const MyEventsPage       = lazy(() => import('@/pages/MyEventsPage'))
const NewsPage           = lazy(() => import('@/pages/NewsPage'))
const ConnectTelegramPage = lazy(() => import('@/pages/ConnectTelegramPage'))
const PrivacyPolicyPage  = lazy(() => import('@/pages/PrivacyPolicyPage'))

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
      <Suspense fallback={null}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/telegram/connect" element={<PrivateRoute><ConnectTelegramPage /></PrivateRoute>} />
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/news" element={<NewsPage />} />
            <Route path="/tours" element={<Navigate to="/" replace />} />
            <Route path="/events/:id" element={<EventDetailPage />} />
            <Route path="/events/new" element={<PrivateRoute><CreateEventPage /></PrivateRoute>} />
            <Route path="/events/:id/edit" element={<PrivateRoute><EditEventPage /></PrivateRoute>} />
            <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
            <Route path="/my-events" element={<PrivateRoute><MyEventsPage /></PrivateRoute>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  )
}
