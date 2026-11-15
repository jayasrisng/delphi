import { voices, voiceIndex } from './satie.js'

const SCALE = [0, 2, 4, 7, 9]
const TONIC = 60
function playbackRate(step,index) {
  const midi = TONIC + 12 * Math.floor(step/5) + SCALE[step%5]
  return 440 * 2 ** ((midi-69)/12) / voices[index].root
}

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
    this.loading ??= this.loadSamples()
    return Promise.all([this.context.resume(), this.loading])
  }

  mute() {
    this.muted = !this.muted
    if (this.context) this.monitor.gain.setTargetAtTime(this.muted ? 0 : 1, this.context.currentTime, .025)
    return this.muted
  }

  async loadSamples() {
    try {
      this.samples = await Promise.all(voices.map(async ({file}) => {
        const response = await fetch('/audio/satie/'+file+'.mp3')
        if (!response.ok) throw new Error('Could not load Satie sample '+file)
        const buffer = await this.context.decodeAudioData(await response.arrayBuffer())
        return buffer
      }))
    } catch (error) {
      this.loading = undefined
      throw error
    }
  }

  ping(loud = .055) {
    this.note({ step:5,zone:2,gain:loud*4 })
  }

  sample(index,step,time,destination) {
    const source = this.context.createBufferSource()
    source.buffer = this.samples[index]
    source.playbackRate.value = playbackRate(step,index)
    source.connect(destination)
    source.start(time)
    return source
  }

  note(star, time = this.context?.currentTime) {
    if (!this.samples) return
    const ctx = this.context
    const envelope = ctx.createGain()
    const attack = star.attack ?? .024
    const gain = .68 * (star.gain ?? .65)
    const source = this.sample(voiceIndex(star),star.step,time,envelope)
    source.loop = Boolean(star.duration)
    const end = time + (star.duration ?? Math.min(1.4,source.buffer.duration/source.playbackRate.value))
    envelope.gain.setValueAtTime(0,time)
    envelope.gain.linearRampToValueAtTime(gain,Math.min(time+attack,end))
    if (star.duration) {
      envelope.gain.setValueAtTime(gain,Math.max(time+attack,end-.08))
      envelope.gain.linearRampToValueAtTime(0,end)
    } else envelope.gain.setTargetAtTime(0,Math.min(time+.13,end),.28)
    envelope.connect(this.bus)
    envelope.connect(this.echo)
    source.stop(end)
    return () => {
      const now = ctx.currentTime
      envelope.gain.cancelScheduledValues(now)
      envelope.gain.setTargetAtTime(0,now,.012)
      source.stop(Math.min(end,now+.045))
    }
  }

  hold(star) {
    const ctx = this.context
    let playing, index
    const fade = voice => {
      if (!voice) return
      const now = ctx.currentTime
      voice.envelope.gain.setTargetAtTime(0,now,.04)
      voice.source.stop(now+.23)
    }
    const update = current => {
      const next = voiceIndex(current)
      const now = ctx.currentTime
      if (next !== index) {
        fade(playing)
        index = next
        const envelope = ctx.createGain()
        envelope.gain.value = 0
        envelope.connect(this.bus)
        const source = this.sample(index,current.step,now,envelope)
        source.loop = true
        playing = { source, envelope }
      }
      playing.source.playbackRate.setTargetAtTime(playbackRate(current.step,index),now,.025)
      playing.envelope.gain.setTargetAtTime(.20*current.gain,now,.09)
    }
    update(star)
    return { update,stop:() => fade(playing) }
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
