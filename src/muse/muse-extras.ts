import * as ecs from '@8thwall/ecs'
import animBinUrl from '../assets/muse/muse_anim.bin'
import sweepsBinUrl from '../assets/muse/muse_sweeps.bin'
import logoUrl from '../assets/muse/logo.png'

// Same look as the MindAR web version (web/video.html) and the Unity app (MuseAR.cs):
// Muse's shadow on the video, and her animation driven by the video's playback time.
// Target space: the full square image is 1 x 1, +Z toward the viewer.

declare const THREE: any

const CLIP_DURATION = 8        // seconds, Muse-new.c4d frames 0-240 @ 30 fps
const SHADOW_OPACITY = 0.35
// Muse's black and white are swapped over these scene frames (30 fps, inclusive).
const INVERT_FRAMES = [150, 210]
const SCENE_FPS = 30

// Muse-new is deformed by a Spline Wrap and a Twist, which glTF can't express, so its final
// mesh is baked per frame (scratchpad bake_muse_new.py) into muse_anim.bin:
//   "MVA1", uint32 frames, float32 fps, uint32 vertices,
//   then per frame: float32 min[3], scale[3] + uint16 xyz per vertex.
// Vertex order: the "muse_white" mesh, then "muse_black", as in muse.glb.
const ANIM_MESHES = ['muse_white', 'muse_black']

// The top-level Sweep (Circle along a Tracer of "n-Side") changes topology every frame, so its
// trails are baked instead (muse_sweeps.bin) and rebuilt as tubes:
//   "MSW1", uint32 frames, float32 fps, uint32 sweeps; per frame and sweep:
//   float32 radius (m), uint16 segments, per segment uint16 points + float32 xyz.
type SweepFrame = {radius: number, segments: Float32Array[]}[]

type SweepAnimation = {
  fps: number
  frames: SweepFrame[]
  meshes: any[]
  lastFrame: number
}

type VertexAnimation = {
  frames: number
  fps: number
  vertices: number
  view: DataView
}

type State = {
  ready: boolean
  sun?: any
  shadowScale: number
  anim?: VertexAnimation
  sweeps?: SweepAnimation
  sweepMaterial?: any
  lastTime: number
  video?: HTMLVideoElement
}

const states = new Map<ecs.Eid, State>()

const findVideo = (object: any): HTMLVideoElement | undefined => {
  let found
  object?.traverse((o: any) => {
    const image = o.material?.map?.image
    if (!found && image instanceof HTMLVideoElement) {
      found = image
    }
  })
  return found
}

const parseAnimation = (buffer: ArrayBuffer): VertexAnimation => {
  const view = new DataView(buffer)
  const magic = String.fromCharCode(...new Uint8Array(buffer, 0, 4))
  if (magic !== 'MVA1') {
    throw new Error(`unexpected header ${magic}`)
  }
  return {
    frames: view.getUint32(4, true),
    fps: view.getFloat32(8, true),
    vertices: view.getUint32(12, true),
    view,
  }
}

const parseSweeps = (buffer: ArrayBuffer): Omit<SweepAnimation, 'meshes' | 'lastFrame'> => {
  const view = new DataView(buffer)
  const magic = String.fromCharCode(...new Uint8Array(buffer, 0, 4))
  if (magic !== 'MSW1') {
    throw new Error(`unexpected header ${magic}`)
  }
  const count = view.getUint32(4, true)
  const fps = view.getFloat32(8, true)
  const sweeps = view.getUint32(12, true)
  let o = 16
  const frames = []
  for (let f = 0; f < count; f++) {
    const frame = []
    for (let s = 0; s < sweeps; s++) {
      const radius = view.getFloat32(o, true)
      const segmentCount = view.getUint16(o + 4, true)
      o += 6
      const segments = []
      for (let g = 0; g < segmentCount; g++) {
        const points = view.getUint16(o, true)
        o += 2
        segments.push(new Float32Array(buffer.slice(o, o + points * 12)))
        o += points * 12
      }
      frame.push({radius, segments})
    }
    frames.push(frame)
  }
  return {fps, frames}
}

