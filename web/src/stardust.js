import * as T from 'three'

export class Stardust {
  constructor(scene, capacity = 4600) {
    this.cursor = 0
    this.life = new Float32Array(capacity)
    this.duration = new Float32Array(capacity)
    this.twinkle = new Float32Array(capacity)
    this.wake = new Uint8Array(capacity)
    this.tick = 0
    this.velocity = new Float32Array(capacity * 3)
    this.position = new T.BufferAttribute(new Float32Array(capacity * 3),3).setUsage(T.DynamicDrawUsage)
    this.light = new T.BufferAttribute(new Float32Array(capacity),1).setUsage(T.DynamicDrawUsage)
    const geometry = new T.BufferGeometry()
    geometry.setAttribute('position',this.position)
    geometry.setAttribute('light',this.light)
    const material = new T.ShaderMaterial({
      transparent:true,depthWrite:false,blending:T.AdditiveBlending,
      uniforms:{ pixelRatio:{value:Math.min(devicePixelRatio,1.8)} },
      vertexShader:`
        attribute float light;
        uniform float pixelRatio;
        varying float energy;
        void main() {
          energy = light;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
          gl_PointSize = pixelRatio * (1.8 + 6.8 * light);
        }
      `,
      fragmentShader:`
        varying float energy;
        void main() {
          if (energy <= 0.) discard;
          vec2 p = gl_PointCoord - .5;
          float r = length(p);
          float mist = max(0., 1. - 2. * r);
          float core = exp(-46. * r * r);
          vec3 color = mix(vec3(.37,.47,1.), vec3(.87,.95,1.), core);
          float flare = exp(-abs(p.x)*43.)*max(0.,1.-2.*abs(p.y))
                      + exp(-abs(p.y)*43.)*max(0.,1.-2.*abs(p.x));
          gl_FragColor = vec4(color, energy * (mist * .23 + core * .82 + flare * energy * .29));
        }
      `
    })
    const sparks = new T.Points(geometry,material)
    sparks.frustumCulled = false
    scene.add(sparks)
  }

  emit(x,y,z,count,spread,drift = 0,hanging = false) {
    for (let i=0;i<count;i++) {
      const slot = this.cursor++ % this.life.length
      const random = () => Math.random()-.5
      this.position.setXYZ(slot,x+random()*spread,y+random()*spread,z+random()*spread)
      this.duration[slot] = this.life[slot] = hanging ? 1.4+Math.random()*2.45 : .55+Math.random()*1.25
      this.twinkle[slot] = Math.random()
      this.wake[slot] = Number(hanging)
      this.velocity[3*slot] = random()*(hanging ? .47 : .8)+drift
      this.velocity[3*slot+1] = random()*(hanging ? .48 : .9)
      this.velocity[3*slot+2] = random()*.4
    }
  }

  update(dt) {
    this.tick += dt
    const coords = this.position.array
    const alpha = this.light.array
    for (let i=0;i<this.life.length;i++) {
      if (this.life[i] <= 0) continue
      this.life[i] = Math.max(0,this.life[i]-dt)
      const phase = this.twinkle[i]
      const shimmer = .57 + .43*Math.sin(this.tick*(5+phase*12)+phase*31)**4
      const wake = this.wake[i]
      const fade = (this.life[i]/this.duration[i])**(wake ? .85 : 1.35)
      alpha[i] = Math.min(1,fade * shimmer * (.55+phase*.65) * (wake ? 1.55 : 1))
      for(let axis=0;axis<3;axis++) coords[3*i+axis] += this.velocity[3*i+axis]*dt
    }
    this.position.needsUpdate = true
    this.light.needsUpdate = true
  }
}
