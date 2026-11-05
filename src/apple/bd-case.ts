import * as ecs from '@8thwall/ecs'
import {parseApple, createAppleScene, addOutlines} from './apple-scene'

// A BD case (Apple, Idea) as a window onto a box dug into the page, rebuilt from the bake of its
// C4D scene (apple-scene.ts). Target space: the case (the opening of the Cube, 7 x 7 m) is the 1 x 1
// image, +Z toward the viewer; the box goes back to z = -6/7. Around the opening a depth-only
// occluder hides everything behind the page, so the scene is only seen through the case.

declare const THREE: any

const OCCLUDER_HALF = 6                // image widths; covers the page around the case
const BORDER = 0.006                   // black line around the case, as on the print
// Walls in the background colour of the print: that share of it glows, the rest is lit, so the
// walls read as the print's flat colour with a little shading and the characters' shadows.
const BOX_GLOW = 0.6
const SUN_INTENSITY = 0.55
const SUN_POSITION = [0.1, 2, 0.4]     // target space, high above the box (C4D Light)
const SUN_TARGET = [0, -0.5, -0.43]    // centre of the floor
const FILL_INTENSITY = 0.3   // plus the Muse space's own ambient + directional (0.15 each)
const SHADOW_HALF = 0.8
// Toon outline around everything but the bubble, the whiskers and the box; ?contour=0 turns
// it off, ?contour=<n> sets its width in thousandths of the case width.
const OUTLINE_WIDTH = 0.0025
const outlineWidth = () => {
  const v = new URLSearchParams(window.location.search).get('contour')
  return v === null ? OUTLINE_WIDTH : Number(v) / 1000
}
const hasOutline = (name: string) => name !== 'apple_box' && !name.startsWith('/Bulle1') &&
  !name.includes('moustache')

type State = {
  ready: boolean
  scene?: any
  sun?: any
  shadowScale: number
  time: number
  playing: boolean
  root?: any
}

// The cases look alike (same box, same cats), so the tracker can find two of them on one print.
// Two prints side by side both play; two cases found at the same place are one print seen twice,
// and only the first one found shows there.
const found = new Set<string>()
const where = new Map<string, any>()    // target -> world position of its case
const OVERLAP = 0.5                     // image widths between two centres for the same print

const visibleAt = (target: string, pos: any, width: number) => {
  for (const other of found) {
    if (other === target) {
      return true
    }
    const p = where.get(other)
    if (p && p.distanceTo(pos) < OVERLAP * width) {
      return false
    }
  }
  return false
}

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

// Sky / ground fill along the world's up axis, shared by all the cases.
let fillAdded = false
const addFill = (world: ecs.World) => {
  if (fillAdded) {
    return
  }
  fillAdded = true
  const fill = new THREE.HemisphereLight(0xffffff, 0xbbbbbb, FILL_INTENSITY)
  fill.position.set(0, 1, 0)
  world.three.scene.add(fill)
  fill.updateMatrixWorld(true)
  world.three.notifyChanged(fill)
}

const setup = (world: ecs.World, eid: ecs.Eid, state: State, binUrl: string, label: string,
  boxColor: string) => {
  const stage = world.three.entityToObject.get(eid)
  if (!stage) {
    return
  }
  state.ready = true
  // Everything of the case hangs under one group, hidden while another case has the page.
  const root = new THREE.Group()
  root.visible = false
  stage.add(root)
  state.root = root

  const {renderer} = world.three
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  // Depth only: drawn first, it keeps the camera image around the case and hides the box there.
  const occluder = new THREE.Mesh(ring(0.5, OCCLUDER_HALF), new THREE.MeshBasicMaterial({colorWrite: false}))
  occluder.renderOrder = -1
  root.add(occluder)

  const border = new THREE.Mesh(ring(0.5, 0.5 + BORDER),
    new THREE.MeshBasicMaterial({color: 0x111111, toneMapped: false}))
  border.position.z = 0.001
  root.add(border)

  const sun = new THREE.DirectionalLight(0xffffff, SUN_INTENSITY)
  sun.position.set(...SUN_POSITION)
  sun.target.position.set(...SUN_TARGET)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.bias = -0.0005
  root.add(sun, sun.target)
  state.sun = sun

  addFill(world)

  fetch(binUrl).then(r => r.arrayBuffer()).then((buffer) => {
    const scene = createAppleScene(THREE, parseApple(buffer))
    for (const mesh of scene.meshes) {
      if (mesh.name === 'apple_box') {
        const wall = new THREE.Color(boxColor)   // sRGB hex, as in the image
        mesh.material = new THREE.MeshLambertMaterial({
          color: wall.clone().multiplyScalar(1 - BOX_GLOW),
          emissive: wall.clone().multiplyScalar(BOX_GLOW),
          side: THREE.DoubleSide,
        })
      } else if (mesh.name.startsWith('/Bulle1')) {
        mesh.castShadow = false   // the speech bubble casts no shadow in the C4D render
      }
    }
    const width = outlineWidth()
    if (width > 0) {
      addOutlines(THREE, scene, width, hasOutline)
    }
    root.add(scene.group)
    world.three.notifyChanged(stage)
    state.scene = scene
  }).catch(err => console.error(label, err))

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

// One component per case: `name` goes on the entity that carries the image target `target`.
export const registerBdCase = (name: string, target: string, binUrl: string, boxColor: string) => {
  const states = new Map<ecs.Eid, State>()
  ecs.registerComponent({
    name,
    schema: {},
    add: (world, component) => {
      const state: State = {ready: false, shadowScale: 0, time: 0, playing: false}
      states.set(component.eid, state)
      // The case starts over each time it gets the page, and waits while it is out of view or
      // another case has the page.
      world.events.addListener(world.events.globalId, 'reality.imagefound', (e: any) => {
        if (e.data?.name === target) {
          found.add(target)
        }
      })
      world.events.addListener(world.events.globalId, 'reality.imagelost', (e: any) => {
        if (e.data?.name === target) {
          found.delete(target)
          where.delete(target)
        }
      })
    },
    remove: (world, component) => {
      states.delete(component.eid)
      found.delete(target)
      where.delete(target)
    },
    tick: (world, component) => {
      const state = states.get(component.eid)
      if (!state) {
        return
      }
      if (!state.ready) {
        setup(world, component.eid, state, binUrl, name, boxColor)
        if (!state.ready) {
          return
        }
      }
      fitShadow(state)
      const {root} = state
      root.updateWorldMatrix(true, false)
      const pos = (where.get(target) || new THREE.Vector3()).setFromMatrixPosition(root.matrixWorld)
      if (found.has(target)) {
        where.set(target, pos)
      }
      const on = found.has(target) && visibleAt(target, pos, root.matrixWorld.getMaxScaleOnAxis())
      if (on !== state.playing) {
        if (on) {
          state.time = 0
        }
        state.playing = on
        root.visible = on
        world.three.notifyChanged(root)
      }
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
}
