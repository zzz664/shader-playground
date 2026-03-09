import type { MaterialPropertyValue } from './materialProperty'
import type { ModelBounds, ModelTextureBinding } from './modelAsset'
import type { BlendMode, GeometryPreviewId, SceneMode, ViewportCameraState } from './scenePreview'
import type { TextureAssetSourceKind } from './textureAsset'

export interface SerializedTextureAsset {
  id: string
  fileName: string
  mimeType: string
  width: number
  height: number
  sourceDataUrl: string
  sourceKind: TextureAssetSourceKind
  ownerModelId: string | null
}

export interface SerializedModelAsset {
  id: string
  name: string
  vertices: number[]
  indices: number[]
  indexFormat: 'uint16' | 'uint32'
  bounds: ModelBounds
  meshCount: number
  materialNames: string[]
  textureBindings: ModelTextureBinding[]
  textureAssetIds: string[]
  warningMessages: string[]
}

export interface ProjectSnapshot {
  version: 1
  savedAt: string
  vertexSource: string
  fragmentSource: string
  sceneMode: SceneMode
  geometryId: GeometryPreviewId
  blendMode: BlendMode
  cameraState: ViewportCameraState
  materialValues: Record<string, MaterialPropertyValue>
  textureAssets: SerializedTextureAsset[]
  modelAsset: SerializedModelAsset | null
}
