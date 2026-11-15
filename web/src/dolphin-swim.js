import { Euler, MathUtils, Quaternion, Vector3 } from 'three'

export class DolphinSwim {
  velocity = new Vector3()
  desiredVelocity = new Vector3()
  aim = new Vector3()
  heading = 0
  pitch = 0
  bank = 0
  orientation = new Quaternion()
  angles = new Euler(0,0,0,'YXZ')

  update(stage, destination, time, dt) {
    const dolphin = stage.dolphin
    const scale = Math.min(.86,stage.aspect*.9)
    dolphin.scale.setScalar(scale)

    if (this.destination !== destination) {
      this.destination = destination
      if (destination) this.approach = stage.point(destination.x,destination.y,.78).x >= dolphin.position.x ? 1 : -1
    }

    const orbit = time * .68
    const leapPhase = (time + 1.1) % 8.6
    const arc = leapPhase > 1.9 ? 0 : Math.sin(Math.PI * leapPhase / 1.9)**2
    if (destination) {
      this.aim.copy(stage.point(destination.x,destination.y,.78))
      this.aim.x -= this.approach * scale * 1.85
    } else {
      const center = stage.point(.5+Math.sin(orbit)*.20,.49+Math.sin(orbit*2)*.044-arc*.20,1.25)
      this.aim.copy(center)
      this.aim.z += Math.cos(orbit)*1.25 + arc*.62
    }

    if (!this.started) {
      dolphin.position.copy(stage.point(.44,.55,1.2))
      this.started = true
    }

    const blend = (rate) => 1-Math.exp(-rate*dt)
    this.desiredVelocity.copy(this.aim).sub(dolphin.position)
      .multiplyScalar(destination ? 4.6 : 3.2)
      .clampLength(0,destination ? 17 : 9)
    this.velocity.lerp(this.desiredVelocity,blend(destination ? 7 : 5))
    dolphin.position.addScaledVector(this.velocity,dt)

    const speed = this.velocity.length()
    const approachBlend = destination ? 1-MathUtils.smoothstep(this.aim.distanceTo(dolphin.position),.12,1.7) : 0
    const horizontal = Math.hypot(this.velocity.x,this.velocity.z)
    const swimming = horizontal > .07 ? Math.atan2(-this.velocity.z,this.velocity.x) : this.heading
    const facing = this.approach === -1 ? Math.PI : 0
    const wanted = swimming + this.angleDelta(swimming,facing)*approachBlend
    const turn = this.angleDelta(this.heading,wanted)
    this.heading += MathUtils.clamp(turn*blend(5.1),-3.7*dt,3.7*dt)
    const pitch = Math.atan2(this.velocity.y,Math.max(.65,horizontal))*(1-approachBlend)
    this.pitch = MathUtils.lerp(this.pitch,MathUtils.clamp(pitch,-.84,.84),blend(5.5))
    this.bank = MathUtils.lerp(this.bank,MathUtils.clamp(-turn*.56,-.66,.66),blend(4))
    this.angles.set(this.bank+Math.sin(time*7.3)*.07,this.heading,this.pitch)
    dolphin.quaternion.slerp(this.orientation.setFromEuler(this.angles),blend(10))
    if (stage.dolphinMixer) stage.dolphinMixer.timeScale = .54 + Math.min(.8,speed*.14)
  }

  angleDelta(from,to) {
    const delta = to-from
    return Math.atan2(Math.sin(delta),Math.cos(delta))
  }
}
