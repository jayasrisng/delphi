import './style.css'
import QRCode from 'qrcode'
import { addIcon } from './icons.js'

const $ = id => document.getElementById(id)
const randomId = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 15) | 64
  bytes[8] = (bytes[8] & 63) | 128
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2,'0')).join('')
  return hex.replace(/^(........)(....)(....)(....)/,'$1-$2-$3-$4-')
}
const browserId = localStorage.getItem('celestial-browser') || randomId()
localStorage.setItem('celestial-browser',browserId)
const ext = type => /mp4/i.test(type) ? 'mp4' : /quicktime|\.mov/i.test(type) ? 'mov' : 'webm'

async function api(path, options = {}) {
  const response = await fetch('/api'+path,{ ...options, headers:{
    'X-Browser-Id':browserId,
    ...(options.body && typeof options.body === 'string' ? {'Content-Type':'application/json'} : {}),
    ...options.headers
  } })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'The request failed.')
  return data
}

function node(tag, value, className) {
  const element = document.createElement(tag)
  if (value) element.textContent = value
  if (className) element.className = className
  return element
}

function link(label, href, className) {
  const anchor = node('a',label,className)
  anchor.href = href
  return anchor
}

function player(url, poster) {
  const video = node('video')
  video.src = url
  if (poster) video.poster = poster
  video.controls = true
  video.playsInline = true
  video.preload = 'metadata'
  return video
}

function countPlayback(video, base, update) {
  let pending = false
  function record() {
    if (pending || video.paused || document.hidden || video.currentTime < .5) return
    pending = true
    video.removeEventListener('timeupdate',record)
    api(base+'/view',{method:'POST'}).then(data => update?.(data.views)).catch(() => {})
  }
  video.addEventListener('timeupdate',record)
}

function share(slug) {
  const url = new URL('/p/'+slug,location.origin).href
  const row = node('div','','share')
  row.append(link(url,url),copyLink(slug))
  return row
}

function copyLink(slug, asIcon = false) {
  const button = node('button','Copy link','bare')
  button.type = 'button'
  if (asIcon) addIcon(button,'share','Share performance')
  let reset
  button.onclick = async () => {
    const url = new URL('/p/'+slug,location.origin).href
    try {
      await navigator.clipboard.writeText(url)
      if (asIcon) {
        addIcon(button,'check','Link copied')
        clearTimeout(reset)
        reset = setTimeout(() => addIcon(button,'share','Share performance'),1800)
      } else button.textContent = 'Link copied'
    } catch {
      window.prompt('Copy this performance link',url)
    }
  }
  return button
}

function makeSiteCode() {
  const url = location.protocol === 'https:' ? location.origin : 'https://delphi.jayasrisng.com'
  const domain = new URL(url).hostname
  const target = $('site-share-url')
  target.href = url
  target.textContent = domain
  const {modules} = QRCode.create(url,{errorCorrectionLevel:'H'})
  const size = modules.size
  const unit = 8
  const border = 7
  const canvas = node('canvas')
  canvas.width = canvas.height = (size+border*2)*unit
  canvas.setAttribute('role','img')
  canvas.setAttribute('aria-label','Constellation QR code for '+domain)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#edeaf6'
  ctx.fillRect(0,0,canvas.width,canvas.height)
  ctx.strokeStyle = '#73769c'
  ctx.lineWidth = 1.2
  // The decorative paths stay outside the four-module quiet zone.
  for (const flip of [false,true]) {
    const path = [[8,49],[25,33],[17,17],[46,8],[67,18]]
    const point = ([x,y]) => flip ? [canvas.width-x,canvas.height-y] : [x,y]
    ctx.beginPath()
    path.forEach((xy,i) => i ? ctx.lineTo(...point(xy)) : ctx.moveTo(...point(xy)))
    ctx.stroke()
    ctx.fillStyle = '#403e69'
    path.forEach(xy => {
      const [x,y] = point(xy)
      ctx.beginPath()
      ctx.moveTo(x,y-4)
      ctx.lineTo(x+3,y)
      ctx.lineTo(x,y+4)
      ctx.lineTo(x-3,y)
      ctx.fill()
    })
  }
  ctx.fillStyle = '#111329'
  const finder = (row,col) => row < 9 && (col < 9 || col >= size-8) || row >= size-8 && col < 9
  for (let row=0;row<size;row++) {
    for (let col=0;col<size;col++) {
      if (!modules.get(row,col)) continue
      const x = (col+border)*unit
      const y = (row+border)*unit
      if (finder(row,col) || row === 6 || col === 6) ctx.fillRect(x,y,unit,unit)
      else {
        ctx.beginPath()
        ctx.arc(x+unit/2,y+unit/2,unit*.465,0,Math.PI*2)
        ctx.fill()
      }
    }
  }
  return canvas
}

