import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { createApi } from './api.mjs'

const api = createApi(process.env)
const root = resolve('dist')
const types = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.wasm':'application/wasm','.task':'application/octet-stream','.svg':'image/svg+xml','.glb':'model/gltf-binary','.mp3':'audio/mpeg' }
const server = createServer((req,res) => {
  res.setHeader('X-Content-Type-Options','nosniff')
  res.setHeader('Referrer-Policy','no-referrer')
  res.setHeader('Permissions-Policy','camera=(self), microphone=(self), on-device-speech-recognition=(self)')
  api(req,res,async () => {
    try {
      const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname)
      if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405).end(); return }
      const route = /^(?:\/|\/(?:gallery|upload)\/?|\/p\/[a-z0-9-]+\/?)$/.test(pathname)
      const path = resolve(root,route ? 'index.html' : '.'+pathname)
      if (!path.startsWith(root+sep)) { res.writeHead(404).end(); return }
      const info = await stat(path)
      if (!info.isFile()) { res.writeHead(404).end(); return }
      res.writeHead(200,{
        'Content-Type':types[extname(path)] || 'application/octet-stream',
        'Content-Length':info.size,
        'Cache-Control':pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'
      })
      if (req.method === 'HEAD') res.end()
      else {
        const stream = createReadStream(path)
        stream.on('error',() => res.destroy())
        res.on('close',() => stream.destroy())
        stream.pipe(res)
      }
    } catch { res.writeHead(404).end() }
  })
})
server.listen(Number(process.env.PORT || 4177),process.env.HOST || '127.0.0.1',() => console.log('Performance server listening on '+server.address().port))
