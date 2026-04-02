import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Layout from '@/components/layout/Layout'
import { useAuthStore } from '@/stores/authStore'

// Public pages — eagerly loaded for SSR
import HomePage from '@/pages/HomePage'
import NewsPage from '@/pages/NewsPage'
import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'
import PrivacyPolicyPage from '@/pages/PrivacyPolicyPage'
import EventDetailPage from '@/pages/EventDetailPage'

// Private pages — lazy loaded (not crawled, no SSR needed)
const CreateEventPage     = lazy(() => import('@/pages/CreateEventPage'))
const EditEventPage       = lazy(() => import('@/pages/EditEventPage'))
const ProfilePage         = lazy(() => import('@/pages/ProfilePage'))
const ConnectTelegramPage = lazy(() => import('@/pages/ConnectTelegramPage'))
const OrganizerPage       = lazy(() => import('@/pages/OrganizerPage'))
const ChatsPage           = lazy(() => import('@/pages/ChatsPage'))
const ChatPage            = lazy(() => import('@/pages/ChatPage'))
const VlogPage            = lazy(() => import('@/pages/VlogPage'))
const VerificationPage    = lazy(() => import('@/pages/VerificationPage'))

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const hasHydrated = useAuthStore((s) => s._hasHydrated)
  if (!hasHydrated) return null
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
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/telegram/connect" element={
          <PrivateRoute>
            <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100" />}>
              <ConnectTelegramPage />
            </Suspense>
          </PrivateRoute>
        } />
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/news" element={<NewsPage />} />
          <Route path="/tours" element={<Navigate to="/" replace />} />
          <Route path="/events/:id" element={<EventDetailPage />} />
          <Route path="/users/:id" element={<Suspense fallback={null}><OrganizerPage /></Suspense>} />
          <Route path="/events/new" element={
            <Suspense fallback={null}><CreateEventPage /></Suspense>
          } />
          <Route path="/events/:id/edit" element={
            <PrivateRoute>
              <Suspense fallback={null}><EditEventPage /></Suspense>
            </PrivateRoute>
          } />
          <Route path="/profile" element={
            <Suspense fallback={null}><ProfilePage /></Suspense>
          } />
          <Route path="/my-events" element={<Navigate to="/profile" replace />} />
          <Route path="/verification" element={
            <PrivateRoute>
              <Suspense fallback={null}><VerificationPage /></Suspense>
            </PrivateRoute>
          } />
          <Route path="/vlog" element={
            <PrivateRoute>
              <Suspense fallback={null}><VlogPage /></Suspense>
            </PrivateRoute>
          } />
          <Route path="/chats" element={
            <PrivateRoute>
              <Suspense fallback={null}><ChatsPage /></Suspense>
            </PrivateRoute>
          } />
          <Route path="/chats/:chatId" element={
            <PrivateRoute>
              <Suspense fallback={null}><ChatPage /></Suspense>
            </PrivateRoute>
          } />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