$('site-code').onclick = () => {
  if (!$('site-constellation').children.length) $('site-constellation').append(makeSiteCode())
  $('site-share').showModal()
}

function detailLinks(slug) {
  const row = node('div','','actions')
  const base = '/api/performance/'+slug
  row.append(link('↓ Audio',base+'/audio?download=1','chip'),link('↓ Video',base+'/video?download=1','chip'))
  return row
}

function showReview({ video,audio,source }) {
  const dialog = $('review')
  const content = $('review-inner')
  const preview = URL.createObjectURL(video)
  const audioUrl = audio && URL.createObjectURL(audio)
  dialog.addEventListener('close',() => {
    content.replaceChildren()
    URL.revokeObjectURL(preview)
    if (audioUrl) URL.revokeObjectURL(audioUrl)
  },{once:true})
  const form = node('form')
  form.innerHTML = `<label class="field">Your name<input name="creator" required maxlength="60" autocomplete="nickname"></label>
    <label class="field">Title <span>(optional)</span><input name="title" maxlength="100"></label>
    <div class="actions"><button class="primary">Publish performance</button><button type="button" id="private">Keep private</button></div>
    <p class="status" role="status"></p>`
  const status = form.querySelector('.status')
  content.replaceChildren(
    node('h2',source === 'studio' ? 'Publish your duet?' : 'Publish this clip?'),
    node('p',source === 'studio'
      ? 'Preview your take. Publishing makes the rendered video and music available to anyone with the link and in the Gallery.'
      : 'Review the footage before sharing. Publishing makes the clip and its extracted audio public in the Gallery.'),
    player(preview),form
  )
  let ticket, publishing = false
  const cancel = event => { if (publishing) event.preventDefault() }
  dialog.addEventListener('cancel',cancel)
  dialog.addEventListener('close',() => dialog.removeEventListener('cancel',cancel),{once:true})
  form.querySelector('#private').onclick = () => {
    const downloads = node('div','','actions')
    const videoLink = link('↓ Download video',preview,'chip')
    videoLink.download = 'performance.'+ext(video.type || video.name || '')
    downloads.append(videoLink)
    if (audioUrl) {
      const audioLink = link('↓ Download audio',audioUrl,'chip')
      audioLink.download = 'performance-audio.'+(ext(audio.type)==='mp4' ? 'm4a' : 'webm')
      downloads.append(audioLink)
    }
    const close = node('button','Done')
    close.onclick = () => dialog.close()
    downloads.append(close)
    form.replaceWith(node('p','This take stays on this device.'),downloads)
  }
  form.onsubmit = async event => {
    event.preventDefault()
    const buttons = [...form.querySelectorAll('button')]
    buttons.forEach(button => { button.disabled = true })
    publishing = true
    try {
      const metadata = Object.fromEntries(new FormData(form))
      if (!ticket) {
        status.textContent = 'Uploading privately…'
        const grant = await api('/publish/start',{method:'POST',body:JSON.stringify({
          source, videoBytes:video.size, audioBytes:audio?.size
        })})
        await Promise.all(Object.entries(grant.uploads).map(async ([key,url]) => {
          const blob = key === 'video' ? video : audio
          const response = await fetch(url,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:blob})
          if (!response.ok) throw new Error('Upload failed. Check your connection and try again.')
        }))
        ticket = grant.ticket
      }
      status.textContent = 'Preparing playback and downloads…'
      const { slug } = await api('/publish/finish',{method:'POST',body:JSON.stringify({ ...metadata,ticket })})
      const close = node('button','Done')
      close.onclick = () => dialog.close()
      content.replaceChildren(node('h2','Your performance is published.'),node('p','Copy the link to share your performance.'),share(slug),close)
    } catch (error) {
      status.textContent = error.message
      buttons.forEach(button => { button.disabled = false })
    } finally {
      publishing = false
    }
  }
  dialog.showModal()
}

