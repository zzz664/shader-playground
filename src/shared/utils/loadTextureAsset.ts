import type { TextureAsset, TextureLoadResult } from '../types/textureAsset'

function createTextureAssetId() {
  return `texture-${crypto.randomUUID()}`
}

export async function loadTextureAsset(file: File): Promise<TextureLoadResult> {
  if (!file.type.startsWith('image/')) {
    throw new Error('이미지 파일만 업로드할 수 있습니다.')
  }

  const previewUrl = URL.createObjectURL(file)

  try {
    const bitmap = await createImageBitmap(file)

    const asset: TextureAsset = {
      id: createTextureAssetId(),
      fileName: file.name,
      mimeType: file.type,
      width: bitmap.width,
      height: bitmap.height,
      previewUrl,
      bitmap,
    }

    return { asset }
  } catch (error) {
    URL.revokeObjectURL(previewUrl)
    throw error instanceof Error ? error : new Error('텍스처를 디코딩하지 못했습니다.')
  }
}
