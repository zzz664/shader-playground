export type SceneMode = 'screen' | 'model'

export type GeometryPreviewId = 'plane' | 'cube' | 'sphere'

export type BlendPreset = 'opaque' | 'alpha' | 'additive'

export interface BlendPresetState {
  src: BlendPreset
  dst: BlendPreset
}

export const defaultBlendPresetState: BlendPresetState = {
  src: 'opaque',
  dst: 'opaque',
}

export const defaultPostProcessEnabled = true

export type ResolutionScale = 0.5 | 0.75 | 1

export interface ViewportCameraState {
  yaw: number
  pitch: number
  distance: number
}

export interface TransformVector3 {
  x: number
  y: number
  z: number
}

export interface ModelTransformState {
  position: TransformVector3
  rotation: TransformVector3
}

export const defaultModelTransformState: ModelTransformState = {
  position: {
    x: 0,
    y: 1,
    z: 0,
  },
  rotation: {
    x: 0,
    y: 0,
    z: 0,
  },
}
