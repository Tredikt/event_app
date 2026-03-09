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

app.use('/uploads', createProxyMiddleware({
  target: BACKEND_URL,
  changeOrigin: true,
  on: { error: (err, req, res) => res.status(502).send('Backend unavailable') },
}))

// Static assets (JS, CSS, etc.)
const clientDist = path.resolve(__dirname, 'dist/client')
app.use('/assets', express.static(path.join(clientDist, 'assets')))
app.use(express.static(clientDist, { index: false }))

// Load SSR render function and HTML template once at startup
const template = fs.readFileSync(path.join(clientDist, 'index.html'), 'utf-8')
const { render } = await import('./dist/server/entry-server.js')

// SSR for all HTML requests
app.get('*', (req, res) => {
  try {
    const appHtml = render(req.originalUrl)
    const html = template.replace('<!--app-html-->', appHtml)
    res.status(200).set('Content-Type', 'text/html').send(html)
  } catch (e) {
    console.error('SSR error:', e)
    // Fallback: send empty template (client will hydrate)
    res.status(200).set('Content-Type', 'text/html').send(template)
  }
})

app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
