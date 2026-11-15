import { Stage, dispose } from './scene.js'
import { DolphinSwim } from './dolphin-swim.js'
import { availableStars, chooseCue, chooseReply, parseCue, replyNotes, validChoice } from './duet.js'
import { Music, pitch } from './music.js'
import { alternatingCue, instrumentCue, repeatCue, voices, zoneAt } from './satie.js'
import { connectHeadset } from './headset.js'
import { connectVoiceCue } from './voice-cue.js'
import { placeStar } from './star-placement.js'
import { connectStarPractice } from './star-practice.js'

const $ = id => document.getElementById(id)
const seeds = [[.135,.44],[.375,.29],[.625,.52],[.865,.34]]
const colors = [0xb5c9ff,0xada2ff,0xc2ccff,0xd7bdff]
const command = text => text.toLowerCase().replace(/[^a-z ]/g,' ').trim().replace(/ +/g,' ').replace(/\b(?:delfi|delphy|delphie)\b/g,'delphi')
const recordCue = /^(?:hey (?:delphi )?|delphi )?(?:record|record a take|start recording)(?: please)?$/
const thatCue = /^(?:hey (?:delphi )?|delphi )?play (?:this|that)(?: one| star)?(?: please)?$/
const stopCue = /^(?:hey (?:delphi )?|delphi )?(?:stop|stop playing|stop alternating)(?: please)?$/
const stopRecordingCue = /^(?:hey (?:delphi )?|delphi )?(?:stop recording|end (?:the |this )?take)(?: please)?$/
const stopListeningCue = /^(?:hey (?:delphi )?|delphi )?(?:stop listening|turn (?:the )?voice off)(?: please)?$/
const duetCue = /^(?:hey (?:delphi )?|delphi )?play with me(?: please)?$/
const quietCue = /^(?:hey (?:delphi )?|delphi )?(?:play softly|play soft songs|play something soft|play a soft melody)(?: please)?$/
const knownCue = text => {
  const spoken = command(text)
  return thatCue.test(spoken) || recordCue.test(spoken) || stopCue.test(spoken) || stopRecordingCue.test(spoken) ||
    stopListeningCue.test(spoken) || duetCue.test(spoken) || quietCue.test(spoken) || Boolean(alternatingCue(text) || repeatCue(text) || parseCue(text)) ||
    (/^(?:hey|delphi|delfi|play|try|can|could|would|i want)\b/.test(spoken) && instrumentCue(text) != null)
}
const clamp = (n, min, max) => Math.max(min, Math.min(max, n))

