import type { SerializedTextureAsset } from '../types/projectSnapshot'
import {
  defaultTextureWrapMode,
  type TextureAsset,
  type TextureLoadResult,
  type TextureAssetSourceKind,
} from '../types/textureAsset'

function createTextureAssetId() {
  return `texture-${crypto.randomUUID()}`
}

const MAX_TEXTURE_FILE_SIZE = 20 * 1024 * 1024

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

async function blobToDataUrl(blob: Blob) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }

      reject(new Error('텍스처를 데이터 URL로 변환하지 못했습니다.'))
    }
    reader.onerror = () => {
      reject(new Error('텍스처 파일을 읽는 중 오류가 발생했습니다.'))
    }
    reader.readAsDataURL(blob)
  })
}

async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl)
  return await response.blob()
}

export async function loadTextureAsset(
  file: File,
  options: {
    sourceKind?: TextureAssetSourceKind
    ownerModelId?: string | null
  } = {},
): Promise<TextureLoadResult> {
  const mimeType = file.type || inferMimeType(file.name)

  if (!mimeType.startsWith('image/')) {
    throw new Error('이미지 파일만 업로드할 수 있습니다.')
  }
  if (file.size > MAX_TEXTURE_FILE_SIZE) {
    throw new Error('텍스처 파일은 20MB 이하만 업로드할 수 있습니다.')
  }

  const bitmapSource = file.type ? file : new Blob([await file.arrayBuffer()], { type: mimeType })
  const sourceDataUrl = await blobToDataUrl(bitmapSource)
  const asset = await createTextureAssetFromSerialized({
    id: createTextureAssetId(),
    fileName: file.name,
    mimeType,
    width: 0,
    height: 0,
    sourceDataUrl,
    sourceKind: options.sourceKind ?? 'manual',
    ownerModelId: options.ownerModelId ?? null,
    wrapS: defaultTextureWrapMode,
    wrapT: defaultTextureWrapMode,
  })

  return { asset }
}

export async function createTextureAssetFromSerialized(
  serializedAsset: SerializedTextureAsset,
): Promise<TextureAsset> {
  const blob = await dataUrlToBlob(serializedAsset.sourceDataUrl)
  const previewUrl = URL.createObjectURL(blob)

  try {
    const bitmap = await createImageBitmap(blob)

    return {
      id: serializedAsset.id,
      fileName: serializedAsset.fileName,
      mimeType: serializedAsset.mimeType,
      width: bitmap.width,
      height: bitmap.height,
      previewUrl,
      sourceDataUrl: serializedAsset.sourceDataUrl,
      sourceKind: serializedAsset.sourceKind,
      ownerModelId: serializedAsset.ownerModelId,
      wrapS: serializedAsset.wrapS ?? defaultTextureWrapMode,
      wrapT: serializedAsset.wrapT ?? defaultTextureWrapMode,
      bitmap,
    }
  } catch (error) {
    URL.revokeObjectURL(previewUrl)
    throw error instanceof Error ? error : new Error('텍스처를 디코딩하지 못했습니다.')
  }
}

export function serializeTextureAsset(asset: TextureAsset): SerializedTextureAsset {
  return {
    id: asset.id,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    width: asset.width,
    height: asset.height,
    sourceDataUrl: asset.sourceDataUrl,
    sourceKind: asset.sourceKind,
    ownerModelId: asset.ownerModelId,
    wrapS: asset.wrapS,
    wrapT: asset.wrapT,
  }
}

export function disposeTextureAsset(asset: TextureAsset) {
  URL.revokeObjectURL(asset.previewUrl)
  asset.bitmap.close()
}
