import type { GeometryPreviewId } from '../../../shared/types/scenePreview'

export interface PrimitiveMeshData {
  vertices: Float32Array
  indices: Uint16Array
}

const STRIDE = 8

export function getPrimitiveMeshData(geometryId: GeometryPreviewId): PrimitiveMeshData {
  switch (geometryId) {
    case 'plane':
      return createPlaneMesh()
    case 'cube':
      return createCubeMesh()
    case 'sphere':
      return createSphereMesh(24, 16)
  }
}

export function createScreenQuadMesh(): PrimitiveMeshData {
  return {
    vertices: new Float32Array([
      -1, -1, 0, 0, 0, 1, 0, 0,
      1, -1, 0, 0, 0, 1, 1, 0,
      1, 1, 0, 0, 0, 1, 1, 1,
      -1, 1, 0, 0, 0, 1, 0, 1,
    ]),
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
  }
}

function createPlaneMesh(): PrimitiveMeshData {
  return {
    vertices: new Float32Array([
      -1, -1, 0, 0, 0, 1, 0, 0,
      1, -1, 0, 0, 0, 1, 1, 0,
      1, 1, 0, 0, 0, 1, 1, 1,
      -1, 1, 0, 0, 0, 1, 0, 1,
    ]),
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
  }
}

function createCubeMesh(): PrimitiveMeshData {
  const vertices = new Float32Array([
    -1, -1, 1, 0, 0, 1, 0, 0,
    1, -1, 1, 0, 0, 1, 1, 0,
    1, 1, 1, 0, 0, 1, 1, 1,
    -1, 1, 1, 0, 0, 1, 0, 1,

    1, -1, -1, 0, 0, -1, 0, 0,
    -1, -1, -1, 0, 0, -1, 1, 0,
    -1, 1, -1, 0, 0, -1, 1, 1,
    1, 1, -1, 0, 0, -1, 0, 1,

    -1, 1, 1, 0, 1, 0, 0, 0,
    1, 1, 1, 0, 1, 0, 1, 0,
    1, 1, -1, 0, 1, 0, 1, 1,
    -1, 1, -1, 0, 1, 0, 0, 1,

    -1, -1, -1, 0, -1, 0, 0, 0,
    1, -1, -1, 0, -1, 0, 1, 0,
    1, -1, 1, 0, -1, 0, 1, 1,
    -1, -1, 1, 0, -1, 0, 0, 1,

    1, -1, 1, 1, 0, 0, 0, 0,
    1, -1, -1, 1, 0, 0, 1, 0,
    1, 1, -1, 1, 0, 0, 1, 1,
    1, 1, 1, 1, 0, 0, 0, 1,

    -1, -1, -1, -1, 0, 0, 0, 0,
    -1, -1, 1, -1, 0, 0, 1, 0,
    -1, 1, 1, -1, 0, 0, 1, 1,
    -1, 1, -1, -1, 0, 0, 0, 1,
  ])

  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3,
    4, 5, 6, 4, 6, 7,
    8, 9, 10, 8, 10, 11,
    12, 13, 14, 12, 14, 15,
    16, 17, 18, 16, 18, 19,
    20, 21, 22, 20, 22, 23,
  ])

  return { vertices, indices }
}

function createSphereMesh(longitudeSegments: number, latitudeSegments: number): PrimitiveMeshData {
  const vertices: number[] = []
  const indices: number[] = []

  for (let latitude = 0; latitude <= latitudeSegments; latitude += 1) {
    const v = latitude / latitudeSegments
    const phi = v * Math.PI
    const sinPhi = Math.sin(phi)
    const cosPhi = Math.cos(phi)

    for (let longitude = 0; longitude <= longitudeSegments; longitude += 1) {
      const u = longitude / longitudeSegments
      const theta = u * Math.PI * 2
      const sinTheta = Math.sin(theta)
      const cosTheta = Math.cos(theta)
      const x = cosTheta * sinPhi
      const y = cosPhi
      const z = sinTheta * sinPhi

      vertices.push(x, y, z, x, y, z, u, 1 - v)
    }
  }

  const rowLength = longitudeSegments + 1

  for (let latitude = 0; latitude < latitudeSegments; latitude += 1) {
    for (let longitude = 0; longitude < longitudeSegments; longitude += 1) {
      const a = latitude * rowLength + longitude
      const b = a + rowLength
      const c = b + 1
      const d = a + 1

      indices.push(a, b, d, b, c, d)
    }
  }

  return {
    vertices: new Float32Array(vertices),
    indices: new Uint16Array(indices),
  }
}

export const PRIMITIVE_VERTEX_STRIDE = STRIDE * Float32Array.BYTES_PER_ELEMENT
