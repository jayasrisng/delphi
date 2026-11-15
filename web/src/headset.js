import { Matrix4, Quaternion, Vector3 } from 'three'

const STAR_PLANE = .65
const METERS_PER_UNIT = .088
const FORWARD = new Vector3(0,0,-1)

export function connectHeadset(stage, button, callbacks) {
  const xr = stage.renderer.xr
  xr.enabled = true
  xr.setReferenceSpaceType('local')
  const inverse = new Matrix4()
  const origin = new Vector3()
  const direction = new Vector3()
  const rotation = new Quaternion()
  const inputs = new Map()
  let anchored = false

  function sample(frame, source, state, now) {
    const ref = xr.getReferenceSpace()
    const pose = ref && frame.getPose(source.targetRaySpace,ref)
    if (!pose || !anchored) {
      state.cursor.visible = false
      callbacks.release(source)
      if (state.closed) state.blocked = true
      return
    }
    const { position, orientation } = pose.transform
    origin.set(position.x,position.y,position.z).applyMatrix4(inverse)
    direction.copy(FORWARD).applyQuaternion(rotation.set(orientation.x,orientation.y,orientation.z,orientation.w))
      .transformDirection(inverse)
    const distance = (STAR_PLANE-origin.z)/direction.z
    if (!Number.isFinite(distance) || distance < 0 || direction.z >= -.001) {
      state.cursor.visible = false
      callbacks.release(source)
      if (state.closed) state.blocked = true
      return
    }
    origin.addScaledVector(direction,distance)
    const height = 10*(20-STAR_PLANE)/20
    const x = .5+origin.x/(height*stage.aspect)
    const y = .5-origin.y/height
    state.cursor.visible = x >= 0 && x <= 1 && y >= 0 && y <= 1
    state.cursor.position.set(origin.x,origin.y,STAR_PLANE+.08)
    if (!state.blocked) callbacks.pointer(source,x,y,state.closed,now)
  }

  function input(source) {
    if (inputs.has(source)) return inputs.get(source)
    const cursor = stage.sprite(0xd4dcff,.9)
    cursor.scale.setScalar(.4)
    cursor.visible = false
    stage.scene.add(cursor)
    const state = { cursor, closed:false, blocked:false }
    inputs.set(source,state)
    return state
  }

  function remove(source) {
    const state = inputs.get(source)
    if (!state) return
    callbacks.release(source)
    state.cursor.removeFromParent()
    state.cursor.material.dispose()
    inputs.delete(source)
  }

  navigator.xr?.isSessionSupported('immersive-vr').then(supported => { button.hidden = !supported }).catch(() => {})
  button.onclick = async () => {
    button.disabled = true
    let session
    try {
      // Request both privileged operations from the click before yielding.
      const ready = callbacks.start()
      session = await navigator.xr.requestSession('immersive-vr')
      await ready
      anchored = false
      await xr.setSession(session)
      session.addEventListener('end', () => {
        for (const source of inputs.keys()) remove(source)
        stage.camera.position.set(0,0,20)
        stage.camera.quaternion.identity()
        stage.resize()
        button.disabled = false
        callbacks.stop()
      }, { once:true })
      for (const type of ['selectstart','selectend']) {
        session.addEventListener(type, event => {
          if (event.inputSource.targetRayMode !== 'tracked-pointer') return
          const state = input(event.inputSource)
          state.closed = type === 'selectstart'
          if (!state.closed) state.blocked = false
          sample(event.frame,event.inputSource,state,performance.now())
        })
      }
      session.addEventListener('squeeze', callbacks.drums)
      session.addEventListener('inputsourceschange', event => event.removed.forEach(remove))
    } catch {
      if (session) await session.end().catch(() => {})
      button.disabled = false
      callbacks.error()
    }
  }

  return {
    update(frame,now) {
      const ref = xr.getReferenceSpace()
      if (!ref) return
      if (!anchored) {
        const pose = frame.getViewerPose(ref)
        if (!pose) return
        const { position, orientation } = pose.transform
        direction.copy(FORWARD).applyQuaternion(rotation.set(orientation.x,orientation.y,orientation.z,orientation.w))
        direction.y = 0
        if (direction.lengthSq() < .001) direction.copy(FORWARD)
        direction.normalize()
        const yaw = Math.atan2(-direction.x,-direction.z)
        stage.xrStage.makeRotationY(yaw).scale(origin.setScalar(METERS_PER_UNIT))
          .setPosition(position.x + 1.65*direction.x, position.y-.14, position.z + 1.65*direction.z)
        inverse.copy(stage.xrStage).invert()
        anchored = true
      }
      for (const source of frame.session.inputSources) {
        if (source.targetRayMode === 'tracked-pointer') sample(frame,source,input(source),now)
      }
    }
  }
}
