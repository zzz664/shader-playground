import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import {
  BufferGeometry,
  LoadingManager,
  type Material,
  type Mesh,
  type Object3D,
  type Texture,
} from 'three'
import { loadTextureAsset } from '../../../shared/utils/loadTextureAsset'
import type {
  ModelAsset,
  ModelBounds,
  ModelTextureBinding,
} from '../../../shared/types/modelAsset'

const VERTEX_STRIDE = 8
const MAX_FBX_FILE_SIZE = 50 * 1024 * 1024

interface BoundsState {
  min: [number, number, number]
  max: [number, number, number]
}

interface ReferencedTexture {
  file: File
  materialName: string
  slot: 'diffuse'
}

export async function loadFbxAsset(files: File[]): Promise<ModelAsset> {
  const fbxFile = files.find((file) => file.name.toLowerCase().endsWith('.fbx'))

  if (!fbxFile) {
    throw new Error('FBX 파일을 찾지 못했습니다. .fbx 파일과 관련 텍스처를 함께 선택해 주세요.')
  }
  if (fbxFile.size > MAX_FBX_FILE_SIZE) {
    throw new Error('FBX 파일은 50MB 이하만 업로드할 수 있습니다.')
  }

  const relatedFiles = new Map<string, File>()
  const objectUrls = new Map<string, string>()

  files.forEach((file) => {
    relatedFiles.set(createFileLookupKey(file.name), file)
    objectUrls.set(file.name, URL.createObjectURL(file))
  })

  const loadingManager = new LoadingManager()
  loadingManager.setURLModifier((url) => {
    const nextFile = relatedFiles.get(createFileLookupKey(url))
    return nextFile ? objectUrls.get(nextFile.name) ?? url : url
  })

  const loader = new FBXLoader(loadingManager)

  try {
    const root = await loader.loadAsync(objectUrls.get(fbxFile.name) ?? '')
    root.updateWorldMatrix(true, true)
    return await convertFbxSceneToModelAsset(root, fbxFile, relatedFiles)
  } catch (error) {
    throw error instanceof Error ? error : new Error('FBX 파일을 파싱하지 못했습니다.')
  } finally {
    objectUrls.forEach((url) => {
      URL.revokeObjectURL(url)
    })
  }
}

