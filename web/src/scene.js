import { ShootingStars } from './shooting-stars.js'
import { Stardust } from './stardust.js'
import { DolphinWake } from './dolphin-wake.js'
import { loadAtlas, paintAtlas } from './atlas.js'
import * as T from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

function random(seed) {
  return () => {
    seed = (1664525 * seed + 1013904223) >>> 0
    return seed / 4294967296
  }
}

function glowTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(64,64,0,64,64,64)
  gradient.addColorStop(0,'#fff')
  gradient.addColorStop(.12,'#fffd')
  gradient.addColorStop(.32,'#fff5')
  gradient.addColorStop(1,'#fff0')
  ctx.fillStyle = gradient
  ctx.fillRect(0,0,128,128)
  return new T.CanvasTexture(canvas)
}

function line(points, color, opacity) {
  return new T.Line(new T.BufferGeometry().setFromPoints(points), new T.LineBasicMaterial({
    color, transparent: true, opacity, depthWrite: false
  }))
}

export class Stage {
  constructor(parent,{background = true} = {}) {
    this.renderer=new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'})
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.8))
    this.renderer.setClearColor(0x000000,0)
    this.xrStage = new T.Matrix4()
    this.parent = parent
    parent.append(this.renderer.domElement)
    this.scene=new T.Scene()
    this.stillSky = matchMedia("(prefers-reduced-motion: reduce)")
    if (background) {
      this.atlas = document.createElement("canvas")
      this.scene.background = new T.CanvasTexture(this.atlas)
      this.scene.background.colorSpace = T.SRGBColorSpace
      loadAtlas().then(backdrop => { this.atlasBackdrop = backdrop; this.paintSky() })
    }
    this.camera=new T.PerspectiveCamera(T.MathUtils.radToDeg(2*Math.atan(5/20)),1,.1,100)
    this.camera.position.z=20
    this.glow=glowTexture()
    this.dust = new Stardust(this.scene)
    this.wake = new DolphinWake(this.scene,this.dust)
    if (background) this.meteors = new ShootingStars(this)
    this.dolphin=new T.Group()
    this.dolphinRay = new T.Ray()
    this.dolphinInverse = new T.Matrix4()
    this.loadDolphin()
    this.scene.add(this.dolphin)
    this.scene.add(new T.HemisphereLight(0xd9e4ff,0x222c56,1.6))
    const key = new T.DirectionalLight(0xe8ebff,2.8)
    key.position.set(3,5,9)
    this.scene.add(key)
    const fill=new T.DirectionalLight(0xafc2ff,4.0)
    fill.position.set(-3,1,-5)
    this.scene.add(fill)
    this.hands=[]
    this.sonar=[]
    this.portal=null
    this.resize()
  }

  hitsDolphin(origin, direction) {
    if (!this.dolphinHitBox) return false
    this.dolphin.updateMatrix()
    this.dolphinInverse.copy(this.dolphin.matrix).invert()
    return this.dolphinRay.set(origin,direction).applyMatrix4(this.dolphinInverse)
      .intersectsBox(this.dolphinHitBox)
  }

  showDolphinReply(until) {
    if (!this.dolphinReply) {
      const canvas = document.createElement('canvas')
      canvas.width = 768
      canvas.height = 144
      const context = canvas.getContext('2d')
      context.fillStyle = '#111733'
      context.beginPath()
      context.roundRect(4,4,760,136,28)
      context.fill()
      context.fillStyle = '#e5e9ff'
      context.font = '600 48px system-ui'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText('Hands off! Play with the stars.',384,72)
      const map = new T.CanvasTexture(canvas)
      map.colorSpace = T.SRGBColorSpace
      this.dolphinReply = new T.Sprite(new T.SpriteMaterial({map,depthTest:false,depthWrite:false}))
      this.dolphinReply.scale.set(5.4,1.01,1)
      this.dolphinReply.renderOrder = 20
      this.scene.add(this.dolphinReply)
    }
    this.dolphinReplyUntil = until
  }

  async loadDolphin() {
    try {
      const gltf = await new GLTFLoader().loadAsync('/models/dolphin.glb')
      const model = gltf.scene
      const rig = new T.Group()
      rig.add(model)
      rig.rotation.y = Math.PI/2
      // Measure the imported rig after orientation, then center it at the flight pivot.
      rig.updateWorldMatrix(true,true)
      const bounds = new T.Box3().setFromObject(rig,true)
      const center = bounds.getCenter(new T.Vector3())
      const size = bounds.getSize(new T.Vector3())
      const scale = 1/Math.max(size.x,size.y,size.z)
      rig.scale.setScalar(scale*4)
      rig.position.addScaledVector(center,-scale*4)
      this.dolphin.add(rig)
      this.dolphinHitBox = new T.Box3().setFromCenterAndSize(
        new T.Vector3(),size.multiplyScalar(scale*4).max(new T.Vector3(.3,.3,.3))
      )
      const shell = new T.MeshPhongMaterial({
        color:0x617bdf,emissive:0x293f9b,transparent:true,opacity:.1,
        depthWrite:false,blending:T.AdditiveBlending
      })
      shell.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>',`
          float rim = pow(1.0 - clamp(dot(normal,normalize(vViewPosition)),0.0,1.0), 2.1);
          outgoingLight = mix(vec3(.14,.25,.60),vec3(.68,.82,1.0),rim);
          diffuseColor.a = .07 + .56 * rim;
          #include <opaque_fragment>
        `)
      }
      const surface = []
      model.traverse(part => {
        if (!part.isMesh) return
        if (part.material?.name === 'Dolphin_Eyes') {
          part.visible = false
          return
        }
        part.material = shell
        part.frustumCulled = false
        surface.push(part)
      })
      const rand = random(477)
      this.dolphinSurface = surface.flatMap(mesh => {
        const vertices = mesh.geometry.attributes.position.count
        return Array.from({length:Math.min(3000,vertices)},() => ({ mesh,index:Math.floor(rand()*vertices) }))
      })
      const pointGeometry = new T.BufferGeometry()
      this.dolphinPoints = new T.BufferAttribute(new Float32Array(this.dolphinSurface.length*3),3).setUsage(T.DynamicDrawUsage)
      pointGeometry.setAttribute('position',this.dolphinPoints)
      const points = new T.Points(pointGeometry,new T.PointsMaterial({
        color:0xd3e1ff,map:this.glow,size:.105,transparent:true,
        opacity:.91,depthWrite:false,blending:T.AdditiveBlending
      }))
      points.frustumCulled = false
      this.scene.add(points)
      this.surfacePoint = new T.Vector3()
      if (gltf.animations.length) {
        this.dolphinMixer = new T.AnimationMixer(model)
        this.dolphinMixer.clipAction(gltf.animations[0]).play()
        this.dolphinMixer.timeScale = .58
      }
    } catch (error) {
      console.warn('Official dolphin could not load',error)
    }
  }

  sprite(color,opacity=1) {
    return new T.Sprite(new T.SpriteMaterial({map:this.glow,color,opacity,transparent:true,depthWrite:false,blending:T.AdditiveBlending}))
  }

  resize() {
    if (this.renderer.xr.isPresenting) return
    const { clientWidth: width, clientHeight: height } = this.parent
    if (!width || !height) return
    this.aspect=width/height
    if (this.atlas) {
      this.atlas.width = width
      this.atlas.height = height
      this.paintSky()
    }
    this.camera.aspect=this.aspect
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width,height)
  }

  paintSky(offset = 0,time = 0) {
    paintAtlas(this.atlas.getContext("2d"), this.atlas.width, this.atlas.height, this.atlasBackdrop,offset,time)
    this.scene.background.needsUpdate = true
  }

  point(x,y,z=0) {
    const height = 10*(20-z)/20
    return new T.Vector3((x-.5)*height*this.aspect,(.5-y)*height,z)
  }

  star(color) {
    const group=new T.Group()
    const light=this.sprite(color,.85)
    light.scale.setScalar(1.9)
    group.add(light)
    const corona=this.sprite(color,.42)
    corona.scale.setScalar(4.4)
    group.add(corona)
    const points=[]
    for(let i=0;i<8;i++){
      const angle=Math.PI/2+i*Math.PI/4
      const radius=i%2?.052:i%4===0?.31:.21
      points.push(new T.Vector2(Math.cos(angle)*radius,Math.sin(angle)*radius))
    }
    group.add(new T.Mesh(new T.ShapeGeometry(new T.Shape(points)),new T.MeshBasicMaterial({ color:0xf6ffff,side:T.DoubleSide })))
    const target = line(Array.from({length:65},(_,i) => {
      const angle = i/64 * Math.PI*2
      return new T.Vector3(Math.cos(angle),Math.sin(angle),0)
    }),color,.22)
    group.userData.target = target
    group.add(target)
    this.scene.add(group)
    return group
  }

  edge(preview = false) {
    const edge = line([new T.Vector3(),new T.Vector3()],0xbab8fa,.55)
    if (preview) {
      edge.material.dispose()
      edge.material = new T.LineDashedMaterial({
        color:0xc3d9ff,dashSize:.09,gapSize:.075,transparent:true,depthWrite:false
      })
      edge.computeLineDistances()
    }
    this.scene.add(edge)
    return edge
  }

  updateEdge(edge,a,b,opacity) {
    const attr=edge.geometry.attributes.position
    attr.setXYZ(0,a.x,a.y,a.z); attr.setXYZ(1,b.x,b.y,b.z)
    attr.needsUpdate=true
    edge.frustumCulled=false
    edge.material.opacity=opacity
    if (edge.material.isLineDashedMaterial) {
      const distances = edge.geometry.attributes.lineDistance
      distances.setX(1,a.distanceTo(b))
      distances.needsUpdate = true
    }
  }

  ring(x,y,color=0xb9b6ff) {
    const circle=Array.from({length:97},(_,i)=>new T.Vector3(Math.sin(i/96*Math.PI*2),Math.cos(i/96*Math.PI*2),0))
    const item=line(circle,color,.65)
    item.position.copy(this.point(x,y,.2))
    this.scene.add(item)
    this.sonar.push({ item, age: 0 })
  }

  openPortal(x,y) {
    const group=new T.Group()
    const randomPoint=random(84)
    const layers=[]
    for (let band=0;band<3;band++) {
      const radius=.88+band*.28
      const points=Array.from({length:129},(_,i)=>{
        const angle=i/128*Math.PI*2
        const ripple=1+.035*Math.sin(angle*9+band)
        return new T.Vector3(radius*Math.cos(angle)*ripple,radius*Math.sin(angle)*ripple,0)
      })
      const arc=line(points,band===1?0xa49bff:0xb6c6ff,.7)
      arc.scale.y=.83+band*.07
      group.add(arc)
      layers.push(arc)
    }
    const sparks=Array.from({length:165},()=>{
      const angle=randomPoint()*Math.PI*2
      const radius=.74+randomPoint()*.97
      return new T.Vector3(radius*Math.cos(angle),radius*Math.sin(angle),randomPoint()*.28)
    })
    const particles=new T.Points(new T.BufferGeometry().setFromPoints(sparks),new T.PointsMaterial({
      color:0xb8beff,size:.4,map:this.glow,transparent:true,depthWrite:false,blending:T.AdditiveBlending
    }))
    const bloom=this.sprite(0x6660dd,.31)
    bloom.scale.setScalar(6)
    group.add(bloom,particles)
    group.position.copy(this.point(x,y,.11))
    group.scale.setScalar(.001)
    this.scene.add(group)
    this.portal={group,layers,particles,bloom,age:0}
  }

  hand(index,landmarks,connections,showPinch = false) {
    let hand=this.hands[index]
    if(!hand){
      hand=new T.Group()
      hand.userData.dots=Array.from({length:21},()=> {
        const dot=this.sprite(0xbfcfff,.85)
        hand.add(dot)
        return dot
      })
      hand.userData.bones=new T.LineSegments(new T.BufferGeometry().setFromPoints(connections.flatMap(()=>[new T.Vector3(),new T.Vector3()])),new T.LineBasicMaterial({color:0xa7b8ef,transparent:true,opacity:.59,depthWrite:false}))
      hand.userData.bones.frustumCulled=false
      hand.add(hand.userData.bones)
      const dustGeometry = new T.BufferGeometry()
      dustGeometry.setAttribute('position',new T.BufferAttribute(new Float32Array(connections.length*18*3),3))
      hand.userData.dust = new T.Points(dustGeometry,new T.PointsMaterial({
        map:this.glow,size:.23,color:0xc9dcff,transparent:true,opacity:.82,depthWrite:false,blending:T.AdditiveBlending
      }))
      hand.userData.dust.frustumCulled=false
      hand.add(hand.userData.dust)
      this.scene.add(hand)
      this.hands[index]=hand
    }
    hand.visible=true
    const positions=landmarks.map(([x,y])=>this.point(x,y,.8))
    positions.forEach((position,i)=>{
      const dot=hand.userData.dots[i]
      dot.position.copy(position)
      const pinchTip = i === 4 || i === 8
      dot.scale.setScalar(showPinch && pinchTip ? .54 : i === 8 ? .4 : .23)
    })
    const attr=hand.userData.bones.geometry.attributes.position
    const dust=hand.userData.dust.geometry.attributes.position
    const jitter = random(301)
    connections.forEach(({start,end},i)=>{
      attr.setXYZ(2*i,...positions[start])
      attr.setXYZ(2*i+1,...positions[end])
      const point = new T.Vector3()
      for (let j=0;j<18;j++) {
        point.lerpVectors(positions[start],positions[end],(j+.5)/18)
        dust.setXYZ(i*18+j,point.x+(jitter()-.5)*.20,point.y+(jitter()-.5)*.20,point.z+.04)
      }
    })
    attr.needsUpdate=true
    dust.needsUpdate=true
  }

  draw(dt,t) {
    if (this.dolphinReply) {
      this.dolphinReply.visible = t < this.dolphinReplyUntil
      this.dolphinReply.position.copy(this.dolphin.position)
      this.dolphinReply.position.y += 1.38
      this.dolphinReply.material.opacity = T.MathUtils.clamp((this.dolphinReplyUntil-t)*5,0,1)
    }
    this.dolphinMixer?.update(dt)
    if (this.dolphinPoints) {
      this.dolphin.updateWorldMatrix(true,true)
      for (let i=0;i<this.dolphinSurface.length;i++) {
        const {mesh,index} = this.dolphinSurface[i]
        mesh.getVertexPosition(index,this.surfacePoint).applyMatrix4(mesh.matrixWorld)
        this.dolphinPoints.setXYZ(i,...this.surfacePoint)
      }
      this.dolphinPoints.needsUpdate = true
      this.wake.update(this.dolphin,t)
    }
    this.dust.update(dt)
    this.meteors?.draw(t)
    if (t >= (this.skyUpdate ?? 0) && this.atlasBackdrop && !this.stillSky.matches) {
      this.skyUpdate = t+.16
      this.paintSky(Math.sin(t*.025)*4 + (this.parallaxX ?? 0)*.16,t)
    }
    this.sonar=this.sonar.filter(({item,age},index)=>{
      this.sonar[index].age+=dt
      item.scale.setScalar(.15+age*3.8)
      item.material.opacity=.62*Math.max(0,1-age/1.15)
      if(age<1.15)return true
      dispose(item)
      return false
    })
    if (this.portal) {
      const portal=this.portal
      portal.age+=dt
      const open=Math.min(1,portal.age/.55)
      const fade=Math.max(0,1-Math.max(0,portal.age-.55)/1.22)
      portal.group.scale.setScalar(.16+1.6*(1-(1-open)**3))
      portal.group.rotation.z+=dt*.29
      portal.layers.forEach((arc,i)=>{
        arc.rotation.z+=dt*(i===1 ? -.74 : .3)
        arc.material.opacity=fade*(i===1 ? .85 : .53)
      })
      portal.particles.material.opacity=fade
      portal.bloom.material.opacity=fade*.31
      if (!fade) {
        dispose(portal.group)
        this.portal=null
      }
    }
    if (this.renderer.xr.isPresenting) {
      // The simulation and its particles use stage units; only rendering uses headset meters.
      this.scene.matrixAutoUpdate = false
      this.scene.matrix.copy(this.xrStage)
      this.scene.matrixWorldNeedsUpdate = true
      try {
        this.renderer.render(this.scene,this.camera)
      } finally {
        this.scene.matrix.identity()
        this.scene.matrixWorldNeedsUpdate = true
        this.scene.updateMatrixWorld(true)
        this.scene.matrixAutoUpdate = true
      }
    } else {
      this.renderer.render(this.scene,this.camera)
    }
  }
}

export function dispose(obj) {
  obj.removeFromParent()
  obj.traverse(part=>{
    part.geometry?.dispose()
    part.material?.dispose()
  })
}
