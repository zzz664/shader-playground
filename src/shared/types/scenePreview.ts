export type SceneMode = 'screen' | 'model'

export type GeometryPreviewId = 'plane' | 'cube' | 'sphere'

export interface ViewportCameraState {
  yaw: number
  pitch: number
  distance: number
}
