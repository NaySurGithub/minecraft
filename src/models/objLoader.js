import * as THREE from 'three'

// Minimal OBJ parser -> non-indexed THREE.BufferGeometry.
// Supports: v, vn, vt, f (with v, v/vt, v//vn, v/vt/vn and negative indices).
// Polygons are triangulated with a simple fan. If the OBJ provides no normals,
// they are computed from face geometry.
export function parseOBJ(text) {
  const positions = []
  const texcoords = []
  const normals = []

  const outPos = []
  const outUV = []
  const outNorm = []
  let hasNormals = false
  let hasUV = false

  const lines = text.split(/\r?\n/)

  const resolveIndex = (raw, listLen) => {
    // OBJ indices are 1-based; negative indices count from the end.
    let i = parseInt(raw, 10)
    if (Number.isNaN(i)) return -1
    if (i < 0) i = listLen / 3 + i + 1
    return i - 1
  }
  const resolveUVIndex = (raw, listLen) => {
    let i = parseInt(raw, 10)
    if (Number.isNaN(i)) return -1
    if (i < 0) i = listLen / 2 + i + 1
    return i - 1
  }

  const pushVertex = (vert) => {
    // vert is "v", "v/vt", "v//vn", or "v/vt/vn"
    const parts = vert.split('/')
    const pi = resolveIndex(parts[0], positions.length)
    if (pi >= 0) {
      outPos.push(positions[pi * 3], positions[pi * 3 + 1], positions[pi * 3 + 2])
    } else {
      outPos.push(0, 0, 0)
    }
    if (parts.length >= 2 && parts[1] !== '') {
      const ti = resolveUVIndex(parts[1], texcoords.length)
      if (ti >= 0) {
        outUV.push(texcoords[ti * 2], texcoords[ti * 2 + 1])
        hasUV = true
      } else {
        outUV.push(0, 0)
      }
    } else {
      outUV.push(0, 0)
    }
    if (parts.length >= 3 && parts[2] !== '') {
      const ni = resolveIndex(parts[2], normals.length)
      if (ni >= 0) {
        outNorm.push(normals[ni * 3], normals[ni * 3 + 1], normals[ni * 3 + 2])
        hasNormals = true
      } else {
        outNorm.push(0, 0, 0)
      }
    } else {
      outNorm.push(0, 0, 0)
    }
  }

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li].trim()
    if (line === '' || line[0] === '#') continue
    const parts = line.split(/\s+/)
    const tag = parts[0]
    if (tag === 'v') {
      positions.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]))
    } else if (tag === 'vt') {
      texcoords.push(parseFloat(parts[1]), parseFloat(parts[2] || '0'))
    } else if (tag === 'vn') {
      normals.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]))
    } else if (tag === 'f') {
      const verts = parts.slice(1)
      // Fan-triangulate: (0, i, i+1)
      for (let i = 1; i + 1 < verts.length; i++) {
        pushVertex(verts[0])
        pushVertex(verts[i])
        pushVertex(verts[i + 1])
      }
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(outPos, 3))
  if (hasUV) {
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(outUV, 2))
  }
  if (hasNormals) {
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(outNorm, 3))
  } else {
    geometry.computeVertexNormals()
  }
  geometry.computeBoundingSphere()
  return geometry
}
