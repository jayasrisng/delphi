export function mountCursorTrail() {
  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  const pointer = matchMedia('(any-pointer: fine)')
  if (!pointer.matches) return

  const canvas = document.createElement('canvas')
  canvas.className = 'cursor-trail'
  canvas.setAttribute('aria-hidden','true')
  document.body.append(canvas)
  const context = canvas.getContext('2d')
  if (!context) return
  const sparks = []
  let last, frame = 0

  function resize() {
    const ratio = Math.min(devicePixelRatio,2)
    canvas.width = Math.round(innerWidth*ratio)
    canvas.height = Math.round(innerHeight*ratio)
    context.setTransform(ratio,0,0,ratio,0,0)
  }

  function draw(now) {
    context.clearRect(0,0,innerWidth,innerHeight)
    while (sparks.length && now - sparks[0].time > 660) sparks.shift()
    for (const point of sparks) {
      const age = Math.max(0,(now-point.time)/660)
      const x = point.x + point.dx*age
      const y = point.y + point.dy*age
      const alpha = (1-age)**1.9
      context.fillStyle = `rgba(213,224,255,${alpha*.92})`
      context.shadowColor = '#969dff'
      context.shadowBlur = 8
      context.beginPath()
      context.arc(x,y,point.radius,0,Math.PI*2)
      context.fill()
      if (point.radius > 1.25) {
        context.fillRect(x-2.5,y-.25,5,.5)
        context.fillRect(x-.25,y-2.5,.5,5)
      }
    }
    frame = sparks.length ? requestAnimationFrame(draw) : 0
  }

  function reset() {
    last = undefined
    sparks.length = 0
    cancelAnimationFrame(frame)
    frame = 0
    context.clearRect(0,0,innerWidth,innerHeight)
  }

  window.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || motion.matches) return
    const {clientX:x,clientY:y} = event
    const now = performance.now()
    if (!last || now-last.time > 180) last = {x,y,time:now}
    const distance = Math.hypot(x-last.x,y-last.y)
    if (distance < 4) return
    const count = Math.min(9,Math.ceil(distance/9))
    for (let i=1;i<=count;i++) {
      const t = i/count
      sparks.push({
        x:last.x+(x-last.x)*t+(Math.random()-.5)*4,
        y:last.y+(y-last.y)*t+(Math.random()-.5)*4,
        dx:(Math.random()-.5)*17,dy:(Math.random()-.5)*17,
        radius:Math.random() < .17 ? 1.45 : .48+Math.random()*.48,time:now
      })
    }
    if (sparks.length > 140) sparks.splice(0,sparks.length-140)
    last = {x,y,time:now}
    if (!frame) frame = requestAnimationFrame(draw)
  },{passive:true})
  motion.addEventListener('change',reset)
  window.addEventListener('blur',reset)
  window.addEventListener('resize',resize)
  resize()
}
