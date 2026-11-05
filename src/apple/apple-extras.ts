import * as ecs from '@8thwall/ecs'
import appleBinUrl from '../assets/apple/apple.bin'
import {parseApple, createAppleScene} from './apple-scene'

// Apple, first case of the BD: the case is a window onto a box dug into the page.
// Target space: the case (the opening of the Cube of Apple_GLB.c4d, 7 x 7 m) is the 1 x 1
// image, +Z toward the viewer; the box goes back to z = -6/7. Around the opening a depth-only
// occluder hides everything behind the page, so the scene is only seen through the case.

declare const THREE: any

const TARGET_NAME = 'cible_apple'
const OCCLUDER_HALF = 6                // image widths; covers the page around the case
const BORDER = 0.006                   // black line around the case, as on the print
const BOX_COLOR = 0.4                   // lit part of the walls
const BOX_EMISSIVE = 0.45              // walls stay near white, as in the C4D render
const SUN_INTENSITY = 0.55
const SUN_POSITION = [0.1, 2, 0.4]     // target space, high above the box (C4D Light)
const SUN_TARGET = [0, -0.5, -0.43]    // centre of the floor
const FILL_INTENSITY = 0.3   // plus the Muse space's own ambient + directional (0.15 each)
const SHADOW_HALF = 0.8

type State = {
  ready: boolean
  scene?: any
  sun?: any
  shadowScale: number
  time: number
  playing: boolean
}

const states = new Map<ecs.Eid, State>()

const square = (half: number) => {
  const path = new THREE.Shape()
  path.moveTo(-half, -half)
  path.lineTo(half, -half)
  path.lineTo(half, half)
  path.lineTo(-half, half)
  path.closePath()
  return path
}

// Square ring between `inner` and `outer` half sizes (the hole is wound the other way).
const ring = (inner: number, outer: number) => {
  const shape = square(outer)
  const hole = new THREE.Path()
  hole.moveTo(-inner, -inner)
  hole.lineTo(-inner, inner)
  hole.lineTo(inner, inner)
  hole.lineTo(inner, -inner)
  hole.closePath()
  shape.holes.push(hole)
  return new THREE.ShapeGeometry(shape)
}

const setup = (world: ecs.World, eid: ecs.Eid, state: State) => {
  const stage = world.three.entityToObject.get(eid)
  if (!stage) {
    return
  }
  state.ready = true

  const {renderer} = world.three
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  // Depth only: drawn first, it keeps the camera image around the case and hides the box there.
  const occluder = new THREE.Mesh(ring(0.5, OCCLUDER_HALF), new THREE.MeshBasicMaterial({colorWrite: false}))
  occluder.renderOrder = -1
  stage.add(occluder)

  const border = new THREE.Mesh(ring(0.5, 0.5 + BORDER),
    new THREE.MeshBasicMaterial({color: 0x111111, toneMapped: false}))
  border.position.z = 0.001
  stage.add(border)

  const sun = new THREE.DirectionalLight(0xffffff, SUN_INTENSITY)
  sun.position.set(...SUN_POSITION)
  sun.target.position.set(...SUN_TARGET)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.bias = -0.0005
  stage.add(sun, sun.target)
  state.sun = sun

  // Sky / ground fill along the world's up axis.
  const fill = new THREE.HemisphereLight(0xffffff, 0xbbbbbb, FILL_INTENSITY)
  fill.position.set(0, 1, 0)
  world.three.scene.add(fill)
  fill.updateMatrixWorld(true)
  world.three.notifyChanged(fill)

  fetch(appleBinUrl).then(r => r.arrayBuffer()).then((buffer) => {
    const scene = createAppleScene(THREE, parseApple(buffer))
    for (const mesh of scene.meshes) {
      if (mesh.name === 'apple_box') {
        mesh.material = new THREE.MeshLambertMaterial({
          color: new THREE.Color().setScalar(BOX_COLOR),
          emissive: new THREE.Color().setScalar(BOX_EMISSIVE),
          side: THREE.DoubleSide,
        })
      } else if (mesh.name.startsWith('/Bulle1')) {
        mesh.castShadow = false   // the speech bubble casts no shadow in the C4D render
      }
    }
    stage.add(scene.group)
    world.three.notifyChanged(stage)
    state.scene = scene
  }).catch(err => console.error('Apple:', err))

  world.three.notifyChanged(stage)
}

const fitShadow = (state: State) => {
  const {sun} = state
  const k = sun.parent.matrixWorld.getMaxScaleOnAxis()
  if (!k || Math.abs(k - state.shadowScale) < state.shadowScale * 0.01) {
    return
  }
  state.shadowScale = k
  const half = SHADOW_HALF * k
  Object.assign(sun.shadow.camera, {
    left: -half, right: half, top: half, bottom: -half, near: 0.1 * k, far: 5 * k,
  })
  sun.shadow.camera.updateProjectionMatrix()
}

ecs.registerComponent({
  name: 'Apple Extras',
  schema: {},
  add: (world, component) => {
    const state: State = {ready: false, shadowScale: 0, time: 0, playing: true}
    states.set(component.eid, state)
    // The case starts over each time it is found again, and waits while it is out of view.
    world.events.addListener(world.events.globalId, 'reality.imagefound', (e: any) => {
      if (e.data?.name === TARGET_NAME) {
        state.time = 0
        state.playing = true
      }
    })
    world.events.addListener(world.events.globalId, 'reality.imagelost', (e: any) => {
      if (e.data?.name === TARGET_NAME) {
        state.playing = false
      }
    })
  },
  remove: (world, component) => {
    states.delete(component.eid)
  },
  tick: (world, component) => {
    const state = states.get(component.eid)
    if (!state) {
      return
    }
    if (!state.ready) {
      setup(world, component.eid, state)
      if (!state.ready) {
        return
      }
    }
    fitShadow(state)
    const {scene} = state
    if (!scene) {
      return
    }
    if (state.playing) {
      state.time = (state.time + world.time.delta / 1000) % scene.duration
    }
    scene.update(state.time)
  },
})
