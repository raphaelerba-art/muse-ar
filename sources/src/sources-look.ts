import * as ecs from '@8thwall/ecs'

// Makes the architecture model look less flat: filmic tone mapping, a soft indoor
// environment for lighting and reflections, a sun with shadows, and glass materials.

const GLASS = /glass|verre|vitr|window|fen[eê]tre|translucent/i

const CEILING_MIN_Y = 2.1  // meters above the floor

const done = new Set<ecs.Eid>()

// A near plane at 1 cm wastes depth precision over a whole building (z-fighting).
const fixNearPlane = (scene: any) => {
  scene.traverse((o: any) => {
    if (o.isPerspectiveCamera && o.near < 0.1) {
      o.near = 0.1
      o.updateProjectionMatrix()
    }
  })
}

const buildRoomEnvironment = (THREE: any, renderer: any) => {
  // A bright room with a few light panels, rendered into a prefiltered env map.
  const room = new THREE.Scene()
  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(10, 6, 10),
    new THREE.MeshBasicMaterial({color: 0x9a9590, side: THREE.BackSide})
  )
  walls.position.y = 2
  room.add(walls)
  const panel = (w: number, h: number, x: number, y: number, z: number, ry: number, rx: number, k: number) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({color: new THREE.Color(k, k * 0.97, k * 0.92)})
    )
    m.position.set(x, y, z)
    m.rotation.set(rx, ry, 0)
    room.add(m)
  }
  panel(6, 3, 0, 2.5, -4.9, 0, 0, 6)  // big window
  panel(3, 2, 4.9, 2, 0, -Math.PI / 2, 0, 3)
  panel(4, 4, 0, 4.9, 0, 0, Math.PI / 2, 2.5)  // ceiling bounce
  const pmrem = new THREE.PMREMGenerator(renderer)
  const env = pmrem.fromScene(room, 0.04).texture
  pmrem.dispose()
  return env
}

const setup = (world: ecs.World, eid: ecs.Eid) => {
  const THREE = (window as any).THREE
  const model = world.three.entityToObject.get(eid)
  const {renderer, scene} = world.three as any
  if (!THREE || !model || !renderer || !scene) {
    return false
  }
  let meshCount = 0
  model.traverse((o: any) => {
    if (o.isMesh) {
      meshCount++
    }
  })
  if (!meshCount) {
    return false  // glTF not loaded yet
  }

  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.1
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  scene.environment = buildRoomEnvironment(THREE, renderer)

  const sun = new THREE.DirectionalLight(0xfff1dd, 3.2)
  sun.position.set(6, 9, 4)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, {left: -12, right: 12, top: 12, bottom: -12, near: 0.5, far: 40})
  sun.shadow.bias = -0.0005
  sun.shadow.normalBias = 0.02
  scene.add(sun)

  model.updateMatrixWorld(true)
  const box = new THREE.Box3()
  model.traverse((o: any) => {
    if (!o.isMesh) {
      return
    }
    box.setFromObject(o)
    // Ceiling and roof would keep the whole interior in shadow: let the sun through them.
    const overhead = box.min.y > CEILING_MIN_Y
    o.castShadow = !overhead
    o.receiveShadow = true
    if (overhead) {
      // SketchUp ceilings often have coplanar faces that flicker: push them apart in depth.
      for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
        Object.assign(mat, {polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 4})
      }
    }
    for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!mat) {
        continue
      }
      mat.envMapIntensity = 0.6
      if (GLASS.test(mat.name || '') || GLASS.test(o.name || '')) {
        Object.assign(mat, {transparent: true, opacity: 0.2, roughness: 0.05, metalness: 0, depthWrite: false})
      } else if (mat.roughness !== undefined && mat.roughness >= 1) {
        mat.roughness = 0.85  // SketchUp exports everything fully rough
      }
      mat.needsUpdate = true
    }
  })
  world.three.notifyChanged(model)
  return true
}

ecs.registerComponent({
  name: 'Sources Look',
  add: (world, component) => {
    done.delete(component.eid)
  },
  remove: (world, component) => {
    done.delete(component.eid)
  },
  tick: (world, component) => {
    fixNearPlane((world.three as any).scene)
    if (!done.has(component.eid) && setup(world, component.eid)) {
      done.add(component.eid)
    }
  },
})
