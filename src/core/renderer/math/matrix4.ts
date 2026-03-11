export type Matrix4 = Float32Array

export function createIdentityMatrix4(): Matrix4 {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ])
}

export function createPerspectiveMatrix4(
  fovRadians: number,
  aspect: number,
  near: number,
  far: number,
): Matrix4 {
  const f = 1 / Math.tan(fovRadians * 0.5)
  const range = 1 / (near - far)

  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * range, -1,
    0, 0, 2 * far * near * range, 0,
  ])
}

export function createLookAtMatrix4(
  eye: [number, number, number],
  target: [number, number, number],
  up: [number, number, number],
): Matrix4 {
  const zAxis = normalizeVector3([
    eye[0] - target[0],
    eye[1] - target[1],
    eye[2] - target[2],
  ])
  const xAxis = normalizeVector3(crossVector3(up, zAxis))
  const yAxis = crossVector3(zAxis, xAxis)

  return new Float32Array([
    xAxis[0], yAxis[0], zAxis[0], 0,
    xAxis[1], yAxis[1], zAxis[1], 0,
    xAxis[2], yAxis[2], zAxis[2], 0,
    -dotVector3(xAxis, eye), -dotVector3(yAxis, eye), -dotVector3(zAxis, eye), 1,
  ])
}

export function createYRotationMatrix4(angleRadians: number): Matrix4 {
  const cosine = Math.cos(angleRadians)
  const sine = Math.sin(angleRadians)

  return new Float32Array([
    cosine, 0, -sine, 0,
    0, 1, 0, 0,
    sine, 0, cosine, 0,
    0, 0, 0, 1,
  ])
}

export function createXRotationMatrix4(angleRadians: number): Matrix4 {
  const cosine = Math.cos(angleRadians)
  const sine = Math.sin(angleRadians)

  return new Float32Array([
    1, 0, 0, 0,
    0, cosine, sine, 0,
    0, -sine, cosine, 0,
    0, 0, 0, 1,
  ])
}

export function createZRotationMatrix4(angleRadians: number): Matrix4 {
  const cosine = Math.cos(angleRadians)
  const sine = Math.sin(angleRadians)

  return new Float32Array([
    cosine, sine, 0, 0,
    -sine, cosine, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ])
}

export function createEulerRotationMatrix4(
  rotation: { x: number; y: number; z: number },
): Matrix4 {
  return multiplyMatrix4(
    createYRotationMatrix4(rotation.y),
    multiplyMatrix4(
      createXRotationMatrix4(rotation.x),
      createZRotationMatrix4(rotation.z),
    ),
  )
}

export function createTranslationMatrix4(
  x: number,
  y: number,
  z: number,
): Matrix4 {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1,
  ])
}

export function multiplyMatrix4(left: Matrix4, right: Matrix4): Matrix4 {
  const result = new Float32Array(16)

  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      result[column * 4 + row] =
        left[0 * 4 + row] * right[column * 4 + 0] +
        left[1 * 4 + row] * right[column * 4 + 1] +
        left[2 * 4 + row] * right[column * 4 + 2] +
        left[3 * 4 + row] * right[column * 4 + 3]
    }
  }

  return result
}

export function transformDirectionByMatrix4(
  matrix: Matrix4,
  vector: [number, number, number],
): [number, number, number] {
  return [
    matrix[0] * vector[0] + matrix[4] * vector[1] + matrix[8] * vector[2],
    matrix[1] * vector[0] + matrix[5] * vector[1] + matrix[9] * vector[2],
    matrix[2] * vector[0] + matrix[6] * vector[1] + matrix[10] * vector[2],
  ]
}

export function extractEulerRotationFromMatrix4(
  matrix: Matrix4,
): { x: number; y: number; z: number } {
  const clamp = (value: number) => Math.max(-1, Math.min(1, value))
  const x = Math.asin(clamp(-matrix[9]))
  const cosX = Math.cos(x)

  if (Math.abs(cosX) > 0.00001) {
    return {
      x,
      y: Math.atan2(matrix[8], matrix[10]),
      z: Math.atan2(matrix[1], matrix[5]),
    }
  }

  return {
    x,
    y: Math.atan2(-matrix[2], matrix[0]),
    z: 0,
  }
}

function normalizeVector3(vector: [number, number, number]): [number, number, number] {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1
  return [vector[0] / length, vector[1] / length, vector[2] / length]
}

function crossVector3(
  a: [number, number, number],
  b: [number, number, number],
): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

function dotVector3(a: [number, number, number], b: [number, number, number]) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
