export async function loadAtlas() {
  const artworks = ['starry-sky.jpg','constellation-lines.png'].map(async name => {
    const image = new Image()
    image.src = '/brand/'+name
    try { await image.decode(); return image } catch { return null }
  })
  const [sky,lines] = await Promise.all(artworks)
  const basis = sky ?? lines
  if (!basis) return null
  const layer = document.createElement('canvas')
  layer.width = basis.naturalWidth
  layer.height = basis.naturalHeight
  const ctx = layer.getContext('2d')
  if (sky) ctx.drawImage(sky,0,0)
  ctx.globalCompositeOperation = 'screen'
  ctx.globalAlpha = .8
  if (lines) ctx.drawImage(lines,0,0)

  const center = layer.width/2
  const feather = ctx.createRadialGradient(center,center,center*.63,center,center,center)
  feather.addColorStop(0,'#fff')
  feather.addColorStop(1,'#fff0')
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'destination-in'
  ctx.fillStyle = feather
  ctx.fillRect(0,0,layer.width,layer.height)
  return layer
}

export function paintAtlas(ctx, width, height, backdrop) {
  const cx = width*.5
  const cy = height*.49
  const radius = Math.min(width*.39,height*.365)
  const gradient = ctx.createRadialGradient(cx,cy,0,cx,cy,Math.max(width*.46,height*.62))
  gradient.addColorStop(0,'#16235f')
  gradient.addColorStop(.46,'#0b1440')
  gradient.addColorStop(1,'#050a22')
  ctx.fillStyle = gradient
  ctx.fillRect(0,0,width,height)

  if (backdrop) {
    const side = Math.max(height*1.48,width*.93)
    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    ctx.globalAlpha = .76
    ctx.drawImage(backdrop,cx-side/2,cy-side/2,side,side)
    ctx.restore()
  }

  ctx.save()
  ctx.translate(cx,cy)
  ctx.lineWidth = .65
  ctx.strokeStyle = '#c9d3f22e'
  for (const size of [.84,1,1.025,1.17]) {
    ctx.beginPath()
    ctx.arc(0,0,radius*size,0,2*Math.PI)
    ctx.stroke()
  }
  for (let i=0;i<96;i++) {
    const a = i*Math.PI/48
    const tick = i%8 ? 1.10 : 1.06
    ctx.beginPath()
    ctx.moveTo(Math.cos(a)*radius*tick,Math.sin(a)*radius*tick)
    ctx.lineTo(Math.cos(a)*radius*1.145,Math.sin(a)*radius*1.145)
    ctx.stroke()
  }
  ctx.strokeStyle = '#c9d3f21b'
  for (const angle of [-.38,.38]) {
    ctx.beginPath()
    ctx.ellipse(0,0,radius*1.72,radius*.43,angle,0,2*Math.PI)
    ctx.stroke()
  }
  ctx.restore()
}
