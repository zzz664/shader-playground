import type { TextureAsset, TextureLoadResult } from '../types/textureAsset'

function createTextureAssetId() {
  return `texture-${crypto.randomUUID()}`
}

function inferMimeType(fileName: string) {
  const normalizedName = fileName.toLowerCase()

  if (normalizedName.endsWith('.png')) {
    return 'image/png'
  }
  if (normalizedName.endsWith('.jpg') || normalizedName.endsWith('.jpeg')) {
    return 'image/jpeg'
  }
  if (normalizedName.endsWith('.webp')) {
    return 'image/webp'
  }

  return ''
}

export async function loadTextureAsset(file: File): Promise<TextureLoadResult> {
  const mimeType = file.type || inferMimeType(file.name)

  if (!mimeType.startsWith('image/')) {
    throw new Error('이미지 파일만 업로드할 수 있습니다.')
  }

  const bitmapSource = file.type ? file : new Blob([await file.arrayBuffer()], { type: mimeType })
  const previewBlob = file.type ? file : bitmapSource
  const previewUrl = URL.createObjectURL(previewBlob)

  try {
    const bitmap = await createImageBitmap(bitmapSource)

    const asset: TextureAsset = {
      id: createTextureAssetId(),
      fileName: file.name,
      mimeType,
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
