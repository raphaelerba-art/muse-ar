// Apple (first BD case): the animated content of Apple_GLB.c4d, rebuilt from apple.bin.
// Target space: the case (opening of the C4D Cube, 7 x 7 m) is the 1 x 1 image, +Z toward the
// viewer; the box goes back to z = -6/7. Baked by bake_apple.py, packed by pack_apple.py:
//   "APB1", uint32 n, n bytes of JSON (materials, meshes, offsets into the blob), blob.
// Mesh kinds: static (in target space), rigid (local points + one 4x4 per frame, 30 fps; also
// skinned meshes that one affine matrix per frame reproduces, with PoseMorph shapes as morph targets),
// deform (all deforming meshes merged, uint16 positions per frame, 15 fps, blended),
// variable (Boolean masks: their own points and triangles per 15 fps frame).

export const APPLE_FPS = 30

export const parseApple = (buffer: ArrayBuffer): any => {
  const view = new DataView(buffer)
  const magic = String.fromCharCode(...Array.from(new Uint8Array(buffer, 0, 4)))
  if (magic !== 'APB1') {
    throw new Error(`unexpected header ${magic}`)
  }
  const n = view.getUint32(4, true)
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 8, n)))
  return {...head, blob: buffer.slice(8 + n)}
}

export const createAppleScene = (THREE: any, data: any, options: any = {}) => {
  const {blob} = data
  const lit = options.lit !== false
  const materials = data.materials.map(({color, emissive}: any) => {
    // C4D adds luminance on top of the lit colour; keep the sum below 1 so whites do not clip
    // (the engine renders without tone mapping) and the shading stays visible.
    const keep = 1 - Math.max(...emissive)
    const params = {
      color: new THREE.Color(...color.map((c: number) => c * keep)),
      emissive: new THREE.Color(...emissive),
      side: THREE.DoubleSide,
    }
    return lit ? new THREE.MeshLambertMaterial(params) : new THREE.MeshBasicMaterial({color: params.color})
  })
  const group = new THREE.Group()
  group.name = 'apple'
  const updaters: ((t: number) => void)[] = []
  const meshes: any[] = []

  const indexArray = (m: any) => (m.indexSize === 2
    ? new Uint16Array(blob, m.index, m.indexCount)
    : new Uint32Array(blob, m.index, m.indexCount))

  const makeGeometry = (m: any) => {
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(blob, m.positions, m.vertices * 3).slice()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setIndex(new THREE.BufferAttribute(indexArray(m).slice(), 1))
    for (const g of m.groups) {
      geometry.addGroup(g.start, g.count, g.material)
    }
    return geometry
  }

  const addMesh = (geometry: any, material: any, name = '') => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    mesh.name = name
    group.add(mesh)
    meshes.push(mesh)
    return mesh
  }

  const frameOf = (t: number, frames: number) => Math.min(frames - 1, Math.max(0, Math.floor(t * APPLE_FPS + 1e-6)))

  for (const m of data.meshes) {
    if (m.kind === 'static') {
      let geometry = makeGeometry(m)
      if (m.flat) {
        geometry = geometry.toNonIndexed()
      }
      geometry.computeVertexNormals()
      const mesh = addMesh(geometry, materials, 'apple_box')
      mesh.castShadow = false
    } else if (m.kind === 'rigid') {
      const geometry = makeGeometry(m)
      geometry.computeVertexNormals()
      let weights: Float32Array | null = null
      if (m.morphCount) {
        // PoseMorph shapes (and other non-affine motion) as relative morph targets, with their
        // normals, driven by one weight per shape and frame.
        const base = geometry.attributes.position.array
        const baseNormals = geometry.attributes.normal.array
        const targets = new Float32Array(blob, m.morphTargets, m.morphCount * m.vertices * 3)
        const positions = []
        const normals = []
        for (let k = 0; k < m.morphCount; k++) {
          const delta = targets.slice(k * m.vertices * 3, (k + 1) * m.vertices * 3)
          const shape = geometry.clone()
          const moved = shape.attributes.position.array
          for (let i = 0; i < moved.length; i++) {
            moved[i] = base[i] + delta[i]
          }
          shape.computeVertexNormals()
          const n = shape.attributes.normal.array
          const dn = new Float32Array(n.length)
          for (let i = 0; i < n.length; i++) {
            dn[i] = n[i] - baseNormals[i]
          }
          shape.dispose()
          positions.push(new THREE.BufferAttribute(delta, 3))
          normals.push(new THREE.BufferAttribute(dn, 3))
        }
        geometry.morphAttributes.position = positions
        geometry.morphAttributes.normal = normals
        geometry.morphTargetsRelative = true
        weights = new Float32Array(blob, m.morphWeights, data.frames * m.morphCount)
      }
      const mesh = addMesh(geometry, materials, m.name)
      if (weights) {
        mesh.updateMorphTargets()
      }
      mesh.matrixAutoUpdate = false
      const mats = new Float32Array(blob, m.matrices, data.frames * 16)
      const vis = new Uint8Array(blob, m.visibility, data.frames)
      updaters.push((t: number) => {
        // matrices and morph weights are blended between the two nearest 30 fps frames
        const x = Math.min(data.frames - 1, Math.max(0, t * APPLE_FPS))
        const f = Math.floor(x + 1e-6)
        const f1 = Math.min(data.frames - 1, f + 1)
        const b = Math.max(0, x - f)
        mesh.visible = vis[f] > 0
        const e = mesh.matrix.elements
        for (let i = 0; i < 16; i++) {
          e[i] = mats[f * 16 + i] + (mats[f1 * 16 + i] - mats[f * 16 + i]) * b
        }
        mesh.matrixWorldNeedsUpdate = true
        if (weights) {
          const k = m.morphCount
          for (let j = 0; j < k; j++) {
            mesh.morphTargetInfluences[j] = weights[f * k + j] + (weights[f1 * k + j] - weights[f * k + j]) * b
          }
        }
      })
    } else if (m.kind === 'deform') {
      const geometry = makeGeometry(m)
      geometry.computeVertexNormals()
      const mesh = addMesh(geometry, materials)
      const frameBytes = 24 + m.vertices * 6
      const view = new DataView(blob, m.frames, frameBytes * m.frameCount)
      const out = geometry.attributes.position.array
      let last = -1
      updaters.push((t: number) => {
        const f = Math.min(m.frameCount - 1, Math.max(0, t * APPLE_FPS / m.frameStep))
        if (f === last) {
          return
        }
        last = f
        const f0 = Math.floor(f)
        const f1 = Math.min(m.frameCount - 1, f0 + 1)
        const b = f - f0
        const o0 = f0 * frameBytes
        const o1 = f1 * frameBytes
        const lo0 = [0, 1, 2].map(a => view.getFloat32(o0 + a * 4, true))
        const sc0 = [0, 1, 2].map(a => view.getFloat32(o0 + 12 + a * 4, true))
        const lo1 = [0, 1, 2].map(a => view.getFloat32(o1 + a * 4, true))
        const sc1 = [0, 1, 2].map(a => view.getFloat32(o1 + 12 + a * 4, true))
        const q0 = new Uint16Array(blob, m.frames + o0 + 24, m.vertices * 3)
        const q1 = new Uint16Array(blob, m.frames + o1 + 24, m.vertices * 3)
        for (let i = 0; i < m.vertices * 3; i++) {
          const a = i % 3
          const p0 = lo0[a] + q0[i] * sc0[a]
          const p1 = lo1[a] + q1[i] * sc1[a]
          out[i] = p0 + (p1 - p0) * b
        }
        geometry.attributes.position.needsUpdate = true
        geometry.computeVertexNormals()
      })
    } else if (m.kind === 'variable') {
      const mesh = addMesh(new THREE.BufferGeometry(), materials[m.material], m.name)
      const vis = new Uint8Array(blob, m.visibility, data.frames)
      const geometries = new Map<number, any>()
      let last = -1
      updaters.push((t: number) => {
        const f = Math.min(m.table.length - 1, Math.round(t * APPLE_FPS / m.frameStep))
        mesh.visible = vis[frameOf(t, data.frames)] > 0
        if (f === last) {
          return
        }
        last = f
        let geometry = geometries.get(f)
        if (!geometry) {
          const [po, count, to, indexCount] = m.table[f]
          const head = new Float32Array(blob, po, 6)
          const q = new Uint16Array(blob, po + 24, count * 3)
          const positions = new Float32Array(count * 3)
          for (let i = 0; i < count * 3; i++) {
            positions[i] = head[i % 3] + q[i] * head[3 + (i % 3)]
          }
          geometry = new THREE.BufferGeometry()
          geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
          geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(blob, to, indexCount).slice(), 1))
          geometry.computeVertexNormals()
          geometries.set(f, geometry)
        }
        mesh.geometry = geometry
      })
    }
  }

  const duration = (data.frames - 1) / APPLE_FPS
  const update = (t: number) => {
    for (const u of updaters) {
      u(t)
    }
  }
  update(0)
  return {group, update, duration, meshes, materials}
}

