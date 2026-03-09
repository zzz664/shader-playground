import type { TextureAsset } from './textureAsset'

export interface ModelBounds {
  min: [number, number, number]
  max: [number, number, number]
  center: [number, number, number]
  radius: number
}

export interface ModelTextureBinding {
  materialName: string
  textureAssetId: string
  fileName: string
  slot: 'diffuse'
}

export interface ModelAsset {
  id: string
  name: string
  vertices: Float32Array
  indices: Uint16Array | Uint32Array
  bounds: ModelBounds
  meshCount: number
  materialNames: string[]
  textureAssets: TextureAsset[]
  textureBindings: ModelTextureBinding[]
  warningMessages: string[]
}
