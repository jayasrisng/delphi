import { Stage, dispose } from './scene.js'
import { DolphinSwim } from './dolphin-swim.js'
import { availableStars, chooseCue, chooseReply, parseCue, replyNotes, validChoice } from './duet.js'
import { Music, pitch } from './music.js'
import { connectHeadset } from './headset.js'
import { connectVoiceCue } from './voice-cue.js'
import { placeStar } from './star-placement.js'

const $ = id => document.getElementById(id)
const seeds = [[.135,.44],[.375,.29],[.625,.52],[.865,.34]]
const colors = [0xb5c9ff,0xada2ff,0xc2ccff,0xd7bdff]
const clamp = (n, min, max) => Math.max(min, Math.min(max, n))

export function studio(review) {
  const stage = new Stage($('scene'))
  const swim = new DolphinSwim()
  const canvas = stage.renderer.domElement
  const sound = new Music()
  const feed = document.createElement('video')
  const cameraFrame = document.createElement('canvas')
  const cameraPixels = cameraFrame.getContext('2d',{alpha:false})
  feed.muted = true
  feed.playsInline = true
  const stars = seeds.map(([x,y], id) => ({
    id, x, y, step: pitch(y), zone: id, gain:.53, pulse:0, object:stage.star(colors[id])
  }))
  const pointers = new Map()
  const links = []
  const cue = stage.edge()
  const preview = stage.edge()
  let plan, tracker, connections, cameraAttempt = 0, frame = -1, lastSample = 0, active = false
  let lastTime = 0, nextResponse = 0, lastActivity = 0, shownAction = '', recent = [], scheduled = []
  let busy = false, recording, activation = 0, mouseDown = false
  let previousReply, contact, requestedCue, contactUntil = 0
  const reach = () => clamp(canvas.clientWidth*.09,43,72)
  const spacing = () => reach()+20
  const linkReach = () => spacing()+28

  function note(star) {
    star.pulse = 1
    sound.note(star)
    const time = performance.now()
    recent.push({ id:star.id, step:star.step, zone:star.zone, ms:Math.round(time-lastActivity), gain:star.gain })
    recent = recent.slice(-12)
    lastActivity = time
  }

  function closest(x, y, distance, exclude) {
    const sorted = stars.filter(star => star !== exclude)
      .map(star => [star, Math.hypot((star.x-x)*canvas.clientWidth,(star.y-y)*canvas.clientHeight)])
      .sort((a,b) => a[1]-b[1])
    return sorted[0][1] < distance ? sorted[0][0] : null
  }

  function connect(star) {
    const other = closest(star.x, star.y, linkReach(), star)
    if (!other || links.some(({a,b}) => a===star && b===other || a===other && b===star)) return
    links.push({ a:star, b:other, object:stage.edge(), pulse:1 })
    const sequence = []
    const seen = new Set()
    function visit(current) {
      if (seen.has(current)) return
      seen.add(current)
      sequence.push(current)
      for (const {a,b} of links) {
        if (a === current) visit(b)
        if (b === current) visit(a)
      }
    }
    links.forEach(({a}) => visit(a))
    sound.loop(sequence, links)
    $('hint').textContent = 'Phrase looping. Drag a star to retune it.'
  }

  function release(key, placed) {
    const state = pointers.get(key)
    if (!state) return
    state.voice?.stop()
    if (placed && state.star) connect(state.star)
    state.star = null
    state.voice = null
    if (!placed) {
      state.blocked = state.closed
      state.hover = null
    }
  }

  function pointer(key, x, y, closed, now) {
    const state = pointers.get(key) ?? {}
    pointers.set(key,state)
    if (!closed) state.blocked = false
    state.hover = closest(x,y,reach())
    if (closed && !state.star && !state.blocked) {
      const target = state.hover
      if (target && ![...pointers.values()].some(other => other.star === target)) {
        state.star = target
        state.offsetX = target.x-x
        state.offsetY = target.y-y
        note(target)
        state.voice = sound.hold(target)
      }
    }
    if (!closed) release(key, true)
    if (state.star) {
      const star = state.star
      const [placedX,placedY] = placeStar(star,x+state.offsetX,y+state.offsetY,
        stars,canvas.clientWidth,canvas.clientHeight,spacing())
      const step = pitch(placedY)
      const nextZone = Math.floor(placedX*4)
      const speed = Math.hypot(x-(state.x ?? x),y-(state.y ?? y))/Math.max(12,now-(state.now ?? now))
      const changed = step !== star.step || nextZone !== star.zone
      Object.assign(star,{ x:placedX, y:placedY, step, zone:nextZone,
        gain:clamp(1-placedY,.12,.86), attack:clamp(.07-speed*30,.008,.07) })
      if (changed) note(star)
      state.voice.update(star)
    }
    Object.assign(state,{x,y,now,closed})
  }

  function mouse(event) {
    if (!active || stage.renderer.xr.isPresenting) return
    const rect = canvas.getBoundingClientRect()
    const x = (event.clientX-rect.left)/rect.width
    const y = (event.clientY-rect.top)/rect.height
    stage.parallaxX = x-.5
    stage.parallaxY = .5-y
    pointer('mouse',x,y,mouseDown,performance.now())
  }
  canvas.addEventListener('pointerdown', event => {
    if (!active || stage.renderer.xr.isPresenting || event.button !== 0) return
    canvas.setPointerCapture(event.pointerId)
    mouseDown = true
    mouse(event)
  })
  canvas.addEventListener('pointermove', mouse)
  canvas.addEventListener('pointerleave', () => { if (!mouseDown) pointers.delete('mouse') })
  canvas.addEventListener('pointerup', event => { mouseDown = false; mouse(event) })
  canvas.addEventListener('pointercancel', () => { mouseDown = false; release('mouse',false); pointers.delete('mouse') })
  window.addEventListener('blur', () => {
    mouseDown = false
    for (const key of pointers.keys()) release(key,false)
    pointers.delete('mouse')
  })

  function stopCamera() {
    cameraAttempt++
    $('camera-toggle').textContent = 'Camera off'
    $('camera-toggle').setAttribute('aria-pressed','false')
    feed.srcObject?.getTracks().forEach(track => track.stop())
    feed.srcObject = null
    tracker?.close()
    tracker = null
    stage.hands.forEach(hand => { hand.visible = false })
    for (const key of pointers.keys()) if (key !== 'mouse') release(key,false)
  }

  async function start(camera) {
    try {
      await sound.unlock()
    } catch {
      $('status').textContent = 'Sound unavailable'
      return
    }
    if (!active) {
      active = true
      activation++
      $('start').hidden = true
      $('studio').classList.add('playing')
      $('record').disabled = false
      $('camera-toggle').hidden = false
      $('delphi-command').hidden = false
      stage.openPortal(.51,.41)
      stars.forEach(star => stage.ring(star.x,star.y,colors[star.id]))
      sound.ping(.045)
    }
    $('status').textContent = camera ? 'Opening camera' : 'Mouse ready'
    if (!camera) return
    const current = ++cameraAttempt
    $('camera-toggle').textContent = 'Camera connecting'
    $('camera-toggle').setAttribute('aria-pressed','true')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'user', width:{ideal:640}, height:{ideal:480} }, audio:false })
      if (current !== cameraAttempt) { stream.getTracks().forEach(track => track.stop()); return }
      feed.srcObject = stream
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        if (current === cameraAttempt) {
          stopCamera()
          $('status').textContent = 'Camera disconnected'
        }
      })
      await feed.play()
      const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision')
      const files = await FilesetResolver.forVisionTasks('/wasm')
      const landmarker = await HandLandmarker.createFromOptions(files,{
        baseOptions:{ modelAssetPath:'/models/hand_landmarker.task', delegate:'CPU' },
        runningMode:'VIDEO', numHands:2,
        minHandDetectionConfidence:.55, minTrackingConfidence:.55
      })
      if (current !== cameraAttempt) { landmarker.close(); return }
      tracker = landmarker
      connections = HandLandmarker.HAND_CONNECTIONS
      $('status').textContent = 'Hand tracking on'
      $('camera-toggle').textContent = 'Camera on'
    } catch {
      if (current !== cameraAttempt) return
      stopCamera()
      $('status').textContent = 'Camera unavailable · Mouse ready'
    }
  }

  function track(now) {
    if (!tracker || feed.readyState < 2 || now-lastSample < 37) return
    if (frame === feed.currentTime) {
      if (now-lastSample > 220) {
            stage.hands.forEach(hand => { hand.visible = false })
        for (const key of pointers.keys()) if (key !== 'mouse') release(key,false)
      }
      return
    }
    frame = feed.currentTime
    lastSample = now
    let result
    try {
      const width = Math.min(feed.videoWidth,640)
      const height = Math.round(width*feed.videoHeight/feed.videoWidth)
      if (cameraFrame.width !== width || cameraFrame.height !== height) {
        cameraFrame.width = width
        cameraFrame.height = height
      }
      cameraPixels.drawImage(feed,0,0,width,height)
      result = tracker.detectForVideo(cameraFrame,now)
    } catch {
      stopCamera()
      $('status').textContent = 'Hand tracking unavailable'
      return
    }
    const lensAspect = cameraFrame.width/cameraFrame.height
    const scaleX = Math.min(1,lensAspect/stage.aspect)
    const scaleY = Math.min(1,stage.aspect/lensAspect)
    const present = new Set()
    stage.hands.forEach(hand => { hand.visible = false })
    result.landmarks.forEach((landmarks,index) => {
      const key = (result.handedness[index]?.[0]?.categoryName ?? index).toString()
      if (present.has(key)) return
      present.add(key)
      const tip = landmarks[8]
      const points = landmarks.map(({x,y}) => [1-tip.x-(x-tip.x)*scaleX,tip.y+(y-tip.y)*scaleY])
      const distance = (a,b) => Math.hypot((landmarks[a].x-landmarks[b].x)*lensAspect,landmarks[a].y-landmarks[b].y)
      const pinch = distance(4,8)/Math.max(.001,distance(0,9))
      stage.hand(index,points,connections)
      if (index === 0) {
        stage.parallaxX = points[9][0]-.5
        stage.parallaxY = .5-points[9][1]
      }
      const pinchX = (points[4][0]+points[8][0])*.5
      const pinchY = (points[4][1]+points[8][1])*.5
      const closed = pinch < (pointers.get(key)?.closed ? .53 : .39)
      pointer(key,closed ? pinchX : points[8][0],closed ? pinchY : points[8][1],closed,now)
    })
    for (const key of pointers.keys()) if (key !== 'mouse' && !present.has(key)) release(key,false)
  }

  function heldIds() {
    return [...pointers.values()].flatMap(pointer => pointer.star ? [pointer.star.id] : [])
  }

  function propose(now) {
    if (requestedCue || !recent.length || now-lastActivity > 4600 || now < nextResponse || busy || plan || scheduled.length) return
    nextResponse = now + 3200
    const phrase = recent.slice(-6)
    const beatMs = Math.round(sound.beat * 1000)
    const candidates = availableStars(stars, heldIds(), phrase)
      .map(({ id, step, zone }) => ({ id, step, zone }))
    const generation = activation
    busy = true
    fetch('/api/accompany',{
      method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(1500),
      body:JSON.stringify({ version:1, events:phrase, stars:candidates, beatMs, looping:!!links.length, previous:previousReply?.action })
    }).then(response => response.ok ? response.json() : null).catch(() => null).then(choice => {
      if (!requestedCue && !scheduled.length && generation === activation && performance.now()-lastActivity < 4600) plan = { choice, phrase, beatMs }
    }).finally(() => { busy = false })
  }

  function accompany(due) {
    if (scheduled.length || (!requestedCue && !plan)) return
    const phrase = requestedCue ? recent.slice(-6) : plan.phrase
    const beatMs = requestedCue ? Math.round(sound.beat*1000) : plan.beatMs
    const occupied = heldIds()
    const candidates = requestedCue ? stars.filter(star => !occupied.includes(star.id)) : availableStars(stars, occupied, recent)
    const reply = requestedCue
      ? chooseCue(requestedCue, phrase, stars, occupied)
      : validChoice(plan.choice, candidates) ? plan.choice : chooseReply(phrase,candidates,beatMs,previousReply)
    if (!reply) return
    if (requestedCue) {
      $('delphi-feedback').textContent = 'Delphi has a reply for the next phrase.'
      requestedCue = null
    }
    plan = null
    previousReply = reply
    shownAction = reply.action
    // Leave a beat-aligned window for Delphi to swim into the reply.
    const lead = sound.context.currentTime+.62
    const start = due + Math.max(0,Math.ceil((lead-due)/sound.beat))*sound.beat
    const notes = replyNotes(reply,phrase,candidates,beatMs)
    scheduled = notes.map(({ beat, ...voice }) => ({ star:stars[voice.id], voice, time:start+sound.beat*beat }))
  }
  sound.collaborator = (_, due) => accompany(due + sound.beat)
  let nextBeat = 0
  const labels = {
    echo:'Delphi is responding to your melody.',
    beat:'Delphi is playing a beat with you.',
    harmonize:'Delphi is playing in harmony.',
    rest:'Delphi is leaving room for your solo.'
  }

  function cueReply(action) {
    if (!action) {
      $('delphi-feedback').textContent = 'Try “play the drums,” “echo me,” or “harmonize.”'
      return
    }
    activation++
    requestedCue = action
    plan = null
    nextResponse = performance.now() + 3200
    $('delphi-feedback').textContent = recent.length
      ? 'Delphi is getting a reply ready.'
      : 'Play a star so Delphi can join you.'
  }
  $('delphi-command').onsubmit = event => {
    event.preventDefault()
    cueReply(parseCue($('delphi-request').value))
  }
  $('drum-cue').onclick = () => cueReply('beat')
  const stopVoice = connectVoiceCue($('voice-cue'), $('delphi-feedback'), text => cueReply(parseCue(text)))
  const headset = connectHeadset(stage, $('enter-vr'), {
    start: async () => {
      stopVoice()
      recording?.stop()
      stopCamera()
      for (const key of pointers.keys()) release(key,false)
      pointers.delete('mouse')
      mouseDown = false
      await start(false)
      $('status').textContent = 'Headset ready · Trigger to grab, grip for drums'
    },
    stop: () => { $('status').textContent = active ? 'Mouse ready' : 'Studio ready' },
    pointer, release: key => { release(key,false); pointers.delete(key) },
    drums: () => cueReply('beat'),
    error: () => { $('status').textContent = 'Could not open VR · Try again from your headset browser' }
  })

  function animate(now, xrFrame) {
    if (xrFrame) headset.update(xrFrame,now)
    if (!active || sound.context.state !== 'running') nextBeat = 0
    if (active && sound.context.state === 'running') {
      if (!xrFrame) track(now)
      propose(now)
      const time = sound.context.currentTime
      if (nextBeat < time-.1) nextBeat = time+.08
      if (!links.length && nextBeat < time+.10) {
        accompany(nextBeat+sound.beat)
        nextBeat += sound.beat
      }
      const occupied = heldIds()
      scheduled = scheduled.filter(entry => entry.sent || !occupied.includes(entry.star.id))
      for (const entry of scheduled) {
        if (!entry.sent && entry.time < time+.04) {
          sound.note(entry.voice,Math.max(time,entry.time))
          entry.sent = true
        }
        if (entry.time <= time) {
          entry.star.pulse = 1
          stage.ring(entry.star.x,entry.star.y)
          contact = entry.star
          contactUntil = now + 225
        }
      }
      scheduled = scheduled.filter(entry => entry.time > time)
      while (sound.beats.length && sound.beats[0].time <= time) {
        const beat = sound.beats.shift()
        beat.star.pulse = 1
        if (beat.link) beat.link.pulse = 1
      }
      const replying = scheduled.length > 0 || now < contactUntil
      const caption = replying ? labels[shownAction] : requestedCue ? 'Delphi is waiting to join in.' : 'Delphi is listening.'
      const partner = $('partner')
      if (partner.textContent !== caption) partner.textContent = caption
      partner.classList.toggle('responding',replying)
    }

    const dt = Math.min(.05,(now-lastTime)/1000)
    lastTime = now
    const destination = now < contactUntil ? contact : scheduled[0]?.star
    const dolphin = stage.dolphin
    swim.update(stage,destination,now/1000,dt)
    stars.forEach(star => {
      star.pulse = Math.max(0,star.pulse-dt*3)
      star.object.position.copy(stage.point(star.x,star.y,.65))
      const size = .82+star.pulse*.39+Math.sin(now/380+star.id)*.055
      star.object.scale.setScalar(size)
      const target = star.object.userData.target
      const hover = [...pointers.values()].some(pointer => pointer.star === star || pointer.hover === star)
      target.scale.setScalar((hover ? 1 : .76)*reach()*9.675/(Math.max(1,canvas.clientHeight)*size))
      target.material.opacity = hover ? .78 : .24
    })
    cue.visible = !!destination
    if (destination) stage.updateEdge(cue,dolphin.position,destination.object.position,.53+Math.sin(now/85)*.22)
    const held = [...pointers.values()].find(item => item.star)?.star
    const neighbor = held && closest(held.x,held.y,linkReach(),held)
    preview.visible = !!neighbor
    if (neighbor) stage.updateEdge(preview,held.object.position,neighbor.object.position,.44)
    links.forEach(link => {
      link.pulse = Math.max(0,link.pulse-dt*3)
      stage.updateEdge(link.object,link.a.object.position,link.b.object.position,.36+.64*link.pulse)
    })
    stage.draw(dt,now/1000)
  }

  const expand = $('expand-studio')
  expand.onclick = () => {
    const immersive = $('studio').classList.toggle('immersive')
    expand.textContent = immersive ? 'Show controls' : 'Hide controls'
    expand.setAttribute('aria-pressed',String(immersive))
  }
  window.addEventListener('keydown',event => {
    if (event.key === 'Escape' && !$('review').open && $('studio').classList.contains('immersive')) expand.click()
  })
  $('camera').onclick = () => start(true)
  $('mouse').onclick = () => start(false)
  $('camera-toggle').onclick = () => {
    if ($('camera-toggle').getAttribute('aria-pressed') !== 'true') { start(true); return }
    stopCamera()
    $('status').textContent = 'Mouse ready'
  }
  $('sound').onclick = () => {
    const muted = sound.mute()
    $('sound').textContent = muted ? 'Sound off' : 'Sound on'
    $('sound').setAttribute('aria-pressed',String(muted))
  }
  $('clear').onclick = () => {
    stopVoice()
    sound.clear()
    scheduled = []
    recent = []
    plan = null
    shownAction = ''
    requestedCue = null
    $('delphi-feedback').textContent = ''
    previousReply = undefined
    contact = undefined
    contactUntil = 0
    nextResponse = 0
    activation++
    links.splice(0).forEach(link => dispose(link.object))
    for (const key of pointers.keys()) release(key,false)
    stars.forEach((star,i) => Object.assign(star,{ x:seeds[i][0],y:seeds[i][1],zone:i,step:pitch(seeds[i][1]),gain:.53,attack:.024,pulse:0 }))
    $('hint').textContent = 'Pinch or drag a star. Move it up to raise the pitch.'
  }

  $('record').onclick = () => {
    if (recording) { recording.stop(); return }
    if (stage.renderer.xr.isPresenting) return
    try {
      recording = record(canvas,sound.capture.stream,(video,audio) => {
        recording = null
        $('record-label').textContent = 'Record 30 seconds'
        if (video && audio) review({ video,audio,source:'studio' })
        else $('hint').textContent = 'The recording could not be saved. Try another browser.'
      }, seconds => { $('record-label').textContent = `Stop · 0:${String(seconds).padStart(2,'0')}` })
    } catch {
      $('hint').textContent = 'Recording is unavailable in this browser.'
    }
  }
  new ResizeObserver(() => stage.resize()).observe($('scene'))
  window.addEventListener('pagehide',stopCamera)
  stage.renderer.setAnimationLoop(animate)
}