// Toon outline (inverted hull): a black copy of each mesh, pushed out along its normals and
// drawn from the back, so only a thin rim shows around the silhouette. `width` is in target
// space (image widths); it is converted to each mesh's own units.
export const addOutlines = (THREE: any, scene: any, width: number, keep: (name: string) => boolean) => {
  const outlines: any[] = []
  for (const mesh of scene.meshes) {
    if (!keep(mesh.name)) {
      continue
    }
    const scale = mesh.matrixAutoUpdate ? 1 : mesh.matrix.getMaxScaleOnAxis()
    const material = new THREE.MeshBasicMaterial({color: 0x000000, side: THREE.BackSide})
    const uniform = {value: width / (scale || 1)}
    material.onBeforeCompile = (shader: any) => {
      shader.uniforms.outlineWidth = uniform
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'uniform float outlineWidth;\nvoid main() {')
        .replace('#include <begin_vertex>',
          '#include <begin_vertex>\n\ttransformed += normalize(normal) * outlineWidth;')
    }
    const outline = new THREE.Mesh(mesh.geometry, material)
    outline.name = `${mesh.name}#outline`
    outline.frustumCulled = false
    outline.castShadow = false
    outline.receiveShadow = false
    if (mesh.morphTargetInfluences) {
      outline.updateMorphTargets()
      outline.morphTargetInfluences = mesh.morphTargetInfluences
    }
    // Follows the mesh: same matrix (child), same geometry, swapped when the mesh's is.
    outline.onBeforeRender = () => {
      if (outline.geometry !== mesh.geometry) {
        outline.geometry = mesh.geometry
      }
    }
    mesh.add(outline)
    outlines.push(outline)
  }
  return outlines
}
