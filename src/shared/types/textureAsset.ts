export interface TextureAsset {
  id: string
  fileName: string
  mimeType: string
  width: number
  height: number
  previewUrl: string
  bitmap: ImageBitmap
}

export interface TextureLoadResult {
  asset: TextureAsset
}
