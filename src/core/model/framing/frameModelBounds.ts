import type { ModelBounds } from '../../../shared/types/modelAsset'

export interface FramedModelState {
  center: [number, number, number]
  radius: number
  distance: number
  near: number
  far: number
}

export function frameModelBounds(bounds: ModelBounds, fovRadians = Math.PI / 3): FramedModelState {
  const radius = Math.max(bounds.radius, 0.5)
  const distance = Math.max(radius / Math.tan(fovRadians * 0.5) * 1.35, 2.2)

  return {
    center: bounds.center,
    radius,
    distance,
    near: Math.max(distance - radius * 2.5, 0.05),
    far: distance + radius * 2.5,
  }
}
