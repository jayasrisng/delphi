const radians = Math.PI/180
let atlas

export function loadAtlas() {
  atlas ??= fetch('/brand/sky-catalogue.json')
    .then(response => response.ok ? response.json() : [])
    .catch(() => [])
    .then(stars => ({stars}))
  return atlas
}

export function paintAtlas(ctx,width,height,backdrop, offset = 0, time = 0) {
  if (!width || !height) return
  const cx = width*.5
  const cy = height*.5
  const gradient = ctx.createRadialGradient(cx,cy,0,cx,cy,Math.max(width*.58,height*.66))
  gradient.addColorStop(0,'#19254a')
  gradient.addColorStop(.57,'#0e162f')
  gradient.addColorStop(1,'#070a18')
  ctx.fillStyle = gradient
  ctx.fillRect(0,0,width,height)
  if (!backdrop) return

  // An occasional soft ripple under the star positions.
  const elapsed = time % 14 - 8
  if (elapsed > 0 && elapsed < 2.3) {
    const progress = elapsed / 2.3
    const span = Math.min(width,height)
    ctx.save()
    ctx.strokeStyle = '#afc6ff'
    ctx.lineWidth = .75
    for (let ring=0;ring<3;ring++) {
      const size = span*(.08+.19*progress+ring*.037)
      ctx.globalAlpha = Math.sin(Math.PI*progress)*(.13-ring*.023)
      ctx.beginPath()
      ctx.ellipse(width*.62,height*.71,size,size*.23,-.12,0,Math.PI*2)
      ctx.stroke()
    }
    ctx.restore()
  }

  // Orthographic projection of the catalogue, centered near Delphinus.
  ctx.save()
  const radius = Math.max(width*.62,height*.67)
  const declination = 19*radians
  const cosCenter = Math.cos(declination), sinCenter = Math.sin(declination)
  for (const [ra,dec,mag] of backdrop.stars) {
    const longitude = (ra-309-offset)*radians
    const latitude = dec*radians
    const cosLat = Math.cos(latitude), sinLat = Math.sin(latitude)
    const cosLon = Math.cos(longitude)
    if (sinCenter*sinLat+cosCenter*cosLat*cosLon <= 0) continue
    const x = cx-radius*cosLat*Math.sin(longitude)
    const y = cy-radius*(cosCenter*sinLat-sinCenter*cosLat*cosLon)
    if (x < 1 || y < 1 || x >= width-1 || y >= height-1) continue
    const brightness = Math.max(0,5.7-mag)
    const pointSize = 1.04+brightness*.25
    const margin = Math.min(x,width-x,y,height-y)
    ctx.globalAlpha = Math.min(1,margin/(Math.min(width,height)*.035))*Math.min(.98,.43+brightness*.16)
    ctx.fillStyle = mag < 2 ? '#f6f8ff' : '#c3d4ff'
    const px = Math.round(x), py = Math.round(y)
    ctx.fillRect(px,py,pointSize,pointSize)
    if (mag < 2.3) {
      ctx.globalAlpha *= .20
      ctx.beginPath()
      ctx.arc(px+pointSize/2,py+pointSize/2,pointSize*1.6,0,Math.PI*2)
      ctx.fill()
      ctx.globalAlpha *= 1.7
      ctx.fillRect(px-2,py,pointSize+4,.65)
      ctx.fillRect(px,py-2,.65,pointSize+4)
    }
  }
  ctx.restore()
}

export async function mountPageSky() {
  const canvas = document.createElement('canvas')
  canvas.className = 'page-sky'
  canvas.setAttribute('aria-hidden','true')
  document.body.prepend(canvas)
  const ctx = canvas.getContext('2d',{alpha:false})
  if (!ctx) return
  const graphics = await loadAtlas()
  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  function paint() {
    if (canvas.width !== innerWidth || canvas.height !== innerHeight) {
      canvas.width = innerWidth
      canvas.height = innerHeight
    }
    const time = motion.matches ? 0 : performance.now()/1000
    paintAtlas(ctx,canvas.width,canvas.height,graphics,Math.sin(time/28)*5,time)
  }
  paint()
  window.addEventListener('resize',paint)
  motion.addEventListener('change',paint)
  let timer
  function clock() {
    clearInterval(timer)
    if (!document.hidden && !motion.matches) timer = setInterval(paint,120)
  }
  motion.addEventListener('change',clock)
  document.addEventListener('visibilitychange',clock)
  clock()
}