function likeButton(base, feedback, initial, asIcon = false, onChange) {
  const button = node('button','','bare feed-like')
  let liked = false
  function update(data) {
    liked = data.liked
    const count = `${data.likes} ${data.likes===1?'like':'likes'}`
    if (asIcon) {
      addIcon(button,'heart',`${liked ? 'Unlike' : 'Like'} performance · ${count}`)
      button.append(node('span',String(data.likes),'action-count'))
    }
    else button.textContent = `${liked?'♥':'♡'} ${count}`
    button.setAttribute('aria-pressed',String(liked))
    button.disabled = false
  }
  if (initial) update(initial)
  else {
    if (asIcon) addIcon(button,'heart','Like performance')
    else button.textContent = '♡ Like'
    button.disabled = true
  }
  button.onclick = async () => {
    button.disabled = true
    feedback.textContent = ''
    try {
      const data = await api(base+'/like',{method:'PUT',body:JSON.stringify({liked:!liked})})
      update(data)
      onChange?.(data)
    }
    catch (error) { feedback.textContent = error.message }
    finally { button.disabled = false }
  }
  return {button,update}
}

function downloadMenu(slug) {
  const container = node('div','','download-control')
  const trigger = addIcon(node('button','','bare'),'download','Download performance')
  trigger.type = 'button'
  const options = node('div','','download-options')
  options.setAttribute('popover','auto')
  trigger.popoverTargetElement = options
  const base = '/api/performance/'+slug
  options.append(link('Download audio',base+'/audio?download=1'),link('Download video',base+'/video?download=1'))
  trigger.addEventListener('click',() => {
    const box = trigger.getBoundingClientRect()
    options.style.right = Math.max(12,innerWidth-box.right)+'px'
    // Open above the action near the bottom of the viewport.
    if (innerHeight-box.bottom < 114) {
      options.style.top = 'auto'
      options.style.bottom = (innerHeight-box.top+6)+'px'
    } else {
      options.style.top = (box.bottom+6)+'px'
      options.style.bottom = 'auto'
    }
  })
  options.addEventListener('click',event => {
    if (event.target.closest('a')) options.hidePopover()
  })
  container.append(trigger,options)
  return container
}

