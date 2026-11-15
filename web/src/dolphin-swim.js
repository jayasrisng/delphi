import { Euler, MathUtils, Quaternion, Vector3 } from 'three'

export class DolphinSwim {
  velocity = new Vector3()
  desiredVelocity = new Vector3()
  aim = new Vector3()
  shore = new Vector3()
  approachAt = 0
  startledAt = -Infinity
  archHeight = 0
  heading = 0
  pitch = 0
  bank = 0
  orientation = new Quaternion()
  angles = new Euler(0,0,0,'YXZ')

  startle(time) { this.startledAt = time }

  update(stage, destination, time, dt, range = .21) {
    const dolphin = stage.dolphin
    const scale = Math.min(.86,stage.aspect*.9)
    dolphin.scale.setScalar(scale)

    if (this.destination !== destination) {
      this.destination = destination
      if (destination) {
        this.shore.copy(stage.point(destination.x,destination.y,.78))
        this.approach = this.shore.x >= dolphin.position.x ? 1 : -1
        this.approachAt = time
        this.archHeight = MathUtils.clamp(this.shore.distanceTo(dolphin.position)*.18,.17,.92)
      }
    }

    const orbit = time * .57
    const leapPhase = (time + 1.1) % 9.4
    const jump = MathUtils.clamp(leapPhase/2.55,0,1)
    const arc = Math.sin(Math.PI * jump)**2
    if (destination) {
      this.shore.copy(stage.point(destination.x,destination.y,.78))
      this.shore.x -= this.approach * scale * 1.85
      this.aim.copy(this.shore)
      const bend = Math.sin(Math.PI * MathUtils.clamp((time-this.approachAt)/.8,0,1))**2
      this.aim.y += bend*this.archHeight
      this.aim.z -= bend*.68
    } else {
      this.aim.copy(stage.point(.5+Math.sin(orbit)*range,.50+Math.sin(orbit*1.67)*.045-arc*.22,1.20))
      this.aim.z += Math.cos(orbit)*1.42 + arc*.70
    }

    if (!this.started) {
      dolphin.position.copy(stage.point(.44,.55,1.2))
      this.started = true
    }

    const blend = (rate) => 1-Math.exp(-rate*dt)
    this.desiredVelocity.copy(this.aim).sub(dolphin.position)
      .multiplyScalar(destination ? 4.6 : 3.2)
      .clampLength(0,destination ? 17 : 9)
    this.velocity.lerp(this.desiredVelocity,blend(destination ? 5.7 : 4.2))
    dolphin.position.addScaledVector(this.velocity,dt)

    const speed = this.velocity.length()
    const approachBlend = destination ? 1-MathUtils.smoothstep(this.shore.distanceTo(dolphin.position),.16,1.6) : 0
    const horizontal = Math.hypot(this.velocity.x,this.velocity.z)
    const swimming = horizontal > .07 ? Math.atan2(-this.velocity.z,this.velocity.x) : this.heading
    const facing = this.approach === -1 ? Math.PI : 0
    const wanted = swimming + this.angleDelta(swimming,facing)*approachBlend
    const turn = this.angleDelta(this.heading,wanted)
    this.heading += MathUtils.clamp(turn*blend(4.1),-3.0*dt,3.0*dt)
    const pitch = Math.atan2(this.velocity.y,Math.max(.65,horizontal))*(1-approachBlend)
    this.pitch = MathUtils.lerp(this.pitch,MathUtils.clamp(pitch,-.84,.84),blend(5.5))
    this.bank = MathUtils.lerp(this.bank,MathUtils.clamp(-turn*.65,-.68,.68),blend(4.4))
    const recoil = Math.sin(Math.PI*MathUtils.clamp((time-this.startledAt)/.65,0,1))
    this.angles.set(this.bank+Math.sin(time*5.2)*.055+.33*recoil,this.heading,this.pitch+.43*recoil)
    dolphin.quaternion.slerp(this.orientation.setFromEuler(this.angles),blend(10))
    if (stage.dolphinMixer) stage.dolphinMixer.timeScale = .54 + Math.min(.8,speed*.14)
  }

  angleDelta(from,to) {
    const delta = to-from
    return Math.atan2(Math.sin(delta),Math.cos(delta))
  }
}