const setup = (world: ecs.World, eid: ecs.Eid, museEid: ecs.Eid, state: State) => {
  const stage = world.three.entityToObject.get(eid)
  const muse = world.three.entityToObject.get(museEid)
  if (!stage || !muse) {
    return
  }

  const {renderer} = world.three
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  // Transparent shadow catcher just above the video (the video itself stays unlit).
  const catcher = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShadowMaterial({opacity: SHADOW_OPACITY})
  )
  catcher.position.z = 0.002
  catcher.receiveShadow = true
  stage.add(catcher)

  // Light in front of the image; its frustum is refitted to the target's world scale each frame.
  const sun = new THREE.DirectionalLight(0xffffff, 1)
  sun.position.set(0.35, 0.6, 1.5)
  sun.target.position.set(0, 0, 0)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.bias = -0.0005
  stage.add(sun, sun.target)
  state.sun = sun

  fetch(animBinUrl).then(r => r.arrayBuffer()).then((buffer) => {
    state.anim = parseAnimation(buffer)
  }).catch(err => console.error('Muse animation:', err))

  // Trail tubes live next to the glTF scene, in the same (baked) space.
  const sweepGroup = new THREE.Group()
  muse.add(sweepGroup)
  const sweepMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff, side: THREE.DoubleSide, toneMapped: false,
  })
  state.sweepMaterial = sweepMaterial
  fetch(sweepsBinUrl).then(r => r.arrayBuffer()).then((buffer) => {
    const parsed = parseSweeps(buffer)
    const segments = Math.max(0, ...parsed.frames.map(f => f.reduce((n, s) => n + s.segments.length, 0)))
    const meshes = []
    for (let i = 0; i < segments; i++) {
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), sweepMaterial)
      mesh.frustumCulled = false
      mesh.castShadow = true
      sweepGroup.add(mesh)
      meshes.push(mesh)
    }
    state.sweeps = {...parsed, meshes, lastFrame: -1}
    world.three.notifyChanged(sweepGroup)
  }).catch(err => console.error('Muse sweeps:', err))

  world.three.notifyChanged(stage)
  state.ready = true
}

const fitShadow = (state: State) => {
  const {sun} = state
  const k = sun.parent.matrixWorld.getMaxScaleOnAxis()
  if (!k || Math.abs(k - state.shadowScale) < state.shadowScale * 0.01) {
    return
  }
  state.shadowScale = k
  Object.assign(sun.shadow.camera, {
    left: -0.8 * k, right: 0.8 * k, top: 0.8 * k, bottom: -0.8 * k, near: 0.1 * k, far: 4 * k,
  })
  sun.shadow.camera.updateProjectionMatrix()
}

// The glTF loads asynchronously and the engine may rebuild it, so this is re-applied every frame.
const prepareMuseMeshes = (world: ecs.World, museEid: ecs.Eid) => {
  const meshes = {}
  world.three.entityToObject.get(museEid)?.traverse((o: any) => {
    if (o.isMesh) {
      o.castShadow = true
      o.frustumCulled = false
      meshes[o.name] = o
    }
  })
  return meshes
}

// Writes the baked positions at time t (linear blend between the two nearest baked frames).
const applyAnimation = (anim: VertexAnimation, meshes: Record<string, any>, t: number) => {
  const targets = ANIM_MESHES.map(name => meshes[name])
  if (targets.some(m => !m)) {
    return false
  }
  const {view, vertices} = anim
  const frameBytes = 24 + vertices * 6
  const f = Math.min(anim.frames - 1, Math.max(0, t * anim.fps))
  const f0 = Math.floor(f)
  const f1 = Math.min(anim.frames - 1, f0 + 1)
  const blend = f - f0
  const o0 = 16 + f0 * frameBytes
  const o1 = 16 + f1 * frameBytes
  const min0 = [0, 1, 2].map(a => view.getFloat32(o0 + a * 4, true))
  const scale0 = [0, 1, 2].map(a => view.getFloat32(o0 + 12 + a * 4, true))
  const min1 = [0, 1, 2].map(a => view.getFloat32(o1 + a * 4, true))
  const scale1 = [0, 1, 2].map(a => view.getFloat32(o1 + 12 + a * 4, true))
  let v = 0
  for (const mesh of targets) {
    const attribute = mesh.geometry.attributes.position
    const out = attribute.array
    for (let i = 0; i < attribute.count; i++, v++) {
      for (let a = 0; a < 3; a++) {
        const p0 = min0[a] + view.getUint16(o0 + 24 + (v * 3 + a) * 2, true) * scale0[a]
        const p1 = min1[a] + view.getUint16(o1 + 24 + (v * 3 + a) * 2, true) * scale1[a]
        out[i * 3 + a] = p0 + (p1 - p0) * blend
      }
    }
    attribute.needsUpdate = true
    mesh.geometry.computeBoundingSphere()
  }
  return true
}

