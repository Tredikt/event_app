import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// Auto-reload on stale chunk after deploy
window.addEventListener('vite:preloadError', () => window.location.reload())
window.addEventListener('unhandledrejection', (e) => {
  const msg = e?.reason?.message ?? ''
  if (msg.includes('Failed to fetch dynamically imported module') || msg.includes('Importing a module script failed')) {
    window.location.reload()
  }
})

const rootElement = document.getElementById('root')!

const app = (
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)

if (rootElement.hasChildNodes()) {
  ReactDOM.hydrateRoot(rootElement, app)
} else {
  ReactDOM.createRoot(rootElement).render(app)
}
