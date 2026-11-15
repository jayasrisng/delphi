import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { localDatabase, cloudDatabase } from './database.mjs'
import { LIMIT, media } from './media.mjs'
import { ACTIONS, LAST_STEP, chooseReply, validChoice } from '../src/duet.js'

const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/
const fail = (status,message) => Object.assign(new Error(message),{status})
const equal = (a,b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a),Buffer.from(b))

async function body(req) {
  const parts = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 8192) throw fail(413,'Request too large.')
    parts.push(chunk)
  }
  try {
    const value = JSON.parse(Buffer.concat(parts))
    if (value && typeof value === 'object' && !Array.isArray(value)) return value
  } catch {}
  throw fail(400,'Invalid request.')
}

function clean(value,max,required = true) {
  const result = typeof value === 'string' ? value.trim() : ''
  if (result.length > max || required && !result || /[\x00-\x08\x0b-\x1f]/.test(result)) throw fail(400,'Check the name, title or comment length.')
  return result
}

export function createAccompaniment(env) {
  const limits = new Map()
  const validStar = star => star && Number.isInteger(star.id) && star.id >= 0 && star.id < 4 &&
    Number.isInteger(star.zone) && star.zone >= 0 && star.zone < 4 &&
    Number.isInteger(star.step) && star.step >= 0 && star.step <= LAST_STEP

  return async function accompany(req, res) {
    const send = (status, value) => res.writeHead(status,{
      'Content-Type':'application/json','Cache-Control':'no-store'
    }).end(JSON.stringify(value))
    try {
      const now = Date.now()
      const address = env.TRUST_PROXY === '1'
        ? String(req.headers['x-forwarded-for'] ?? '').split(',').at(-1).trim()
        : req.socket.remoteAddress
      for (const [key, limit] of limits) if (limit.end <= now) limits.delete(key)
      const limit = limits.get(address) ?? { end:now + 60000, count:0 }
      if (++limit.count > 30) return send(429,{ error:'Too many requests.' })
      limits.set(address,limit)

      const data = await body(req)
      if (data.version !== 1) return send(400,{ error:'Expected duet protocol version 1.' })
      const bounded = (value, low, high, fallback) =>
        Number.isFinite(value) ? Math.max(low,Math.min(high,value)) : fallback
      const events = Array.isArray(data.events) ? data.events.slice(-12)
        .filter(event => validStar(event) && Number.isInteger(event.ms))
        .map(({id,step,zone,ms,gain}) => ({id,step,zone,ms:bounded(ms,0,8000,0),gain:bounded(gain,0,1,.5)})) : []
      const candidates = Array.isArray(data.stars) ? data.stars.slice(0,4).filter(validStar)
        .map(({id,step,zone}) => ({id,step,zone})) : []
      const beatMs = bounded(data.beatMs,200,1200,470)
      const previous = ACTIONS.includes(data.previous) ? { action:data.previous } : undefined
      const fallback = chooseReply(events,candidates,beatMs,previous)
      if (!env.AI_API_KEY || !env.AI_MODEL || !events.length || !candidates.length) return send(200,fallback)
      try {
        const response = await fetch((env.AI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/,'')+'/chat/completions',{
          method:'POST',signal:AbortSignal.timeout(1100),
          headers:{Authorization:'Bearer '+env.AI_API_KEY,'Content-Type':'application/json'},
          body:JSON.stringify({ model:env.AI_MODEL,messages:[
            {role:'system',content:'You are a playful musical dolphin playing a duet. Respond only with a JSON object with action (echo, beat, harmonize or rest) and star (an id from the candidate stars, omitted for rest). Read the player motif, intensity, spacing, and prior action. Echo or harmonize on another instrument, add a drum accent only when a drum candidate is available, or rest to leave space. Vary choices across turns.'},
            {role:'user',content:JSON.stringify({events,candidates,beatMs,looping:!!data.looping,previous})}
          ],response_format:{type:'json_object'} })
        })
        if (response.ok) {
          const result = await response.json()
          const choice = JSON.parse(result.choices[0].message.content)
          const beatStar = candidates.some(star => star.id === choice?.star && star.zone === 1)
          if (validChoice(choice,candidates) && (choice.action !== 'beat' || beatStar)) {
            return send(200,choice.action === 'rest' ? {action:'rest'} : {action:choice.action,star:choice.star})
          }
        }
      } catch {
        // The instrument remains playable on the local clock if the provider is unavailable.
      }
      return send(200,fallback)
    } catch (error) {
      return send(error.status ?? 500,{error:error.status ? error.message : 'Accompaniment is unavailable.'})
    }
  }
}

