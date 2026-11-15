import { DolphinSwim } from './dolphin-swim.js'
import { Stage } from './scene.js'

export function mountPageDolphin(parent) {
  const stage = new Stage(parent,{background:false})
  const swim = new DolphinSwim()
  let previous = 0
  let time = 0
  let drewStill = false

  new ResizeObserver(() => {
    stage.resize()
    drewStill = false
  }).observe(parent)
  stage.renderer.setAnimationLoop(now => {
    if (document.hidden || !stage.dolphinPoints) return
    const still = stage.stillSky.matches
    if (still && drewStill || now-previous < 32) return
    const dt = Math.min(.05,(now-previous)/1000)
    previous = now
    if (!still) time += dt
    swim.update(stage,null,time,dt,.42)
    stage.draw(still ? 0 : dt,time)
    drewStill = still
  })
}
