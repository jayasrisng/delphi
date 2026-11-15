import * as T from 'three'

function streakTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 32
  const ctx = canvas.getContext('2d')
  const fine = ctx.createLinearGradient(0,0,240,0)
  fine.addColorStop(0,'#b4c7ff00')
  fine.addColorStop(.65,'#aabfff77')
  fine.addColorStop(1,'#f4f6ff')
  ctx.fillStyle = fine
  ctx.fillRect(0,15,240,2)
  const head = ctx.createRadialGradient(237,16,0,237,16,16)
  head.addColorStop(0,'#fff')
  head.addColorStop(.15,'#cddafff5')
  head.addColorStop(.42,'#adc2ff70')
  head.addColorStop(1,'#9cb8ff00')
  ctx.fillStyle = head
  ctx.fillRect(220,0,34,32)
  const texture = new T.CanvasTexture(canvas)
  texture.colorSpace = T.SRGBColorSpace
  return texture
}

export class ShootingStars {
  constructor(stage) {
    this.stage = stage
    this.motion = matchMedia('(prefers-reduced-motion: reduce)')
    const map = streakTexture()
    this.stars = [
      { x: .19, y: .07, dx: .29, dy: .19, phase: 11.5, period: 15.2, duration: 1.35 },
      { x: .64, y: .20, dx: .32, dy: .23, phase: 7.4, period: 17.6, duration: 1.65 },
      { x: .04, y: .49, dx: .26, dy: .22, phase: 3.4, period: 21.3, duration: 1.5 }
    ].map(route => {
      const sprite = new T.Sprite(new T.SpriteMaterial({
        map, transparent:true, depthWrite:false, blending:T.AdditiveBlending
      }))
      sprite.visible = false
      stage.scene.add(sprite)
      return { ...route, sprite }
    })
  }

  draw(time) {
    const {stage,motion} = this
    this.began ??= time
    for (const { x,y,dx,dy,phase,period,duration,sprite } of this.stars) {
      const progress = ((time-this.began+phase)%period)/duration
      sprite.visible = !motion.matches && progress < 1
      if (!sprite.visible) continue
      const aspect = stage.aspect || 1
      sprite.position.copy(stage.point(x+dx*progress,y+dy*progress,-2))
      sprite.scale.set(Math.min(2.6,aspect*1.65),.19,1)
      sprite.material.rotation = -Math.atan2(dy,dx*aspect)
      sprite.material.opacity = Math.min(1,progress*8,(1-progress)*4)*.83
    }
  }
}