function record(canvas, mix, done, countdown) {
  const mime = candidates => candidates.find(type => MediaRecorder.isTypeSupported(type))
  const videoType = mime(['video/webm;codecs=vp8,opus','video/mp4','video/webm'])
  const audioType = mime(['audio/webm;codecs=opus','audio/mp4','audio/webm'])
  if (!videoType || !audioType) throw new Error('No supported recording format')
  const captured = canvas.captureStream(30)
  const video = new MediaRecorder(new MediaStream([...captured.getVideoTracks(),...mix.getAudioTracks()]),{ mimeType:videoType,videoBitsPerSecond:3200000 })
  const audio = new MediaRecorder(mix,{ mimeType:audioType })
  const recorders = [video,audio]
  const parts = [[],[]]
  let completed = 0, ended = false, failed = false
  const finish = () => {
    if (ended) return
    ended = true
    clearInterval(clock)
    clearTimeout(deadline)
    recorders.forEach(recorder => { if (recorder.state !== 'inactive') recorder.stop() })
  }
  recorders.forEach((recorder,i) => {
    recorder.ondataavailable = event => { if (event.data.size) parts[i].push(event.data) }
    recorder.onerror = () => { failed = true; finish() }
    recorder.onstop = () => {
      if (++completed !== 2) return
      captured.getTracks().forEach(track => track.stop())
      done(...parts.map((chunks,index) => !failed && chunks.length ? new Blob(chunks,{type:recorders[index].mimeType}) : null))
    }
  })
  const start = performance.now()
  const deadline = setTimeout(finish,30000)
  const clock = setInterval(() => countdown(Math.max(0,Math.ceil((30000-performance.now()+start)/1000))),200)
  try { recorders.forEach(recorder => recorder.start(250)) } catch (error) {
    finish()
    captured.getTracks().forEach(track => track.stop())
    throw error
  }
  countdown(30)
  return { stop:finish }
}
