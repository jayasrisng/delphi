import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, open, rename, rm, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const run = promisify(execFile)
export const LIMIT = 50_000_000
const staging = 'performance-staging'
const published = 'performance-media'
const files = { video:['video.mp4','video/mp4'], audio:['audio.m4a','audio/mp4'], thumb:['thumb.jpg','image/jpeg'] }

async function save(stream, path, limit) {
  let size = 0
  await pipeline(stream,new Transform({
    transform(chunk, _, done) {
      size += chunk.length
      done(size > limit ? new Error('Upload exceeds the size limit.') : null,chunk)
    }
  }),createWriteStream(path,{ flags:'wx',mode:0o600 }))
  return size
}

export function media(root, remote, cloudUrl, {ffmpeg = 'ffmpeg',ffprobe = 'ffprobe',signedTransfers = false} = {}) {
  const staged = (id,kind) => join(root,id+'-'+kind+'.raw')
  const cloudObject = (bucket,id,name) => '/storage/v1/object/'+bucket+'/'+id+'/'+name
  async function signDownload(bucket,id,name,expiresIn) {
    const {signedURL} = await remote(cloudObject(bucket,id,name).replace('/object/','/object/sign/'),{
      method:'POST',body:JSON.stringify({expiresIn})
    })
    return cloudUrl+'/storage/v1'+signedURL
  }
  async function signUpload(bucket,id,name,upsert = false) {
    const {url} = await remote(cloudObject(bucket,id,name).replace('/object/','/object/upload/sign/'),{
      method:'POST',body:'{}',headers:upsert ? {'x-upsert':'true'} : {}
    })
    return cloudUrl+'/storage/v1'+url
  }
  async function fetchInput(id, kind, work, bytes) {
    const path = join(work,kind+'.input')
    if (!remote) {
      const source = staged(id,kind)
      if ((await stat(source)).size !== bytes) throw new Error('The upload is incomplete.')
      return source
    }
    const resource = cloudObject(staging,id,kind+'.raw')
    const response = signedTransfers ? await fetch(await signDownload(staging,id,kind+'.raw',180),{signal:AbortSignal.timeout(90000)}) : await remote(resource,{ raw:true })
    if (!response.ok) throw new Error('The uploaded file could not be read.')
    const size = await save(Readable.fromWeb(response.body),path,bytes)
    if (size !== bytes) throw new Error('The upload is incomplete.')
    return path
  }

  async function inspect(path, max, requireVideo) {
    const file = await open(path,'r')
    const header = Buffer.alloc(12)
    try { await file.read(header,0,header.length,0) } finally { await file.close() }
    const format = header.readUInt32BE(0) === 0x1a45dfa3 ? 'matroska'
      : ['ftyp','wide','moov','mdat','free'].includes(header.toString('ascii',4,8)) ? 'mov' : null
    if (!format) throw new Error('Unsupported media container.')
    const {stdout} = await run(ffprobe,['-v','error','-protocol_whitelist','file','-f',format,'-show_format','-show_streams','-of','json',path],{ timeout:10000,maxBuffer:1024*1024 })
    const info = JSON.parse(stdout)
    if (!/^(matroska|mov|mp4|webm)(,|$)/.test(info.format?.format_name ?? '')) throw new Error('Unsupported media container.')
    const video = info.streams.find(stream => stream.codec_type === 'video' && !stream.disposition?.attached_pic)
    const audio = info.streams.find(stream => stream.codec_type === 'audio')
    const duration = Number(info.format.duration)
    // MediaRecorder WebM files may omit container duration. The bounded transcode and output probe enforce it.
    if (!audio || requireVideo && (!video || video.width*video.height > 3840*2160) || Number.isFinite(duration) && duration > max) {
      throw new Error('Choose a video with sound and a supported resolution and duration.')
    }
    return format
  }

  let workers = 0
  return {
    uploadUrl: async (id,kind,ticket) => {
      if (!remote) return '/api/ingest/'+kind+'?ticket='+encodeURIComponent(ticket)
      return signUpload(staging,id,kind+'.raw')
    },
    saveLocal: async (id,kind,stream,bytes) => {
      const target = staged(id,kind)
      const temp = target+'.'+crypto.randomUUID()
      try {
        if (await save(stream,temp,bytes) !== bytes) throw new Error('The upload is incomplete.')
        await rename(temp,target)
      } finally { await rm(temp,{force:true}) }
    },
    prepare: async ({id, source, video:videoBytes, audio:audioBytes}) => {
      if (workers >= 2) throw new Error('The media worker is busy. Try again in a moment.')
      workers++
      let work
      try {
        work = await mkdtemp(join(root,'work-'))
        const video = await fetchInput(id,'video',work,videoBytes)
        const audio = source === 'studio' ? await fetchInput(id,'audio',work,audioBytes) : video
        const limit = source === 'studio' ? 32 : 180
        const videoFormat = await inspect(video,limit,true)
        const audioFormat = source === 'studio' ? await inspect(audio,limit,false) : videoFormat
        const ff = (...args) => run(ffmpeg,['-nostdin','-v','error','-y',...args],{timeout:150000,maxBuffer:1024*1024})
        await ff('-protocol_whitelist','file','-f',videoFormat,'-i',video,'-t',String(limit+1),'-map','0:V:0','-map','0:a:0','-map_metadata','-1','-map_chapters','-1','-vf',
          "scale=w='min(1440,iw)':h=-2:force_divisible_by=2,fps=30,format=yuv420p",'-c:v','libx264','-preset','veryfast','-crf','23','-maxrate','1800k','-bufsize','3600k','-threads','2',
          '-c:a','aac','-movflags','+faststart',join(work,files.video[0]))
        await inspect(join(work,files.video[0]),limit,true)
        await ff('-protocol_whitelist','file','-f',audioFormat,'-i',audio,'-t',String(limit+1),'-map','0:a:0','-map_metadata','-1','-map_chapters','-1','-c:a','aac','-b:a','192k','-movflags','+faststart',join(work,files.audio[0]))
        await inspect(join(work,files.audio[0]),limit,false)
        await ff('-ss','0.1','-i',join(work,files.video[0]),'-frames:v','1','-vf','scale=640:-2','-update','1',join(work,files.thumb[0]))
        if (!remote) await mkdir(join(root,id),{recursive:true,mode:0o700})
        for (const [name,type] of Object.values(files)) {
          const output = join(work,name)
          const info = await stat(output)
          if (!info.size || info.size > LIMIT) throw new Error('The processed media exceeds the size limit.')
          if (remote) {
            const transfer = {
              method:signedTransfers ? 'PUT' : 'POST',body:createReadStream(output),duplex:'half',
              headers:{'Content-Type':type,'Content-Length':String(info.size),'x-upsert':'true'}
            }
            if (signedTransfers) {
              const response = await fetch(await signUpload(published,id,name,true),{ ...transfer,signal:AbortSignal.timeout(90000) })
              if (!response.ok) throw new Error('The prepared file could not be stored ('+response.status+').')
            } else await remote(cloudObject(published,id,name),transfer)

          } else await rename(output,join(root,id,name))
        }
      } finally {
        workers--
        if (work) await rm(work,{recursive:true,force:true})
      }
    },
    cleanup: async (id) => {
      const prefixes = ['video','audio'].map(kind => id+'/'+kind+'.raw')
      if (remote) await remote('/storage/v1/object/'+staging,{method:'DELETE',body:JSON.stringify({prefixes})})
      else await Promise.all(['video','audio'].map(kind => unlink(staged(id,kind)).catch(() => {})))
    },
    send: async (req,res,slug,kind,download) => {
      const id = slug.split('-').at(-1)
      const [name,type] = files[kind]
      if (remote) {
        const href = await signDownload(published,id,name,3600)
        res.writeHead(302,{Location:href+(download?'&download='+name:''),'Cache-Control':'no-store'}).end()
        return
      }
      const path = join(root,id,name)
      const {size} = await stat(path)
      const headers = {'Content-Type':type,'Accept-Ranges':'bytes','Cache-Control':'public, max-age=3600'}
      if (download) headers['Content-Disposition'] = 'attachment; filename="'+name+'"'
      let start = 0, end = size-1
      if (req.headers.range) {
        const range = req.headers.range.match(/^bytes=(\d*)-(\d*)$/)
        if (range) {
          start = range[1] ? Number(range[1]) : Math.max(0,size-Number(range[2]))
          end = range[1] && range[2] ? Math.min(end,Number(range[2])) : end
        }
        if (!range || start > end || start < 0) { res.writeHead(416,{'Content-Range':'bytes */'+size}).end(); return }
        headers['Content-Range'] = `bytes ${start}-${end}/${size}`
      }
      res.writeHead(headers['Content-Range'] ? 206 : 200,{ ...headers,'Content-Length':end-start+1 })
      if (req.method === 'HEAD') res.end()
      else {
        const stream = createReadStream(path,{start,end})
        res.on('close',() => stream.destroy())
        stream.on('error',() => res.destroy())
        stream.pipe(res)
      }
    }
  }
}