function gallery() {
  const cards = $('cards')
  const buttons = [...document.querySelectorAll('[data-view]')]
  let view, revision = 0, offset = 0, loading = false, currentVideo
  const seen = new Set()
  const activeCards = new Map()
  const reel = node('dialog','','feed-reel')
  const close = node('button','Close','reel-close')
  close.type = 'button'
  close.onclick = () => reel.close()
  reel.setAttribute('aria-label','Performance player')
  reel.append(close)
  document.body.append(reel)
  reel.onclose = () => {
    reel.querySelector('video')?.pause()
    reel.querySelector('.feed-post')?.remove()
  }
  const tail = node('div','','feed-tail')
  tail.setAttribute('role','status')

  const playback = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.intersectionRatio >= .55) activeCards.set(entry.target,entry.intersectionRatio)
      else activeCards.delete(entry.target)
    }
    const best = [...activeCards].sort((a,b) => b[1]-a[1])[0]?.[0]
    const next = best?.querySelector('video')
    if (next === currentVideo) return
    currentVideo?.pause()
    currentVideo = next
    if (next && !matchMedia('(prefers-reduced-motion: reduce)').matches && !document.hidden) {
      next.play().catch(() => {})
    }
  },{ root:cards,threshold:[0,.55,.75,1] })
  const paging = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) load()
  },{root:cards,rootMargin:'0px 0px 280px 0px'})
  document.addEventListener('visibilitychange',() => { if (document.hidden) currentVideo?.pause() })

  function postFor(item, onView, onLike) {
    const base = '/performance/'+item.slug
    const post = node('article','','feed-post')
    const video = player('/api'+base+'/video','/api'+base+'/thumb')
    video.loop = true
    video.muted = true
    video.preload = 'none'
    video.controls = false
    video.setAttribute('aria-label',item.title)
    countPlayback(video,base,onView)
    const toggle = node('button','Play','feed-play')
    toggle.type = 'button'
    const updatePlayback = () => { toggle.textContent = video.paused ? 'Play' : 'Pause' }
    toggle.onclick = async () => {
      if (!video.paused) video.pause()
      else await video.play().catch(() => {})
    }
    video.onplay = () => {
      for (const other of cards.querySelectorAll('video')) if (other !== video && !other.paused) other.pause()
      updatePlayback()
    }
    video.onpause = updatePlayback
    const audio = node('button','Sound off','feed-sound')
    audio.type = 'button'
    audio.setAttribute('aria-pressed','false')
    audio.onclick = () => {
      video.muted = !video.muted
      audio.textContent = video.muted ? 'Sound off' : 'Sound on'
      audio.setAttribute('aria-pressed',String(!video.muted))
      if (!video.muted) video.play().catch(() => {})
    }

    const info = node('div','','feed-body')
    const heading = node('h3')
    heading.append(link(item.title,'/p/'+item.slug))
    const feedback = node('p','','feed-status')
    feedback.setAttribute('role','status')
    info.append(heading,node('p',item.creator),feedback)
    const actions = node('div','','feed-actions')
    const like = likeButton(base,feedback,typeof item.likes === 'number' ? item : null,true,onLike)
    const comments = addIcon(link('','/p/'+item.slug+'#comments','bare'),'comment','Comments')
    actions.append(like.button,comments,copyLink(item.slug,true),downloadMenu(item.slug))
    const controls = node('div','','feed-playback')
    controls.append(toggle,audio)
    post.append(video,info,actions,controls)

    if (typeof item.likes !== 'number') {
      const social = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return
        social.disconnect()
        api(base+'/like').then(like.update).catch(error => { feedback.textContent = error.message })
      },{root:cards})
      social.observe(post)
    }
    if (!onView) playback.observe(post)
    return post
  }

  function tileFor(item) {
    const tile = node('button','','feed-tile')
    tile.type = 'button'
    const image = node('img')
    image.src = '/api/performance/'+item.slug+'/thumb'
    image.alt = ''
    image.loading = 'lazy'
    const title = node('strong',item.title)
    const counts = node('span','','tile-counts')
    const views = node('span')
    const likes = node('span')
    const format = new Intl.NumberFormat(undefined,{notation:'compact'})
    function update() {
      views.textContent = '▷ '+format.format(item.views ?? 0)
      likes.textContent = '♡ '+format.format(item.likes ?? 0)
      tile.setAttribute('aria-label',`Play ${item.title}, ${item.views ?? 0} views, ${item.likes ?? 0} likes`)
    }
    counts.setAttribute('aria-hidden','true')
    counts.append(views,likes)
    const caption = node('span','','tile-caption')
    caption.append(title,counts)
    tile.append(image,caption)
    update()
    tile.onclick = () => {
      const post = postFor(item,views => {
        item.views = views
        update()
      },data => {
        Object.assign(item,data)
        update()
      })
      reel.append(post)
      reel.showModal()
      post.querySelector('video').play().catch(() => {})
    }
    return tile
  }

  async function load() {
    if (loading || offset === null) return
    const request = revision
    loading = true
    paging.unobserve(tail)
    tail.textContent = 'Loading performances…'
    try {
      const data = await api('/performances?view='+view+'&offset='+offset)
      if (request !== revision) return
      for (const item of data.performances) {
        if (seen.has(item.slug)) continue
        seen.add(item.slug)
        cards.insertBefore(view === 'feed' ? tileFor(item) : postFor(item),tail)
      }
      offset = data.nextOffset ?? null
      tail.replaceChildren()
      tail.hidden = offset === null && seen.size > 0
      if (!seen.size) {
        tail.className = 'feed-tail empty'
        tail.append(node('h3',data.publishingReady === false ? 'Online publishing is being set up' : 'No performances yet'),link('Play in Studio','/','chip'))
      }
    } catch (error) {
      if (request !== revision) return
      const retry = node('button','Retry')
      retry.onclick = load
      tail.replaceChildren(node('p',error.message),retry)
      return
    } finally {
      if (request === revision) loading = false
    }
    if (offset !== null) paging.observe(tail)
  }

  function select(next) {
    if (next === view) return
    revision++
    view = next
    cards.classList.toggle('tile-grid',view === 'feed')
    loading = false
    offset = 0
    seen.clear()
    activeCards.clear()
    playback.disconnect()
    paging.disconnect()
    currentVideo?.pause()
    currentVideo = null
    tail.hidden = false
    tail.className = 'feed-tail'
    cards.replaceChildren(tail)
    cards.scrollTop = 0
    for (const button of buttons) button.setAttribute('aria-pressed',String(button.dataset.view === view))
    load()
  }

  for (const button of buttons) button.onclick = () => select(button.dataset.view)
  select('home')
}

