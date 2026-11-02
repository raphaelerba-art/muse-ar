import * as ecs from '@8thwall/ecs'
import animBinUrl from '../assets/muse/muse_anim.bin'

// Same look as the MindAR web version (web/video.html) and the Unity app (MuseAR.cs):
// Muse's shadow on the video, and her animation driven by the video's playback time.
// Target space: the full square image is 1 x 1, +Z toward the viewer.

declare const THREE: any

const CLIP_DURATION = 8        // seconds, Muse-new.c4d frames 0-240 @ 30 fps
const SHADOW_OPACITY = 0.35

// Muse-new is deformed by a Spline Wrap and a Twist, which glTF can't express, so its final
// mesh is baked per frame (scratchpad bake_muse_new.py) into muse_anim.bin:
//   "MVA1", uint32 frames, float32 fps, uint32 vertices,
//   then per frame: float32 min[3], scale[3] + uint16 xyz per vertex.
// Vertex order: the "muse_white" mesh, then "muse_black", as in muse.glb.
const ANIM_MESHES = ['muse_white', 'muse_black']

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
    if (!state.video || !state.anim) {
      return
    }
    // Muse's animation follows the video, as in the Unity and MindAR versions.
    const t = state.video.currentTime % CLIP_DURATION
    if (t !== state.lastTime && applyAnimation(state.anim, meshes, t)) {
      state.lastTime = t
    }
  },
})
