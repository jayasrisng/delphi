import * as T from 'three'

const count = 82
const interval = .032

export class DolphinWake {
  tail = new T.Vector3()
  lastTail = new T.Vector3()
  sample = new T.Vector3()
  history = []
  nextSample = 0

  constructor(scene,dust) {
    this.dust = dust
    this.filaments = [0x9bbdff,0xc1b6ff].map(color => {
      const geometry = new T.BufferGeometry()
      geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(count*3),3).setUsage(T.DynamicDrawUsage))
      geometry.setAttribute('color',new T.BufferAttribute(new Float32Array(count*3),3).setUsage(T.DynamicDrawUsage))
      const strand = new T.Line(geometry,new T.LineBasicMaterial({
        vertexColors:true,transparent:true,opacity:.65,depthWrite:false,blending:T.AdditiveBlending
      }))
      strand.frustumCulled = false
      scene.add(strand)
      return { strand,color:new T.Color(color) }
    })
  }

  update(dolphin,time) {
    dolphin.localToWorld(this.tail.set(-1.76,Math.sin(time*7)*.14,0))
    if (time >= this.nextSample) {
      this.nextSample = time + interval
      if (!this.history.length) this.lastTail.copy(this.tail)
      const distance = this.tail.distanceTo(this.lastTail)
      const samples = Math.min(6,Math.max(1,Math.ceil(distance/.10)))
      for (let i=1;i<=samples;i++) {
        this.sample.lerpVectors(this.lastTail,this.tail,i/samples)
        const {x,y,z} = this.sample
        this.dust.emit(x,y,z,6,.16,0,true)
        this.dust.emit(x,y,z,5,.58,0,true)
      }
      const {x,y,z} = this.tail
      this.history.push({x,y,z,time})
      if (this.history.length > count) this.history.shift()
      this.lastTail.copy(this.tail)
    }

    for (const [index,{strand,color}] of this.filaments.entries()) {
      const {position,color:colors} = strand.geometry.attributes
      this.history.forEach((sample,i) => {
        const age = time-sample.time
        const phase = sample.time*8+age*3.5+index*Math.PI
        const radius = .06+Math.min(age,1.8)*.18
        const glow = Math.max(0,1-age/2.9)**2 * (.66+.34*Math.sin(phase)**2)
        position.setXYZ(i,sample.x+Math.cos(phase)*radius*.35,
          sample.y+Math.sin(phase)*radius,sample.z+Math.cos(phase)*radius)
        colors.setXYZ(i,color.r*glow,color.g*glow,color.b*glow)
      })
      strand.geometry.setDrawRange(0,this.history.length)
      position.needsUpdate = true
      colors.needsUpdate = true
    }
  }
}
