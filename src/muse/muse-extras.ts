import * as ecs from '@8thwall/ecs'
import trailBinUrl from '../assets/muse/trail.bin'

// Same look as the MindAR web version (web/video.html) and the Unity app (MuseAR.cs):
// Muse's shadow on the video and her hair trails, both driven by the video's playback time.
// Target space: the full square image is 1 x 1, +Z toward the viewer.

declare const THREE: any

const CLIP_DURATION = 8        // muse_anim length, in seconds
const SHADOW_OPACITY = 0.35

// From web/trail.json (baked by the C4D export).
const TRAIL_INFO = {
  frames: 481,
  points: 43,
  fps: 60,
  radius_cm: 5.0,
  amountKeys: [[0, 1], [20, 20]],
}

type State = {
  ready: boolean
  sun?: any
  shadowScale: number
  trailInfo?: typeof TRAIL_INFO
  trailData?: Float32Array
  trailMeshes: any[]
  lastTrailFrame: number
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

  // Hair trails (C4D Sweep + Tracer), rebuilt live from baked hair-vertex positions.
  // C4D cm (left-handed) -> glTF metres, under Muse's pivot like the model itself.
  const trailGroup = new THREE.Group()
  trailGroup.scale.set(0.01, 0.01, -0.01)
  muse.add(trailGroup)
  const trailMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff, side: THREE.DoubleSide, toneMapped: false,
  })

  fetch(trailBinUrl).then(r => r.arrayBuffer()).then((buffer) => {
    const info = TRAIL_INFO
    state.trailInfo = info
    state.trailData = new Float32Array(buffer)
    for (let i = 0; i < info.points; i++) {
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), trailMaterial)
      mesh.frustumCulled = false
      mesh.castShadow = true
      trailGroup.add(mesh)
      state.trailMeshes.push(mesh)
    }
    world.three.notifyChanged(trailGroup)
  }).catch(err => console.error('Muse trails:', err))

  world.three.notifyChanged(stage)
  world.three.notifyChanged(muse)
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
  world.three.entityToObject.get(museEid)?.traverse((o: any) => {
    if (o.isMesh) {
      o.castShadow = true
      o.frustumCulled = false
    }
  })
}

const updateTrails = (state: State, t: number) => {
  const {trailInfo: info, trailData: data} = state
  if (!info || !data) {
    return
  }
  const F = info.frames
  const P = info.points
  const f = Math.min(F - 1, Math.floor(t * info.fps))
  if (f === state.lastTrailFrame) {
    return
  }
  state.lastTrailFrame = f
  const [[f0, a0], [f1, a1]] = info.amountKeys
  const amount = Math.round(f <= f0 ? a0 : f >= f1 ? a1 : a0 + ((a1 - a0) * (f - f0)) / (f1 - f0))
  const start = Math.max(0, f - amount)
  for (let i = 0; i < P; i++) {
    const mesh = state.trailMeshes[i]
    mesh.geometry.dispose()
    if (f - start < 1) {
      mesh.geometry = new THREE.BufferGeometry()
      continue
    }
    const pts = []
    for (let k = start; k <= f; k++) {
      const o = (k * P + i) * 3
      pts.push(new THREE.Vector3(data[o], data[o + 1], data[o + 2]))
    }
    mesh.geometry = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(pts), pts.length * 2, info.radius_cm, 6, false
    )
  }
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
    states.set(component.eid, {
      ready: false, shadowScale: 0, trailMeshes: [], lastTrailFrame: -1,
    })
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
    prepareMuseMeshes(world, muse)

    state.video = state.video || findVideo(world.three.entityToObject.get(videoPlayer))
    if (!state.video) {
      return
    }
    // Muse's animation and the trails follow the video, as in the Unity and MindAR versions.
    const t = state.video.currentTime % CLIP_DURATION
    ecs.GltfModel.mutate(world, muse, (c) => {
      c.time = t
    })
    updateTrails(state, t)
  },
})