async function convertFbxSceneToModelAsset(
  root: Object3D,
  fbxFile: File,
  relatedFiles: Map<string, File>,
): Promise<ModelAsset> {
  const mergedVertices: number[] = []
  const mergedIndices: number[] = []
  const boundsState = createBoundsState()
  const warningMessages: string[] = []
  const materialNames = new Set<string>()
  const referencedTextures = new Map<string, ReferencedTexture>()
  let meshCount = 0
  let missingNormalCount = 0
  let missingUvCount = 0
  let mirroredMeshCount = 0

  root.traverse((node) => {
    if (!isMeshNode(node)) {
      return
    }

    const geometry = extractGeometry(node)
    if (!geometry) {
      warningMessages.push(`${node.name || '이름 없는 메쉬'}에서 position 속성을 찾지 못해 건너뜁니다.`)
      return
    }

    meshCount += 1
    const bakedGeometry = geometry.clone()
    const hasMirroredTransform = node.matrixWorld.determinant() < 0

    if (!bakedGeometry.getAttribute('normal')) {
      bakedGeometry.computeVertexNormals()
      missingNormalCount += 1
    }

    bakedGeometry.applyMatrix4(node.matrixWorld)

    const positionAttribute = bakedGeometry.getAttribute('position')
    const normalAttribute = bakedGeometry.getAttribute('normal')
    const uvAttribute = bakedGeometry.getAttribute('uv')

    if (!normalAttribute) {
      warningMessages.push(`${node.name || '이름 없는 메쉬'}의 normal 생성에 실패했습니다.`)
      bakedGeometry.dispose()
      return
    }

    if (!uvAttribute) {
      missingUvCount += 1
    }

    const vertexOffset = mergedVertices.length / VERTEX_STRIDE

    for (let index = 0; index < positionAttribute.count; index += 1) {
      const position: [number, number, number] = [
        positionAttribute.getX(index),
        positionAttribute.getY(index),
        positionAttribute.getZ(index),
      ]

      expandBounds(boundsState, position)
      mergedVertices.push(
        position[0],
        position[1],
        position[2],
        normalAttribute.getX(index),
        normalAttribute.getY(index),
        normalAttribute.getZ(index),
        uvAttribute ? uvAttribute.getX(index) : 0,
        uvAttribute ? uvAttribute.getY(index) : 0,
      )
    }

    const indexAttribute = bakedGeometry.getIndex()
    if (indexAttribute) {
      for (let index = 0; index < indexAttribute.count; index += 3) {
        const a = vertexOffset + indexAttribute.getX(index)
        const b = vertexOffset + indexAttribute.getX(index + 1)
        const c = vertexOffset + indexAttribute.getX(index + 2)
        pushTriangleIndices(mergedIndices, a, b, c, hasMirroredTransform)
      }
    } else {
      for (let index = 0; index < positionAttribute.count; index += 3) {
        const a = vertexOffset + index
        const b = vertexOffset + index + 1
        const c = vertexOffset + index + 2
        pushTriangleIndices(mergedIndices, a, b, c, hasMirroredTransform)
      }
    }

    if (hasMirroredTransform) {
      mirroredMeshCount += 1
    }

    collectReferencedTextures(
      node.material,
      relatedFiles,
      materialNames,
      referencedTextures,
      warningMessages,
    )
    bakedGeometry.dispose()
  })

  if (meshCount === 0 || mergedVertices.length === 0 || mergedIndices.length === 0) {
    throw new Error('FBX에서 렌더링 가능한 정적 메시를 찾지 못했습니다.')
  }

  if (missingNormalCount > 0) {
    warningMessages.push(`normal이 없는 메쉬 ${missingNormalCount}개에는 계산된 vertex normal을 사용했습니다.`)
  }
  if (missingUvCount > 0) {
    warningMessages.push(`UV가 없는 메쉬 ${missingUvCount}개에는 0,0 UV를 사용했습니다.`)
  }
  if (mirroredMeshCount > 0) {
    warningMessages.push(`음수 스케일이 포함된 메쉬 ${mirroredMeshCount}개는 컬링 보정을 위해 winding을 뒤집었습니다.`)
  }

  const textureBindings: ModelTextureBinding[] = []
  const textureAssets = []

  for (const reference of referencedTextures.values()) {
    try {
      const { asset } = await loadTextureAsset(reference.file)
      textureAssets.push(asset)
      textureBindings.push({
        materialName: reference.materialName,
        textureAssetId: asset.id,
        fileName: asset.fileName,
        slot: reference.slot,
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `${reference.file.name} 텍스처를 처리하지 못했습니다.`
      warningMessages.push(message)
    }
  }

  const normalizedModel = normalizeModelGeometry(mergedVertices, finalizeBounds(boundsState))

  return {
    id: `fbx-${Date.now()}`,
    name: fbxFile.name,
    vertices: normalizedModel.vertices,
    indices:
      mergedIndices.length > 65535 ? new Uint32Array(mergedIndices) : new Uint16Array(mergedIndices),
    bounds: normalizedModel.bounds,
    meshCount,
    materialNames: Array.from(materialNames),
    textureAssets,
    textureBindings,
    warningMessages,
  }
}

function collectReferencedTextures(
  materialSource: Material | Material[],
  relatedFiles: Map<string, File>,
  materialNames: Set<string>,
  referencedTextures: Map<string, ReferencedTexture>,
  warningMessages: string[],
) {
  const materials = Array.isArray(materialSource) ? materialSource : [materialSource]

  materials.forEach((material) => {
    if (!material) {
      return
    }

    const materialName = material.name || 'FBXMaterial'
    materialNames.add(materialName)

    const map = (material as Material & { map?: Texture | null }).map
    if (!map) {
      return
    }

    const imageSource = extractTextureSource(map)
    if (!imageSource) {
      return
    }

    const relatedFile = relatedFiles.get(createFileLookupKey(imageSource))
    if (!relatedFile) {
      warningMessages.push(`${materialName} 재질이 참조한 텍스처 ${imageSource} 파일을 찾지 못했습니다.`)
      return
    }

    if (!referencedTextures.has(relatedFile.name)) {
      referencedTextures.set(relatedFile.name, {
        file: relatedFile,
        materialName,
        slot: 'diffuse',
      })
    }
  })
}

function extractGeometry(mesh: Mesh): BufferGeometry | null {
  if (!(mesh.geometry instanceof BufferGeometry)) {
    return null
  }

  const geometry = mesh.geometry
  return geometry.getAttribute('position') ? geometry : null
}

function extractTextureSource(texture: Texture) {
  const image = texture.source.data as { currentSrc?: string; src?: string } | undefined
  return image?.currentSrc || image?.src || texture.name || null
}

function isMeshNode(node: Object3D): node is Mesh {
  return 'isMesh' in node && node.isMesh === true
}

function createFileLookupKey(value: string) {
  return value.split(/[\\/]/).pop()?.toLowerCase() ?? value.toLowerCase()
}

function createBoundsState(): BoundsState {
  return {
    min: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    max: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
  }
}

function expandBounds(boundsState: BoundsState, position: [number, number, number]) {
  boundsState.min[0] = Math.min(boundsState.min[0], position[0])
  boundsState.min[1] = Math.min(boundsState.min[1], position[1])
  boundsState.min[2] = Math.min(boundsState.min[2], position[2])
  boundsState.max[0] = Math.max(boundsState.max[0], position[0])
  boundsState.max[1] = Math.max(boundsState.max[1], position[1])
  boundsState.max[2] = Math.max(boundsState.max[2], position[2])
}

function finalizeBounds(boundsState: BoundsState): ModelBounds {
  const center: [number, number, number] = [
    (boundsState.min[0] + boundsState.max[0]) * 0.5,
    (boundsState.min[1] + boundsState.max[1]) * 0.5,
    (boundsState.min[2] + boundsState.max[2]) * 0.5,
  ]
  const radius = Math.hypot(
    boundsState.max[0] - center[0],
    boundsState.max[1] - center[1],
    boundsState.max[2] - center[2],
  )

  return {
    min: boundsState.min,
    max: boundsState.max,
    center,
    radius: Math.max(radius, 0.001),
  }
}

function normalizeModelGeometry(
  vertices: number[],
  bounds: ModelBounds,
  targetRadius = 1,
): {
  vertices: Float32Array
  bounds: ModelBounds
} {
  const scale = targetRadius / Math.max(bounds.radius, 0.001)
  const nextVertices = new Float32Array(vertices.length)
  const nextBounds = createBoundsState()

  for (let index = 0; index < vertices.length; index += VERTEX_STRIDE) {
    const x = (vertices[index] - bounds.center[0]) * scale
    const y = (vertices[index + 1] - bounds.center[1]) * scale
    const z = (vertices[index + 2] - bounds.center[2]) * scale

    nextVertices[index] = x
    nextVertices[index + 1] = y
    nextVertices[index + 2] = z
    nextVertices[index + 3] = vertices[index + 3]
    nextVertices[index + 4] = vertices[index + 4]
    nextVertices[index + 5] = vertices[index + 5]
    nextVertices[index + 6] = vertices[index + 6]
    nextVertices[index + 7] = vertices[index + 7]

    expandBounds(nextBounds, [x, y, z])
  }

  return {
    vertices: nextVertices,
    bounds: finalizeBounds(nextBounds),
  }
}

function pushTriangleIndices(
  target: number[],
  a: number,
  b: number,
  c: number,
  reverseWinding: boolean,
) {
  if (reverseWinding) {
    target.push(a, c, b)
    return
  }

  target.push(a, b, c)
}
