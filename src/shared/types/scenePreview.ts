export type SceneMode = 'screen' | 'model'

export type GeometryPreviewId = 'plane' | 'cube' | 'sphere'

export type BlendMode = 'opaque' | 'alpha' | 'additive'

export type ResolutionScale = 0.5 | 0.75 | 1

export interface ViewportCameraState {
  yaw: number
  pitch: number
  distance: number
}
