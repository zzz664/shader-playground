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
