import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isProduction = process.env.NODE_ENV === 'production'
const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:8000'

const app = express()

// Proxy /api and /uploads to FastAPI
app.use('/api', createProxyMiddleware({
  target: BACKEND_URL,
  changeOrigin: true,
  pathRewrite: { '^/api': '' },
}))

app.use('/uploads', createProxyMiddleware({
  target: BACKEND_URL,
  changeOrigin: true,
}))

if (isProduction) {
  // Serve static assets (JS, CSS, images)
  app.use('/assets', express.static(path.resolve(__dirname, 'dist/client/assets')))
  app.use('/favicon.svg', express.static(path.resolve(__dirname, 'dist/client/favicon.svg')))
  app.use('/apple-touch-icon.png', express.static(path.resolve(__dirname, 'dist/client/apple-touch-icon.png')))

  // SSR for all HTML requests
  app.get('*', async (req, res) => {
    try {
      const template = fs.readFileSync(path.resolve(__dirname, 'dist/client/index.html'), 'utf-8')
      const { render } = await import('./dist/server/entry-server.js')
      const appHtml = render(req.originalUrl)
      const html = template.replace('<!--app-html-->', appHtml)
      res.status(200).set({ 'Content-Type': 'text/html' }).send(html)
    } catch (e) {
      console.error(e)
      res.status(500).send('Internal Server Error')
    }
  })
} else {
  // Dev mode: use Vite dev server
  const { createServer } = await import('vite')
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
  })
  app.use(vite.middlewares)

  app.get('*', async (req, res) => {
    try {
      let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8')
      template = await vite.transformIndexHtml(req.originalUrl, template)
      const { render } = await vite.ssrLoadModule('/src/entry-server.tsx')
      const appHtml = render(req.originalUrl)
      const html = template.replace('<!--app-html-->', appHtml)
      res.status(200).set({ 'Content-Type': 'text/html' }).send(html)
    } catch (e) {
      vite.ssrFixStacktrace(e)
      res.status(500).send(e.message)
    }
  })
}

const port = process.env.PORT || 3000
app.listen(port, () => console.log(`SSR server running on http://localhost:${port}`))
