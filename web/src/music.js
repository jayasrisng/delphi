const SCALE = [0, 2, 4, 7, 9]
const TONIC = 60
const TIMBRES = [
  [[1,1,.7],[2,.32,.31],[3,.1,.18]],
  [[1,1,.43],[2.01,.54,.28],[4.03,.25,.14]],
  [[1,1,.86],[3,.19,.45],[5,.04,.26]],
  [[1,1,1.2],[2,.28,.7],[3,.12,.4]]
]

export function pitch(y) {
  return Math.max(0, Math.min(10, Math.round((.8-y)*14)))
}

export class Music {
  beats = []
  sequence = []
  beat = .47
  muted = false

  unlock() {
    if (!this.context) {
      const ctx = this.context = new AudioContext()
      this.bus = ctx.createGain()
      this.bus.gain.value = .69
      const limiter = ctx.createDynamicsCompressor()
      this.capture = ctx.createMediaStreamDestination()
      this.monitor = ctx.createGain()
      limiter.connect(this.capture)
      limiter.connect(this.monitor).connect(ctx.destination)
      this.bus.connect(limiter)
      const echo = ctx.createDelay(.6)
      const echoLevel = ctx.createGain()
      echo.delayTime.value = .245
      echoLevel.gain.value = .2
      echo.connect(echoLevel).connect(this.bus)
      this.echo = echo
    }
    return this.context.resume()
  }

  mute() {
    this.muted = !this.muted
    if (this.context) this.monitor.gain.setTargetAtTime(this.muted ? 0 : 1, this.context.currentTime, .025)
    return this.muted
  }

  ping(loud = .055) {
    if (!this.context) return
    const t = this.context.currentTime
    this.tone(550, loud, .55, t, .012, 320)
    this.tone(550, loud * .37, .45, t + .24, .012, 410)
  }

  note(star, time = this.context?.currentTime) {
    if (!this.context) return
    const step = star.step
    const midi = TONIC + 12 * Math.floor(step/5) + SCALE[step%5]
    const hz = 440 * 2 ** ((midi-69)/12)
    const gain = star.gain ?? .65
    const attack = star.attack ?? .024
    if (star.zone === 1) {
      this.tone(65 + step * 5, .30 * gain, .28, time, Math.min(.04,attack), 38 + step * 2)
      this.tone(180 + step * 12, .08 * gain, .12, time, Math.min(.03,attack), 62)
      return
    }
    for (const [ratio, level, decay] of TIMBRES[star.zone]) {
      this.tone(hz * ratio, .23 * gain * level, decay, time, attack)
    }
  }

  hold(star) {
    const ctx = this.context
    const voice = ctx.createOscillator()
    const envelope = ctx.createGain()
    voice.type = star.zone === 2 ? 'sine' : 'triangle'
    voice.connect(envelope).connect(this.bus)
    envelope.gain.value = 0
    voice.start()
    return {
      update: current => {
        const midi = TONIC + 12 * Math.floor(current.step / 5) + SCALE[current.step % 5]
        voice.frequency.setTargetAtTime(440 * 2 ** ((midi - 69) / 12), ctx.currentTime, .016)
        envelope.gain.setTargetAtTime(.07 * current.gain, ctx.currentTime, .045)
      },
      stop: () => {
        envelope.gain.setTargetAtTime(0, ctx.currentTime, .025)
        voice.stop(ctx.currentTime + .15)
      }
    }
  }

  tone(hz, volume, length, time, attack, endHz = hz) {
    const ctx = this.context
    const oscillator = ctx.createOscillator()
    const envelope = ctx.createGain()
    oscillator.frequency.setValueAtTime(hz, time)
    oscillator.frequency.exponentialRampToValueAtTime(endHz, time + length)
    envelope.gain.setValueAtTime(.0001, time)
    envelope.gain.exponentialRampToValueAtTime(volume, time + attack)
    envelope.gain.exponentialRampToValueAtTime(.0001, time + length)
    oscillator.connect(envelope)
    envelope.connect(this.bus)
    envelope.connect(this.echo)
    oscillator.start(time)
    oscillator.stop(time + length + .01)
  }

  loop(sequence, links) {
    this.sequence = sequence
    this.links = links
    if (!sequence.length || this.timer || !this.context) return
    this.next = this.context.currentTime + .07
    this.index = 0
    this.tick()
    this.timer = setInterval(() => this.tick(), 25)
  }

  tick() {
    if (this.context.state !== 'running' || !this.sequence.length) return
    const now = this.context.currentTime
    if (this.next < now - .08) this.next = now + .04
    while (this.next < now + .12) {
      const star = this.sequence[this.index % this.sequence.length]
      const previous = this.sequence[(this.index + this.sequence.length - 1) % this.sequence.length]
      const link = this.links.find(edge => edge.a === star && edge.b === previous || edge.b === star && edge.a === previous)
      this.note(star, this.next)
      this.beats.push({ star, link, time: this.next })
      this.next += this.beat
      this.collaborator?.(star, this.next, this.index)
      this.index++
    }
  }

  clear() {
    clearInterval(this.timer)
    this.timer = null
    this.sequence = []
    this.beats.length = 0
  }
}
