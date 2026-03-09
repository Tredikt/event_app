import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:8000'
const PORT = process.env.PORT || 3000

const app = express()

// Proxy API and uploads to FastAPI
app.use('/api', createProxyMiddleware({
  target: BACKEND_URL,
  changeOrigin: true,
  pathRewrite: { '^/api': '' },
  on: { error: (err, req, res) => res.status(502).send('Backend unavailable') },
}))

// /uploads — must keep full path (Express strips prefix, so restore it)
app.use('/uploads', createProxyMiddleware({
  target: BACKEND_URL,
  changeOrigin: true,
  pathRewrite: (path) => '/uploads' + path,
  on: { error: (err, req, res) => res.status(502).send('Backend unavailable') },
}))

// Static assets
const clientDist = path.resolve(__dirname, 'dist/client')
app.use('/assets', express.static(path.join(clientDist, 'assets')))
app.use(express.static(clientDist, { index: false }))

// Load SSR render function and HTML template once at startup
const template = fs.readFileSync(path.join(clientDist, 'index.html'), 'utf-8')
const { render } = await import('./dist/server/entry-server.js')

// Fetch initial data from FastAPI for a given route
async function fetchInitialData(url) {
  const base = BACKEND_URL
  const pathname = url.split('?')[0]

  try {
    if (pathname === '/' || pathname === '') {
      const [eventsRes, catsRes] = await Promise.all([
        fetch(`${base}/events?limit=50`).then(r => r.ok ? r.json() : []),
        fetch(`${base}/events/categories`).then(r => r.ok ? r.json() : []),
      ])
      return { events: eventsRes, categories: catsRes }
    }

    if (pathname === '/news') {
      const news = await fetch(`${base}/news`).then(r => r.ok ? r.json() : [])
      return { news }
    }
  } catch (e) {
    console.error('Failed to fetch initial data:', e.message)
  }

  return {}
}

// SSR for all HTML requests
app.get('*', async (req, res) => {
  try {
    const data = await fetchInitialData(req.originalUrl)
    const appHtml = render(req.originalUrl, data)

    // Inject initial data as JSON for client hydration
    const dataScript = `<script>window.__INITIAL_DATA__=${JSON.stringify(data)}</script>`
    const html = template
      .replace('<!--app-html-->', appHtml)
      .replace('</head>', `${dataScript}</head>`)

    res.status(200).set('Content-Type', 'text/html').send(html)
  } catch (e) {
    console.error('SSR error:', e)
    res.status(200).set('Content-Type', 'text/html').send(template)
  }
})

app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