async function performance(slug) {
  const detail = node('article','','detail')
  $('performance').append(detail)
  const base = '/performance/'+encodeURIComponent(slug)
  try {
    const data = await api(base)
    document.title = data.title+' · Performance'
    const video = player('/api'+base+'/video','/api'+base+'/thumb')
    countPlayback(video,base)
    detail.append(link('← Gallery','/gallery'),node('h1',data.title),node('p','By '+data.creator),
      video,detailLinks(slug),share(slug))
    const feedback = node('p','','status')
    const {button:heart} = likeButton(base,feedback,data)
    const comments = node('div')
    const form = node('form','','section-break')
    form.id = 'comments'
    form.innerHTML = `<h2>Comments</h2><label class="field">Name<input name="name" maxlength="50" required></label>
      <label class="field">Comment<textarea name="text" rows="3" maxlength="400" required></textarea></label>
      <label class="trap" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
      <div class="actions"><button>Post comment</button></div><p class="status" role="status"></p>`
    const showComment = item => {
      const comment = node('article','','comment')
      comment.append(node('strong',item.author),node('p',item.body))
      if (item.mine) {
        const remove = node('button','Remove')
        remove.onclick = async () => {
          try { await api(base+'/comments/'+item.id,{method:'DELETE'}); comment.remove() }
          catch (error) { feedback.textContent = error.message }
        }
        comment.append(remove)
      }
      comments.prepend(comment)
    }
    data.comments.forEach(showComment)
    form.onsubmit = async event => {
      event.preventDefault()
      const status = form.querySelector('.status')
      const submit = form.querySelector('button')
      submit.disabled = true
      try {
        const item = await api(base+'/comments',{ method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form))) })
        showComment(item)
        form.reset()
        status.textContent = ''
      } catch (error) { status.textContent = error.message }
      finally { submit.disabled = false }
    }
    detail.append(heart,feedback,form,comments)
    if (location.hash === '#comments') form.scrollIntoView()
  } catch (error) {
    detail.append(node('h2','Performance unavailable'),node('p',error.message),link('← Gallery','/gallery'))
  }
}

const slug = location.pathname.match(/^\/p\/([a-z0-9-]+)\/?$/)?.[1]
const page = slug ? 'performance' : ({ '/gallery':'gallery','/upload':'upload' })[location.pathname.replace(/\/$/,'')] ?? 'studio'
document.body.dataset.page = page
$(page).hidden = false
document.querySelector(`[data-page="${slug ? 'gallery' : page}"]`)?.setAttribute('aria-current','page')
if (page === 'studio') {
  import('./studio.js').then(module => module.studio(showReview)).catch(error => {
    $('status').textContent = 'Studio unavailable'
    $('start').hidden = true
    $('hint').textContent = 'The Studio needs a browser with WebGL enabled.'
    console.error(error)
  })
}
if (page === 'gallery') gallery()
if (slug) performance(slug)
if (page === 'upload') $('clip').onchange = event => {
  const video = event.target.files[0]
  event.target.value = ''
  if (!video) return
  if (!/\.(mp4|mov|webm)$/i.test(video.name) || !video.size || video.size > 50_000_000) {
    $('upload-status').textContent = 'Choose an MP4, MOV or WebM video 50 MB or smaller.'
    return
  }
  $('upload-status').textContent = 'Review the clip before publishing.'
  showReview({ video,source:'spectacles' })
}