export function createApi(env) {
  const accompany = createAccompaniment(env)
  const cloudUrl = env.SUPABASE_URL?.replace(/\/$/,'')
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  const workerKey = env.DELPHI_WORKER_KEY
  if (!!cloudUrl !== !!(key || workerKey) || cloudUrl && !env.PUBLISH_SECRET) throw new Error('Set Supabase URL, worker credential and publish secret together.')
  let remote
  if (cloudUrl) remote = async (path,options={}) => {
    const {raw,...request} = options
    const endpoint = workerKey
      ? cloudUrl+'/functions/v1/delphi-storage?resource='+encodeURIComponent(path)
      : cloudUrl+path
    const credentials = workerKey ? {'X-Delphi-Worker':workerKey}
      : {apikey:key,...(!key.startsWith('sb_secret_') ? {Authorization:'Bearer '+key} : {})}
    const response = await fetch(endpoint,{
      ...request,signal:AbortSignal.timeout(90000),
      headers:{'Content-Type':'application/json',...credentials,...request.headers}
    })
    if (!response.ok) throw new Error('Supabase request failed ('+response.status+').')
    if (raw || request.method === 'HEAD') return response
    const result = await response.text()
    return result ? JSON.parse(result) : null
  }
  const root = resolve(env.MEDIA_DATA_DIR || '.data')
  mkdirSync(root,{recursive:true,mode:0o700})
  const db = remote ? cloudDatabase(remote) : localDatabase(resolve(root,'performances.sqlite'))
  const storage = media(root,remote,cloudUrl,{ffmpeg:env.FFMPEG_PATH,ffprobe:env.FFPROBE_PATH,signedTransfers:!!workerKey})
  const secret = env.PUBLISH_SECRET || randomBytes(32)
  const sign = data => createHmac('sha256',secret).update(data).digest('base64url')
  const encode = value => {
    const data = Buffer.from(JSON.stringify(value)).toString('base64url')
    return data+'.'+sign(data)
  }
  const decode = (ticket,browser) => {
    const [data,signature] = String(ticket ?? '').split('.')
    if (!equal(sign(data),signature)) throw fail(403,'Invalid upload authorization.')
    const scope = JSON.parse(Buffer.from(data,'base64url'))
    if (Date.now() > scope.exp || scope.browser !== browser) throw fail(403,'Upload authorization expired. Reopen the preview to retry.')
    return scope
  }
  const limits = new Map()
  const running = new Map()
  const rate = (req,name,max,interval) => {
    const now = Date.now()
    if (limits.size > 1000) for (const [key,value] of limits) if (value.end <= now) limits.delete(key)
    const address = env.TRUST_PROXY === '1' ? String(req.headers['x-forwarded-for'] ?? '').split(',').at(-1).trim() : req.socket.remoteAddress
    const key = name+':'+address
    const current = limits.get(key)
    const entry = current?.end > now ? current : { end:now+interval,count:0 }
    limits.set(key,entry)
    if (++entry.count > max) throw fail(429,'Too many requests. Try again later.')
  }
  const commentView = (item,browser) => ({id:item.id,author:item.author,body:item.body,mine:item.browser===browser})

  async function route(req,res,url) {
    const path = url.pathname.slice(4)
    const method = req.method
    const browser = req.headers['x-browser-id']
    const identity = uuid.test(browser ?? '') ? browser : null
    const requireBrowser = () => { if (!identity) throw fail(400,'A browser ID is required.'); return identity }
    if (method === 'GET' && path === '/performances') {
      const offset = Number(url.searchParams.get('offset') ?? 0)
      if (!Number.isSafeInteger(offset) || offset < 0) throw fail(400,'Invalid gallery offset.')
      const home = url.searchParams.get('view') === 'home'
      const limit = home ? 20 : 8
      const rows = await db.list(limit+1,offset)
      const performances = rows.slice(0,limit)
      if (!home) {
        if (url.searchParams.get('view') !== 'feed') return { performances, nextOffset:rows.length > limit ? offset+limit : null }
        return { performances:await Promise.all(performances.map(async item => {
          const [social, views, commentCount] = await Promise.all([db.likes(item.slug,identity),db.views(item.slug),db.commentCount(item.slug)])
          return { ...item,...social,views,commentCount }
        })),nextOffset:rows.length > limit ? offset+limit : null }
      }

      const rated = await Promise.all(performances.map(async item => ({
        ...item,...await db.likes(item.slug,identity)
      })))
      const popular = rated.filter(item => item.likes > 0).sort((a,b) => b.likes-a.likes)
      const latest = [...rated]
      const mixed = []
      const seen = new Set()
      while (mixed.length < Math.min(8,rated.length)) {
        const queue = mixed.length % 2 && popular.length ? popular : latest
        const item = queue.shift()
        if (seen.has(item.slug)) continue
        seen.add(item.slug)
        mixed.push(item)
      }
      return { performances:await Promise.all(mixed.map(async item => ({
        ...item,commentCount:await db.commentCount(item.slug)
      }))),nextOffset:null }
    }
    if (method === 'POST' && path === '/publish/start') {
      rate(req,'upload',12,3600000)
      const {source, videoBytes:video, audioBytes:audio} = await body(req)
      const valid = n => Number.isSafeInteger(n) && n > 0 && n <= LIMIT
      if (!['studio','spectacles'].includes(source) || !valid(video) || source==='studio' && (!valid(audio) || audio > 10*1024*1024)) throw fail(400,'Invalid video or audio size.')
      const id = randomBytes(12).toString('hex')
      const ticket = encode({ id,source,video,audio,browser:requireBrowser(),exp:Date.now()+3600000 })
      const uploads = {video:await storage.uploadUrl(id,'video',ticket)}
      if (source === 'studio') uploads.audio = await storage.uploadUrl(id,'audio',ticket)
      return {ticket,uploads}
    }
    const ingest = path.match(/^\/ingest\/(video|audio)$/)
    if (method === 'PUT' && ingest && !remote) {
      const token = url.searchParams.get('ticket')
      const [data,signature] = String(token ?? '').split('.')
      if (!equal(sign(data),signature)) throw fail(403,'Invalid upload authorization.')
      const scope = decode(token,JSON.parse(Buffer.from(data,'base64url')).browser)
      const kind = ingest[1]
      if (!scope[kind] || Number(req.headers['content-length']) !== scope[kind]) throw fail(400,'Unexpected upload size.')
      await storage.saveLocal(scope.id,kind,req,scope[kind])
      return {uploaded:true}
    }
    if (method === 'POST' && path === '/publish/finish') {
      rate(req,'finish',24,3600000)
      const {title:rawTitle,creator:rawCreator,ticket} = await body(req)
      const scope = decode(ticket,requireBrowser())
      const title = clean(rawTitle,100,false) || 'Untitled performance'
      const creator = clean(rawCreator,60)
      const slug = 'duet-'+scope.id
      if (!running.has(slug)) {
        running.set(slug,(async () => {
          if (await db.get(slug)) return
          try { await storage.prepare(scope) }
          catch (error) {
            console.warn('Media preparation failed',error.message.slice(0,500))
            throw fail(422,'The media could not be prepared. Check the duration, format and audio track, then try again.')
          }
          await db.publish({slug,title,creator,source:scope.source})
          storage.cleanup(scope.id).catch(error => console.warn('Staging cleanup failed',error.message))
        })().finally(() => running.delete(slug)))
      }
      await running.get(slug)
      return {slug}
    }
    const match = path.match(/^\/performance\/(duet-[a-f0-9]{24})(?:\/(video|audio|thumb|like|view|comments)(?:\/([a-f0-9-]+))?)?$/)
    if (!match) throw fail(404,'Page not found.')
    const [,slug,action,id] = match
    const item = await db.get(slug)
    if (!item) throw fail(404,'This performance is unavailable.')
    if (['video','audio','thumb'].includes(action) && ['GET','HEAD'].includes(method)) {
      await storage.send(req,res,slug,action,url.searchParams.has('download'))
      return
    }
    if (!action && method === 'GET') {
      const [likes,comments,commentCount] = await Promise.all([
        db.likes(slug,identity),db.comments(slug),db.commentCount(slug)
      ])
      return {...item,...likes,commentCount,comments:comments.map(comment => commentView(comment,identity))}
    }
    if (action === 'view' && method === 'POST') {
      rate(req,'view',120,60000)
      await db.addView(slug,requireBrowser())
      return { views:await db.views(slug) }
    }
    if (action === 'like' && method === 'GET') {
      return db.likes(slug,identity || '00000000-0000-0000-0000-000000000000')
    }
    if (action === 'like' && method === 'PUT') {
      rate(req,'like',60,60000)
      const {liked} = await body(req)
      if (typeof liked !== 'boolean') throw fail(400,'Choose whether to like this performance.')
      await db.setLike(slug,requireBrowser(),liked)
      return db.likes(slug,identity)
    }
    if (action === 'comments' && method === 'POST' && !id) {
      rate(req,'comment',4,60000)
      const {name,text,website} = await body(req)
      if (website || /(?:https?:\/\/|www\.)/i.test(text)) throw fail(400,'Comments cannot contain links.')
      const item = {id:randomUUID(),slug,browser:requireBrowser(),author:clean(name,50),body:clean(text,400)}
      await db.comment(item)
      return commentView(item,identity)
    }
    if (action === 'comments' && method === 'DELETE' && uuid.test(id ?? '')) {
      const moderator = env.MODERATION_TOKEN && equal(req.headers.authorization,'Bearer '+env.MODERATION_TOKEN)
      await db.remove(slug,id,moderator ? null : requireBrowser())
      return {removed:true}
    }
    throw fail(405,'Method unavailable.')
  }

  return (req,res,next) => {
    const url = new URL(req.url,'http://localhost')
    if (!url.pathname.startsWith('/api/')) { next(); return }
    res.setHeader('X-Content-Type-Options','nosniff')
    res.setHeader('Cache-Control','no-store')
    if (!['GET','HEAD'].includes(req.method) && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) {
      res.writeHead(403,{'Content-Type':'application/json'}).end(JSON.stringify({error:'Origin is not allowed.'}))
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/accompany') return accompany(req,res)
    route(req,res,url).then(result => {
      if (!res.headersSent) res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(result))
    }).catch(error => {
      if (res.headersSent) { res.destroy(); return }
      if (!error.status) console.error(error)
      res.writeHead(error.status || 500,{'Content-Type':'application/json'}).end(JSON.stringify({error:error.status ? error.message : 'The server could not complete the request.'}))
    })
  }
}