export function studio(review) {
  const stage = new Stage($('scene'))
  const swim = new DolphinSwim()
  const canvas = stage.renderer.domElement
  const scene = $('scene')
  const zones = document.createElement('div')
  zones.className = 'instrument-zones'
  zones.setAttribute('aria-label','Instrument zones, from left to right')
  zones.style.setProperty('--zone-count',voices.length)
  voices.forEach(({name},index) => {
    const zone = document.createElement('div')
    zone.className = 'instrument-zone'
    zone.textContent = name
    zone.style.setProperty('--fall-delay',`${-index*2.1}s`)
    zones.append(zone)
  })
  scene.append(zones)
  const sound = new Music()
  const feed = document.createElement('video')
  const cameraFrame = document.createElement('canvas')
  const cameraPixels = cameraFrame.getContext('2d',{alpha:false})
  feed.muted = true
  feed.playsInline = true
  const stars = seeds.map(([x,y], id) => ({
    id, x, y, step: pitch(y), zone: id, gain:.53, pulse:0, object:stage.star(colors[id])
  }))
  const marker = $('practice-marker')
  const chatter = $('delphi-chatter')
  const bubble = $('cue-bubble')
  const bubbleButton = $('pop-cue')
  const greetings = ['Hey, I’m Delphi.', 'Glad you’re here.', 'Let’s play the stars.']
  let greetingIndex = 0, greetingAt = performance.now()+3000
  const quickCues = [
    { title:'Moon Harp', action:'Pop to play', cue:'Play Moon Harp' },
    { title:'Try a loop', action:'Pop to loop', cue:'Play Soft Gong for one second, then Moon Harp' }
  ]
  let quickCueIndex = 0, cueHintAt = Infinity, popUntil = 0

  function advanceQuickCue(now) {
    quickCueIndex++
    cueHintAt = quickCueIndex < quickCues.length ? now+12000 : Infinity
  }
  const practice = connectStarPractice(stars[1])
  const pointers = new Map()
  const links = []
  const preview = stage.edge(true)
  const linkHint = document.createElement('span')
  linkHint.className = 'link-hint'
  linkHint.textContent = 'Release to link'
  linkHint.hidden = true
  scene.append(linkHint)
  let plan, tracker, connections, cameraAttempt = 0, frame = -1, lastSample = 0, active = false
  let lastTime = 0, nextResponse = 0, lastActivity = 0, recent = [], scheduled = []
  let busy = false, recording, activation = 0, mouseDown = false
  let previousReply, contact, requestedCue, contactUntil = 0
  let feedbackTimer, alternate, stopAlternateSound, openingCue, reviewCue, lastPlayedZone, accompanimentGain = 1
  const reviewDialog = $('review')
  let dolphinReactionAt = -Infinity
  const feedback = $('delphi-feedback')
  const reach = () => clamp(canvas.clientWidth*.09,43,72)
  const spacing = () => reach()+20
  const linkReach = () => spacing()+28

  function note(star) {
    star.pulse = 1
    lastPlayedZone = star.zone
    sound.note(star)
    const time = performance.now()
    recent.push({ id:star.id, step:star.step, zone:star.zone, ms:Math.round(time-lastActivity), gain:star.gain })
    recent = recent.slice(-12)
    lastActivity = time
  }

  function closest(x, y, distance, eligible = () => true) {
    const sorted = stars.filter(eligible)
      .map(star => [star, Math.hypot((star.x-x)*canvas.clientWidth,(star.y-y)*canvas.clientHeight)])
      .sort((a,b) => a[1]-b[1])
    return sorted[0]?.[1] < distance ? sorted[0][0] : null
  }

  function linkTarget(star) {
    return closest(star.x,star.y,linkReach(),other => other !== star &&
      !links.some(({a,b}) => a===star && b===other || b===star && a===other))
  }

  function connect(star) {
    const other = linkTarget(star)
    if (!other) return
    const object = stage.edge()
    const spark = stage.sprite(0xcbddff)
    spark.scale.setScalar(.66)
    object.add(spark)
    links.push({ a:star,b:other,object,spark,from:star,pulse:1 })
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
  }

  function release(key, placed) {
    const state = pointers.get(key)
    if (!state) return
    state.voice?.stop()
    if (state.star) {
      practice.release(key,state.star,placed)
      if (placed) connect(state.star)
    }
    state.star = null
    state.voice = null
    if (!placed) {
      state.blocked = state.closed
      state.hover = null
      state.controlHover = null
    }
  }

  function pointer(key, x, y, closed, now, rayOrigin, rayDirection) {
    const state = pointers.get(key) ?? {}
    pointers.set(key,state)
    if (!closed) state.blocked = false
    state.hover = closest(x,y,reach())
    if (closed && !state.closed && !state.blocked && (!state.hover || practice.wantsDolphin())) {
      const origin = rayOrigin ?? stage.camera.position
      const direction = rayDirection ?? stage.point(x,y,.65).sub(origin).normalize()
      if (stage.hitsDolphin(origin,direction)) {
        state.blocked = true
        if (practice.wantsDolphin() || now-dolphinReactionAt >= 2400) {
          dolphinReactionAt = now
          swim.startle(now/1000)
          stage.showDolphinReply(now/1000+2.4)
          practice.touchDolphin()
        }
      }
    }
    if (closed && !state.star && !state.blocked) {
      const target = state.hover
      if (target && ![...pointers.values()].some(other => other.star === target)) {
        state.star = target
        state.offsetX = target.x-x
        state.offsetY = target.y-y
        note(target)
        state.voice = sound.hold(target)
        practice.grab(key,target)
      }
    }
    if (!closed) release(key, true)
    if (state.star) {
      const star = state.star
      const [placedX,placedY] = placeStar(star,x+state.offsetX,y+state.offsetY,
        stars,canvas.clientWidth,canvas.clientHeight,spacing())
      const step = pitch(placedY)
      const speed = Math.hypot(x-(state.x ?? x),y-(state.y ?? y))/Math.max(12,now-(state.now ?? now))
      const zone = zoneAt(placedX,star.zone)
      const changed = step !== star.step || zone !== star.zone
      Object.assign(star,{ x:placedX, y:placedY, step, zone,
        gain:clamp(1-placedY,.12,.86), attack:clamp(.07-speed*30,.008,.07) })
      if (changed) {
        note(star)
        practice.move(key,star)
      }
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
    recordButton.classList.remove('pinch-hover')
    bubbleButton.classList.remove('pinch-hover')
    practice.input('mouse')
    stage.hands.forEach(hand => { hand.visible = false })
    for (const key of pointers.keys()) if (key !== 'mouse') release(key,false)
  }

  async function start(camera) {
    try {
      await sound.unlock()
    } catch {
      openingCue = undefined
      $('status').textContent = 'Sound unavailable'
      return
    }
    if (!active) {
      active = true
      activation++
      $('start').hidden = true
      $('studio').classList.add('playing')
      cueHintAt = performance.now()+10000
      $('record').disabled = false
      $('camera-toggle').hidden = false
      sound.ping(.045)
      if (openingCue) {
        const cue = openingCue
        openingCue = undefined
        cueReply(cue)
      }
    }
    practice.input(camera ? 'opening' : 'mouse')
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
      practice.input('hand')
    } catch {
      if (current !== cameraAttempt) return
      stopCamera()
      practice.input('fallback')
      $('status').textContent = 'Camera unavailable · Mouse ready'
    }
  }

  function track(now) {
    if (!tracker || feed.readyState < 2 || now-lastSample < 37) return
    if (frame === feed.currentTime) {
      if (now-lastSample > 220) {
        stage.hands.forEach(hand => { hand.visible = false })
        recordButton.classList.remove('pinch-hover')
        bubbleButton.classList.remove('pinch-hover')
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
    // The hand cursor is normalized to the stage, while these controls are DOM UI.
    const controlsAvailable = !recording && !document.querySelector('dialog[open]')
    const canvasRect = controlsAvailable && canvas.getBoundingClientRect()
    const recordRect = controlsAvailable && !recordButton.disabled && recordButton.getBoundingClientRect()
    const bubbleRect = controlsAvailable && !bubble.hidden && now >= popUntil && bubbleButton.getBoundingClientRect()
    const hovered = new Set()
    let pressed
    stage.hands.forEach(hand => { hand.visible = false })
    result.landmarks.forEach((landmarks,index) => {
      const key = (result.handedness[index]?.[0]?.categoryName ?? index).toString()
      if (present.has(key)) return
      present.add(key)
      const tip = landmarks[8]
      const points = landmarks.map(({x,y}) => [1-tip.x-(x-tip.x)*scaleX,tip.y+(y-tip.y)*scaleY])
      const distance = (a,b) => Math.hypot((landmarks[a].x-landmarks[b].x)*lensAspect,landmarks[a].y-landmarks[b].y)
      const pinch = distance(4,8)/Math.max(.001,distance(0,9))
      stage.hand(index,points,connections,practice.highlights(stars[1]))
      if (index === 0) {
        stage.parallaxX = points[9][0]-.5
        stage.parallaxY = .5-points[9][1]
      }
      const pinchX = (points[4][0]+points[8][0])*.5
      const pinchY = (points[4][1]+points[8][1])*.5
      const state = pointers.get(key)
      const closed = pinch < (state?.closed ? .53 : .39)
      let control = null
      if (canvasRect) {
        const x = canvasRect.left + points[8][0]*canvasRect.width
        const y = canvasRect.top + points[8][1]*canvasRect.height
        if (bubbleRect?.width && Math.hypot(
          x-(bubbleRect.left+bubbleRect.width/2),y-(bubbleRect.top+bubbleRect.height/2)
        ) <= bubbleRect.width/2+(closed ? 42 : 28)) control = bubbleButton
        else if (recordRect?.width) {
          const marginX = closed ? 21 : 12
          const marginAbove = closed ? 52 : 38
          if (x >= recordRect.left-marginX && x <= recordRect.right+marginX &&
              y >= recordRect.top-marginAbove && y <= recordRect.bottom+18) control = recordButton
        }
      }
      if (closed && control && state?.controlHover === control && !state.closed && !state.star && !state.blocked) {
        // Consume the pinch so the same gesture cannot grab a star underneath.
        Object.assign(state,{closed:true,blocked:true,hover:null,controlHover:null})
        pressed ??= control
        return
      }
      pointer(key,closed ? pinchX : points[8][0],closed ? pinchY : points[8][1],closed,now)
      pointers.get(key).controlHover = closed ? null : control
      if (control && !closed) hovered.add(control)
    })
    for (const key of pointers.keys()) if (key !== 'mouse' && !present.has(key)) release(key,false)
    for (const button of [recordButton,bubbleButton]) {
      button.classList.toggle('pinch-hover',hovered.has(button) && pressed !== button)
    }
    if (pressed === recordButton) beginTake()
    if (pressed === bubbleButton) bubbleButton.click()
  }

  function heldIds() {
    return [...pointers.values()].flatMap(pointer => pointer.star ? [pointer.star.id] : [])
  }

  function phraseBeat(phrase) {
    if (links.length) return sound.beat
    const intervals = phrase.slice(1).map(note => note.ms)
      .filter(ms => ms >= 170 && ms <= 1250).sort((a,b) => a-b)
    return intervals.length ? clamp(intervals[Math.floor(intervals.length/2)]/1000,.26,.95) : sound.beat
  }

  function propose(now) {
    if (feedback.dataset.state === 'opening') return
    if (alternate || requestedCue || !recent.length || now-lastActivity > 4600 || now < nextResponse || busy || plan || scheduled.length) return
    nextResponse = now + 3200
    const phrase = recent.slice(-6)
    const beatMs = Math.round(phraseBeat(phrase)*1000)
    const candidates = availableStars(stars, heldIds(), phrase)
      .map(({ id, step, zone }) => ({ id, step, zone }))
    const generation = activation
    const proposed = { choice:null,phrase,beatMs }
    plan = proposed
    busy = true
    fetch('/api/accompany',{
      method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(1500),
      body:JSON.stringify({ version:1, events:phrase, stars:candidates, beatMs, looping:!!links.length, previous:previousReply?.action })
    }).then(response => response.ok ? response.json() : null).catch(() => null).then(choice => {
      if (generation === activation && plan === proposed) proposed.choice = choice
    }).finally(() => { busy = false })
  }

  function starForInstrument(zone, occupied) {
    const open = stars.filter(star => !occupied.includes(star.id))
    return open.find(star => star.zone === zone) ?? open.find(star => star.id === zone) ?? open[0]
  }

  function accompany(due) {
    if (alternate || scheduled.length || (!requestedCue && !plan)) return
    const occupied = heldIds()
    const voiceZone = requestedCue?.voice
    const target = voiceZone == null ? null : starForInstrument(voiceZone,occupied)
    if (voiceZone != null && !target) return

    const phrase = requestedCue ? recent.slice(-6) : plan.phrase
    // A named sound can be auditioned before the player has played a motif.
    if (target && !phrase.length) phrase.push({ step:target.step,ms:0,gain:.48 })
    const beatMs = requestedCue ? Math.round(phraseBeat(phrase)*1000) : plan.beatMs
    const candidates = target ? [target] : requestedCue
      ? stars.filter(star => !occupied.includes(star.id))
      : availableStars(stars, occupied, recent)
    const reply = target ? { action:'echo',star:target.id } : requestedCue
      ? chooseCue(requestedCue.action, phrase, stars, occupied)
      : validChoice(plan.choice, candidates) ? plan.choice : chooseReply(phrase,candidates,beatMs,previousReply)
    if (!reply) return
    const explicit = Boolean(requestedCue)
    requestedCue = null
    plan = null
    previousReply = reply
    const now = sound.context.currentTime
    const beat = beatMs/1000
    const anchor = !links.length && lastActivity ? now-(performance.now()-lastActivity)/1000 : due
    const lead = now+.62
    const start = anchor + Math.max(0,Math.ceil((lead-anchor)/beat))*beat
    scheduled = replyNotes(reply,phrase,candidates,beatMs).map(({ beat, ...voice }) => ({
      star:stars[voice.id], voice:{...voice,zone:voiceZone ?? voice.zone,gain:voice.gain*accompanimentGain}, explicit, time:start+(beatMs/1000)*beat
    }))
  }
  sound.collaborator = (_, due) => accompany(due + sound.beat)
  let nextBeat = 0
  function setCueStatus(text, state = '', timeout = 0) {
    clearTimeout(feedbackTimer)
    feedback.textContent = text
    feedback.dataset.state = state
    if (timeout) feedbackTimer = setTimeout(() => setCueStatus(''),timeout)
  }

  function stopAlternate() {
    alternate = null
    stopAlternateSound?.()
    stopAlternateSound = undefined
    $('stop-delphi').hidden = true
    scheduled = scheduled.filter(entry => !entry.alternating)
  }

  function scheduleAlternate(time) {
    if (!alternate || scheduled.length) return
    if (alternate.next < time-.1) alternate.next = time+.10
    if (alternate.next > time+.68) return
    const zone = alternate.zones[alternate.index]
    const occupied = heldIds()
    const star = zone == null ? availableStars(stars,occupied,recent)[0] : starForInstrument(zone,occupied)
    if (star) {
      const player = recent.at(-1)
      const step = zone == null && player ? Math.min(10,player.step+2) : star.step
      scheduled.push({ star,voice:{...star,zone:zone ?? star.zone,step,
        gain:.38*accompanimentGain,duration:alternate.duration},
        explicit:true,alternating:true,time:alternate.next })
    }
    alternate.index = (alternate.index+1)%alternate.zones.length
    alternate.next += alternate.interval ?? alternate.duration
  }

  function cueReply(text) {
    const spoken = command(text)
    if (stopListeningCue.test(spoken)) {
      voiceInput.stop()
      openingCue = reviewCue = undefined
      setCueStatus('Voice off.','',1300)
      return
    }
    if (reviewDialog.open) {
      if (!recordCue.test(spoken) && !stopRecordingCue.test(spoken)) {
        reviewCue = text
        const reviewFeedback = $('review-voice-feedback')
        if (reviewFeedback) reviewFeedback.textContent = 'Delphi heard you. Choose Keep playing to hear your cue.'
      }
      return
    }
    if (!active) {
      openingCue = text
      return
    }
    if (recordCue.test(spoken)) {
      setCueStatus('')
      beginTake()
      return
    }
    if (stopRecordingCue.test(spoken)) {
      recording?.stop()
      return
    }
    if (quietCue.test(spoken)) {
      accompanimentGain = .55
      nextResponse = 0
      setCueStatus('Delphi is playing softly.','heard',1700)
      if (alternate) return
      activation++
      plan = null
      scheduled = scheduled.filter(entry => entry.sent)
      requestedCue = recent.length && performance.now()-lastActivity < 4600
        ? { action:'harmonize',voice:null } : { action:'echo',voice:0 }
      return
    }
    if (stopCue.test(spoken)) {
      $('stop-delphi').click()
      return
    }
    const pattern = alternatingCue(text) ?? repeatCue(text)
    if (pattern) {
      stopAlternate()
      activation++
      requestedCue = null
      plan = null
      scheduled = scheduled.filter(entry => entry.sent)
      alternate = { ...pattern,index:0,next:sound.context.currentTime+.65 }
      $('stop-delphi').hidden = false
      const name = pattern.zones.map(zone => voices[zone]?.name ?? 'Harmony').join(' ↔ ')
      setCueStatus(pattern.interval ? `${name} every ${pattern.interval}s.` : name,'heard',2100)
      return
    }
    const that = thatCue.test(spoken)
    const duet = duetCue.test(spoken)
    const voice = that ? lastPlayedZone : duet && !recent.length ? 0 : instrumentCue(text)
    if (that && voice == null) {
      setCueStatus('Play a star first, then say “play that.”','clarify',2500)
      return
    }
    const action = duet ? 'harmonize' : parseCue(text) ?? (voice != null ? 'echo' : null)
    if (!action) {
      activation++
      requestedCue = null
      plan = null
      scheduled = scheduled.filter(entry => entry.sent)
      nextResponse = performance.now() + 3500
      const message = /water gong/.test(spoken) ? 'Soft Gong or Water Glass?' : 'Name a star for Delphi to play.'
      setCueStatus(message,'',3500)
      return
    }
    activation++
    stopAlternate()
    requestedCue = { action,voice }
    plan = null
    scheduled = scheduled.filter(entry => entry.sent)
    nextResponse = performance.now() + 4200
    setCueStatus(voice != null ? `Delphi heard you. ${voices[voice].name} next.`
      : recent.length ? 'Delphi heard you.' : 'Delphi heard you. Play a star.','heard')
  }

  $('stop-delphi').onclick = () => {
    stopAlternate()
    requestedCue = null
    plan = null
    scheduled = scheduled.filter(entry => entry.sent)
    activation++
    nextResponse = Infinity
    setCueStatus('Delphi stopped.','',1400)
  }
  const form = $('delphi-command')
  bubbleButton.onclick = () => {
    const cue = quickCues[quickCueIndex]
    if (!cue || performance.now() < popUntil) return
    const now = performance.now()
    popUntil = now+430
    advanceQuickCue(now)
    cueReply(cue.cue)
  }
  $('star-practice-type').onclick = () => {
    form.hidden = false
    $('delphi-request').focus()
  }
  form.onsubmit = event => {
    event.preventDefault()
    cueReply($('delphi-request').value)
    form.reset()
    form.hidden = true
    if (!$('record-intro').open) $('voice-cue').focus()
  }
  const voiceInput = connectVoiceCue($('voice-cue'),(message,state) => {
    if (state === 'opening') {
      activation++
      plan = null
      scheduled = scheduled.filter(entry => entry.sent || entry.alternating)
    }
    setCueStatus(message,state)
  },text => {
    form.hidden = true
    cueReply(text)
  },message => {
    nextResponse = performance.now()+3500
    setCueStatus(message,'clarify')
    form.hidden = false
    $('delphi-request').focus()
  },knownCue)
  reviewDialog.addEventListener('close',() => {
    if (!reviewCue) return
    const cue = reviewCue
    reviewCue = undefined
    cueReply(cue)
  })
  const headset = connectHeadset(stage, $('enter-vr'), {
    start: async () => {
      voiceInput.start()
      recording?.stop()
      stopCamera()
      for (const key of pointers.keys()) release(key,false)
      pointers.delete('mouse')
      mouseDown = false
      await start(false)
      practice.input('headset')
      $('status').textContent = 'Headset ready · Trigger to grab, grip for drums'
    },
    stop: () => { practice.input('mouse'); $('status').textContent = active ? 'Mouse ready' : '' },
    pointer, release: key => { release(key,false); pointers.delete(key) },
    drums: () => cueReply('play the drums'),
    error: () => { $('status').textContent = 'Could not open VR · Try again from your headset browser' }
  })

  function animate(now, xrFrame) {
    if (xrFrame) headset.update(xrFrame,now)
    if (!active || sound.context.state !== 'running') nextBeat = 0
    if (active && sound.context.state === 'running') {
      if (!xrFrame) track(now)
      propose(now)
      const time = sound.context.currentTime
      scheduleAlternate(time)
      if (nextBeat < time-.1) nextBeat = time+.08
      if (!links.length && nextBeat < time+.10) {
        accompany(nextBeat+sound.beat)
        nextBeat += sound.beat
      }
      const occupied = heldIds()
      scheduled = scheduled.filter(entry => entry.sent || !occupied.includes(entry.star.id))
      for (const entry of scheduled) {
        if (!entry.sent && entry.time < time+.04) {
          const stop = sound.note(entry.voice,Math.max(time,entry.time))
          if (entry.alternating) stopAlternateSound = stop
          entry.sent = true
        }
        if (entry.time <= time) {
          entry.star.pulse = 1
          contact = entry.star
          contactUntil = now + 225
          if (entry.explicit) {
            practice.heardCue()
            if (quickCueIndex === 0 || quickCueIndex === 1 && entry.alternating) advanceQuickCue(now)
          }
          if (feedback.dataset.state !== 'listening' && (entry.explicit || !feedback.textContent)) {
            setCueStatus(`Delphi is playing ${voices[entry.voice.zone].name}.`,'responding',1400)
          }
        }
      }
      scheduled = scheduled.filter(entry => entry.time > time)
      while (sound.beats.length && sound.beats[0].time <= time) {
        const beat = sound.beats.shift()
        beat.star.pulse = 1
        if (beat.link) {
          beat.link.pulse = 1
          beat.link.from = beat.link.a === beat.star ? beat.link.b : beat.link.a
        }
      }
    }

    const dt = Math.min(.05,(now-lastTime)/1000)
    lastTime = now
    const destination = now < contactUntil ? contact : scheduled[0]?.star
    swim.update(stage,destination,now/1000,dt)
    stars.forEach(star => {
      star.pulse = Math.max(0,star.pulse-dt*3)
      star.object.position.copy(stage.point(star.x,star.y,.65))
      const size = .82+star.pulse*.39+Math.sin(now/380+star.id)*.055
      star.object.scale.setScalar(size)
      const target = star.object.userData.target
      const hover = [...pointers.values()].some(pointer => pointer.star === star || pointer.hover === star)
      target.scale.setScalar((hover ? 1 : .76)*reach()*9.675/(Math.max(1,canvas.clientHeight)*size))
      const guiding = practice.highlights(star)
      target.material.opacity = guiding ? .68+Math.sin(now/180)*.25 : destination === star ? .84 : hover ? .56 : 0

    })
    marker.hidden = !active || !practice.highlights(stars[1]) || Boolean(xrFrame)
    if (!marker.hidden) {
      marker.style.left = `${stars[1].x*100}%`
      marker.style.top = `${stars[1].y*100}%`
    }

    const overlaysAvailable = active && !recording && !xrFrame && !reviewDialog.open
    const popping = now < popUntil
    const cue = quickCues[quickCueIndex]
    bubble.hidden = !overlaysAvailable || !popping && (!cue || now < cueHintAt)
    bubble.classList.toggle('popping',popping)
    if (!bubble.hidden && !popping && bubble.dataset.cue !== cue.title) {
      bubble.dataset.cue = cue.title
      $('cue-bubble-title').textContent = cue.title
      $('cue-bubble-action').textContent = cue.action
      $('cue-bubble-command').textContent = `“Hey Delphi, ${cue.cue.toLowerCase()}.”`
    }
    if (!active && now-greetingAt > 3300 && greetingIndex < greetings.length) {
      greetingIndex++
      greetingAt = now+1400
    }
    chatter.hidden = active || greetingIndex >= greetings.length || now < greetingAt ||
      !$('star-practice').hidden || Boolean(document.querySelector('dialog[open]'))
    if (!chatter.hidden && chatter.textContent !== greetings[greetingIndex]) {
      chatter.textContent = greetings[greetingIndex]
    }
    const held = [...pointers.values()].find(item => item.star)?.star
    const neighbor = held && linkTarget(held)
    preview.visible = Boolean(neighbor)
    linkHint.hidden = !neighbor
    if (neighbor) {
      stage.updateEdge(preview,held.object.position,neighbor.object.position,.58)
      linkHint.style.left = `${(held.x+neighbor.x)*50}%`
      linkHint.style.top = `${(held.y+neighbor.y)*50}%`
    }
    links.forEach(link => {
      link.pulse = Math.max(0,link.pulse-dt*3)
      const to = link.from === link.a ? link.b : link.a
      link.spark.visible = link.pulse > 0
      link.spark.position.lerpVectors(link.from.object.position,to.object.position,1-link.pulse)
      link.spark.material.opacity = link.pulse
      stage.updateEdge(link.object,link.a.object.position,link.b.object.position,.20+.61*link.pulse)
    })
    stage.draw(dt,now/1000)
  }

  window.addEventListener('keydown',event => {
    if (event.key === 'Escape' && !event.defaultPrevented && active && !recording &&
        !document.querySelector('dialog[open]') && form.hidden) location.reload()
  })
  $('camera').onclick = () => {
    voiceInput.start()
    start(true)
  }
  $('mouse').onclick = () => { voiceInput.start(); start(false) }
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
    lastPlayedZone = undefined
    sound.clear()
    scheduled = []
    recent = []
    plan = null
    requestedCue = null
    stopAlternate()
    accompanimentGain = 1
    setCueStatus('')
    previousReply = undefined
    contact = undefined
    contactUntil = 0
    nextResponse = 0
    activation++
    links.splice(0).forEach(link => dispose(link.object))
    for (const key of pointers.keys()) release(key,false)
    stars.forEach((star,i) => Object.assign(star,{ x:seeds[i][0],y:seeds[i][1],zone:i,step:pitch(seeds[i][1]),gain:.53,attack:.024,pulse:0 }))
  }

  const instructions = $('record-intro')
  const recordButton = $('record')
  recordButton.onclick = () => {
    if (recording || stage.renderer.xr.isPresenting) return
    instructions.returnValue = ''
    instructions.showModal()
  }
  instructions.onclose = () => {
    if (instructions.returnValue === 'start') beginTake()
  }

  function beginTake() {
    if (recording || stage.renderer.xr.isPresenting || $('review').open) return
    practice.stop()
    recordButton.classList.remove('pinch-hover')
    bubbleButton.classList.remove('pinch-hover')
    setCueStatus('')
    form.hidden = true
    document.body.classList.add('recording-take')
    recordButton.disabled = true
    try {
      recording = record(canvas,sound.capture.stream,(video,audio) => {
        recording = null
        stopAlternate()
        scheduled = []
        requestedCue = null
        plan = null
        recent = []
        activation++
        sound.clear()
        links.splice(0).forEach(link => dispose(link.object))
        for (const key of pointers.keys()) release(key,false)
        setCueStatus('')
        document.body.classList.remove('recording-take')
        recordButton.disabled = false
        if (video && audio) review({ video,audio,source:'studio' })
        else setCueStatus('The take could not be saved.')
      })
    } catch {
      document.body.classList.remove('recording-take')
      recordButton.disabled = false
      setCueStatus('Recording is unavailable.')
    }
  }
  new ResizeObserver(() => stage.resize()).observe($('scene'))
  window.addEventListener('pagehide',() => { voiceInput.stop(); stopCamera() })
  stage.renderer.setAnimationLoop(animate)
  return () => {
    practice.start()
    if (!active) $('camera').focus()
  }
}

function record(canvas, mix, done) {
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
  const deadline = setTimeout(finish,30000)
  try { recorders.forEach(recorder => recorder.start(250)) } catch (error) {
    finish()
    captured.getTracks().forEach(track => track.stop())
    throw error
  }
  return { stop:finish }
}
