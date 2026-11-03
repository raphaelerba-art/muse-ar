import * as ecs from '@8thwall/ecs'
import animBinUrl from '../assets/tremplin/tremplin_anim.bin'
import sweepsBinUrl from '../assets/tremplin/tremplin_sweeps.bin'
import {
  parseAnimation, parseSweeps, applySweeps, VertexAnimation, SweepAnimation,
} from '../muse/muse-extras'

// Tremplin (seesaw) standing on its image target: the image is the ground, kept invisible,
// only the shadow is drawn on it. Target space: the full square image is 1 x 1, +Z out of it.
// The entity holding tremplin.glb maps the C4D scene onto it (rotX +90°, scale 1/8: 8 m = image).

declare const THREE: any

const CLIP_DURATION = 6        // seconds, tremplin.c4d frames 0-180 @ 30 fps
const SHADOW_OPACITY = 0.35
const CATCHER_SIZE = 2         // image widths; the jumps throw shadows past the image edges
// Shading: a strong sun over weak scene lights (Muse space: ambient 0.35, directional 0.4),
// off-white instead of pure white and dim reflections, so the white bodies keep their volume.
const SUN_INTENSITY = 2
const OFF_WHITE = 0.85
const ENV_INTENSITY = 0.3

// tremplin.c4d (deformers, Cloth Surface, constraints, XPresso) is baked per frame by
// scratchpad bake_tremplin.py into tremplin_anim.bin (MVA1, as Muse), vertices in the order of
// the meshes tremplin_0, tremplin_1... of tremplin.glb; Tracer trails into tremplin_sweeps.bin.

type State = {
  ready: boolean
  sun?: any
  shadowScale: number
  anim?: VertexAnimation
  sweeps?: SweepAnimation
  time: number
  lastTime: number
}

const states = new Map<ecs.Eid, State>()

const setup = (world: ecs.World, eid: ecs.Eid, tremplinEid: ecs.Eid, state: State) => {
  const stage = world.three.entityToObject.get(eid)
  const tremplin = world.three.entityToObject.get(tremplinEid)
  if (!stage || !tremplin) {
    return
  }

  const {renderer} = world.three
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  // Transparent ground on the image: only the shadow shows.
  const catcher = new THREE.Mesh(
    new THREE.PlaneGeometry(CATCHER_SIZE, CATCHER_SIZE),
    new THREE.ShadowMaterial({opacity: SHADOW_OPACITY})
  )
  catcher.position.z = 0.001
  catcher.receiveShadow = true
  stage.add(catcher)

  // Sun high above the image; its frustum is refitted to the target's world scale each frame.
  const sun = new THREE.DirectionalLight(0xffffff, SUN_INTENSITY)
  sun.position.set(0.3, 0.5, 2)
  sun.target.position.set(0, 0, 0)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.bias = -0.0005
  stage.add(sun, sun.target)
  state.sun = sun

  fetch(animBinUrl).then(r => r.arrayBuffer()).then((buffer) => {
    state.anim = parseAnimation(buffer)
  }).catch(err => console.error('Tremplin animation:', err))

  const sweepGroup = new THREE.Group()
  tremplin.add(sweepGroup)
  const sweepMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff, side: THREE.DoubleSide, toneMapped: false,
  })
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
  }).catch(err => console.error('Tremplin sweeps:', err))

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
  const half = 0.5 * CATCHER_SIZE * k
  Object.assign(sun.shadow.camera, {
    left: -half, right: half, top: half, bottom: -half, near: 0.1 * k, far: 5 * k,
  })
  sun.shadow.camera.updateProjectionMatrix()
}

// The glTF loads asynchronously and the engine may rebuild it, so this is re-applied every frame.
const prepareMeshes = (world: ecs.World, tremplinEid: ecs.Eid) => {
  const meshes = []
  world.three.entityToObject.get(tremplinEid)?.traverse((o: any) => {
    const match = o.isMesh && /^tremplin_(\d+)$/.exec(o.name)
    if (match) {
      o.castShadow = true
      o.frustumCulled = false
      // The bake has no normals (they change every frame): smooth ones are computed below.
      const {material} = o
      if (material.isMeshStandardMaterial && !material.userData.tremplinLook) {
        material.userData.tremplinLook = true
        material.flatShading = false
        material.envMapIntensity = ENV_INTENSITY
        if (material.color.r > 0.9 && material.color.g > 0.9 && material.color.b > 0.9) {
          material.color.setScalar(OFF_WHITE)
        }
        material.needsUpdate = true
      }
      meshes[Number(match[1])] = o
    }
  })
  return meshes
}

// Writes the baked positions at time t (linear blend between the two nearest baked frames).
const applyAnimation = (anim: VertexAnimation, meshes: any[], t: number) => {
  if (!meshes.length || meshes.some(m => !m)) {
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
  for (const mesh of meshes) {
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
    mesh.geometry.computeVertexNormals()
    mesh.geometry.computeBoundingSphere()
  }
  return true
}

ecs.registerComponent({
  name: 'Tremplin Extras',
  schema: {
    // @required
    tremplin: ecs.eid,
  },
  add: (world, component) => {
    states.set(component.eid, {ready: false, shadowScale: 0, time: 0, lastTime: -1})
  },
  remove: (world, component) => {
    states.delete(component.eid)
  },
  tick: (world, component) => {
    const state = states.get(component.eid)
    const {tremplin} = component.schema
    if (!state) {
      return
    }
    if (!state.ready) {
      setup(world, component.eid, tremplin, state)
      if (!state.ready) {
        return
      }
    }

    fitShadow(state)
    const meshes = prepareMeshes(world, tremplin)

    state.time = (state.time + world.time.delta / 1000) % CLIP_DURATION
    const t = state.time
    if (state.anim && t !== state.lastTime && applyAnimation(state.anim, meshes, t)) {
      state.lastTime = t
    }
    if (state.sweeps) {
      applySweeps(state.sweeps, t)
    }
  },
})