const applySweeps = (sweeps: SweepAnimation, t: number) => {
  const f = Math.min(sweeps.frames.length - 1, Math.floor(t * sweeps.fps))
  if (f === sweeps.lastFrame) {
    return
  }
  sweeps.lastFrame = f
  let m = 0
  for (const {radius, segments} of sweeps.frames[f]) {
    for (const points of segments) {
      const mesh = sweeps.meshes[m++]
      mesh.geometry.dispose()
      const count = points.length / 3
      if (radius <= 1e-5 || count < 2) {
        mesh.geometry = new THREE.BufferGeometry()
        continue
      }
      const curve = []
      for (let i = 0; i < count; i++) {
        curve.push(new THREE.Vector3(points[i * 3], points[i * 3 + 1], points[i * 3 + 2]))
      }
      mesh.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curve), count * 2, radius, 8, false)
    }
  }
  for (; m < sweeps.meshes.length; m++) {
    sweeps.meshes[m].geometry.dispose()
    sweeps.meshes[m].geometry = new THREE.BufferGeometry()
  }
}

const applyColors = (state: State, meshes: Record<string, any>, t: number) => {
  const frame = Math.floor(t * SCENE_FPS + 1e-6)
  const inverted = frame >= INVERT_FRAMES[0] && frame <= INVERT_FRAMES[1]
  const white = inverted ? 0x000000 : 0xffffff
  const black = inverted ? 0xffffff : 0x000000
  meshes.muse_white?.material.color.setHex(white)
  meshes.muse_black?.material.color.setHex(black)
  state.sweepMaterial?.color.setHex(white)
}

// Logo overlay linking to the site, fixed on screen once the camera is running
// (not over the landing / permission UI). Opens in a new tab so the AR page stays open.
const showLogo = () => {
  if (document.getElementById('muse-logo')) {
    return
  }
  const link = document.createElement('a')
  link.id = 'muse-logo'
  link.href = 'https://raphaelerba.art'
  link.target = '_blank'
  link.rel = 'noopener'
  link.setAttribute('aria-label', 'raphaelerba.art')
  Object.assign(link.style, {
    position: 'fixed',
    top: 'calc(env(safe-area-inset-top) + 12px)',
    left: 'calc(env(safe-area-inset-left) + 12px)',
    width: '15vw',
    maxWidth: '120px',
    minWidth: '44px',
    zIndex: '10',
    display: 'block',
    WebkitTapHighlightColor: 'transparent',
  })
  // Keep the tap from reaching the scene's input handlers.
  for (const type of ['touchstart', 'touchend', 'pointerdown', 'pointerup', 'mousedown', 'mouseup']) {
    link.addEventListener(type, e => e.stopPropagation())
  }
  const logo = document.createElement('img')
  logo.src = logoUrl
  logo.alt = ''
  Object.assign(logo.style, {width: '100%', display: 'block', opacity: '0.8'})
  link.appendChild(logo)
  document.body.appendChild(link)
}

ecs.registerComponent({
  name: 'Muse Extras',
  schema: {
    // @required
    muse: ecs.eid,
    // @required
    videoPlayer: ecs.eid,
  },
  add: (world, component) => {
    states.set(component.eid, {ready: false, shadowScale: 0, lastTime: -1})
    world.events.addListener(world.events.globalId, 'realityready', showLogo)
  },
  remove: (world, component) => {
    states.delete(component.eid)
  },
  tick: (world, component) => {
    const state = states.get(component.eid)
    const {muse, videoPlayer} = component.schema
    if (!state) {
      return
    }
    if (!state.ready) {
      setup(world, component.eid, muse, state)
      if (!state.ready) {
        return
      }
    }

    fitShadow(state)
    const meshes = prepareMuseMeshes(world, muse)

    state.video = state.video || findVideo(world.three.entityToObject.get(videoPlayer))
    if (!state.video) {
      return
    }
    // Muse's animation follows the video, as in the Unity and MindAR versions.
    const t = state.video.currentTime % CLIP_DURATION
    if (state.anim && t !== state.lastTime && applyAnimation(state.anim, meshes, t)) {
      state.lastTime = t
    }
    if (state.sweeps) {
      applySweeps(state.sweeps, t)
    }
    applyColors(state, meshes, t)
  },
})
