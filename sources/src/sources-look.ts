import * as ecs from '@8thwall/ecs'

// Shows the architecture model with its baked lighting (vertex colors from bake.py)
// as unlit materials, with see-through glass and a stable depth buffer.

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

  renderer.toneMapping = THREE.NoToneMapping
  renderer.outputColorSpace = THREE.SRGBColorSpace

  // Lighting is baked into the vertex colors (COLOR_0): render unlit, which is also cheaper.
  model.traverse((o: any) => {
    if (!o.isMesh) {
      return
    }
    const baked = !!o.geometry.attributes.color
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    const unlit = mats.map((mat: any) => {
      const glass = GLASS.test(mat.name || '') || mat.transparent
      const basic = new THREE.MeshBasicMaterial({
        name: mat.name,
        map: mat.map,
        color: mat.color,
        side: mat.side,
        alphaTest: mat.alphaTest,
        vertexColors: baked,
        transparent: glass,
        opacity: glass ? 0.18 : mat.opacity,
        depthWrite: !glass,
      })
      if (!baked && !glass) {
        basic.color = mat.color.clone().multiplyScalar(0.8)
      }
      return basic
    })
    o.material = Array.isArray(o.material) ? unlit : unlit[0]
    if (new THREE.Box3().setFromObject(o).min.y > CEILING_MIN_Y) {
      // SketchUp ceilings often have coplanar faces that flicker: push them apart in depth.
      for (const mat of unlit) {
        Object.assign(mat, {polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 4})
      }
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
