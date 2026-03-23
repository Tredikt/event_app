import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:8000'
const PORT = process.env.PORT || 3000

const app = express()

// Proxy API to FastAPI (HTTP + WebSocket)
const apiProxy = createProxyMiddleware({
  target: BACKEND_URL,
  changeOrigin: true,
  ws: true,
  pathRewrite: { '^/api': '' },
  on: { error: (err, req, res) => { if (res?.status) res.status(502).send('Backend unavailable') } },
})
app.use('/api', apiProxy)

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

    const eventMatch = pathname.match(/^\/events\/(\d+)$/)
    if (eventMatch) {
      const event = await fetch(`${base}/events/${eventMatch[1]}`).then(r => r.ok ? r.json() : null)
      return { event }
    }
  } catch (e) {
    console.error('Failed to fetch initial data:', e.message)
  }

  return {}
}

function buildOgMeta(url, data) {
  const SITE_URL = process.env.SITE_URL || 'https://mvp.gearsofficial.ru'
  const defaultMeta = `
    <meta property="og:site_name" content="Повод" />
    <meta property="og:url" content="${SITE_URL}${url}" />
  `

  if (data.event) {
    const e = data.event
    const image = (e.images && e.images.length > 0 ? e.images[0].image_url : null) || e.image_url || ''
    const desc = e.description ? e.description.slice(0, 200).replace(/"/g, '&quot;') : 'Мероприятие на платформе Повод'
    const title = (e.title || 'Мероприятие').replace(/"/g, '&quot;')
    return `
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${desc}" />
    ${image ? `<meta property="og:image" content="${image}" />` : ''}
    <meta property="og:url" content="${SITE_URL}${url}" />
    <meta property="og:site_name" content="Повод" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${desc}" />
    ${image ? `<meta name="twitter:image" content="${image}" />` : ''}
    `
  }

  return defaultMeta
}

// SSR for all HTML requests
app.get('*', async (req, res) => {
  try {
    const data = await fetchInitialData(req.originalUrl)
    const appHtml = render(req.originalUrl, data)

    // Inject initial data as JSON for client hydration
    const dataScript = `<script>window.__INITIAL_DATA__=${JSON.stringify(data)}</script>`
    const ogMeta = buildOgMeta(req.originalUrl, data)
    const html = template
      .replace('<!--app-html-->', appHtml)
      .replace('</head>', `${ogMeta}${dataScript}</head>`)

    res.status(200).set('Content-Type', 'text/html').send(html)
  } catch (e) {
    console.error('SSR error:', e)
    res.status(200).set('Content-Type', 'text/html').send(template)
  }
})

const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
// Forward WebSocket upgrade requests to backend via apiProxy
server.on('upgrade', apiProxy.upgrade)
