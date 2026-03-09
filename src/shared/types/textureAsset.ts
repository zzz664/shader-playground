export type TextureAssetSourceKind = 'manual' | 'model'

export interface TextureAsset {
  id: string
  fileName: string
  mimeType: string
  width: number
  height: number
  previewUrl: string
  sourceDataUrl: string
  sourceKind: TextureAssetSourceKind
  ownerModelId: string | null
  bitmap: ImageBitmap
}

export interface TextureLoadResult {
  asset: TextureAsset
}
