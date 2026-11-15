import { createAccompaniment, createApi } from '../server/api.mjs'
import ffmpeg from 'ffmpeg-static'
import ffprobe from 'ffprobe-static'

const configured = Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.DELPHI_WORKER_KEY) && process.env.PUBLISH_SECRET)
const accompany = createAccompaniment({ ...process.env, TRUST_PROXY: '1' })
const api = configured && createApi({
  ...process.env,
  MEDIA_DATA_DIR: '/tmp/delphi-media',
  TRUST_PROXY: '1',
  FFMPEG_PATH: ffmpeg,
  FFPROBE_PATH: ffprobe.path
})

export default function handler(req,res) {
  const url = new URL(req.url,'https://localhost')
  const route = url.searchParams.get('delphi_route')
  if (route) {
    url.searchParams.delete('delphi_route')
    req.url = '/api/'+route+url.search
  }
  const path = new URL(req.url,'https://localhost').pathname
  if (api) {
    api(req,res,() => reply(res,404,{error:'Page not found.'}))
    return
  }
  if (req.method === 'GET' && path === '/api/performances') return reply(res,200,{performances:[],publishingReady:false})
  if (req.method === 'POST' && path === '/api/accompany') return accompany(req,res)
  if (path.startsWith('/api/publish/')) return reply(res,503,{error:'Online publishing is being set up. You can keep this take private and download it.'})
  reply(res,404,{error:'This performance is unavailable.'})
}

function reply(res,status,body) {
  res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(body))
}
