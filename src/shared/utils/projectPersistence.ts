import { defaultPostProcessFragmentShaderSource } from '../../core/shader/templates/defaultShaders'
import {
  createDefaultPostProcessPass,
  defaultPostProcessChainState,
} from '../types/postProcess'
import {
  defaultBlendPresetState,
  defaultModelTransformState,
  defaultPostProcessEnabled,
} from '../types/scenePreview'
import type { ModelAsset } from '../types/modelAsset'
import type {
  NormalizedProjectSnapshot,
  ProjectSnapshot,
  SerializedModelAsset,
} from '../types/projectSnapshot'
import type { TextureAsset } from '../types/textureAsset'

export const PROJECT_STORAGE_KEY = 'shader-playground.project.v1'

export function serializeModelAsset(modelAsset: ModelAsset | null): SerializedModelAsset | null {
  if (!modelAsset) {
    return null
  }

  return {
    id: modelAsset.id,
    name: modelAsset.name,
    vertices: Array.from(modelAsset.vertices),
    indices: Array.from(modelAsset.indices),
    indexFormat: modelAsset.indices instanceof Uint32Array ? 'uint32' : 'uint16',
    bounds: modelAsset.bounds,
    meshCount: modelAsset.meshCount,
    materialNames: modelAsset.materialNames,
    textureBindings: modelAsset.textureBindings,
    textureAssetIds: modelAsset.textureAssets.map((asset) => asset.id),
    warningMessages: modelAsset.warningMessages,
  }
}

export function restoreModelAsset(
  serializedModelAsset: SerializedModelAsset | null,
  textureAssets: TextureAsset[],
): ModelAsset | null {
  if (!serializedModelAsset) {
    return null
  }

  const textureAssetIds = new Set(serializedModelAsset.textureAssetIds)

  return {
    id: serializedModelAsset.id,
    name: serializedModelAsset.name,
    vertices: new Float32Array(serializedModelAsset.vertices),
    indices:
      serializedModelAsset.indexFormat === 'uint32'
        ? new Uint32Array(serializedModelAsset.indices)
        : new Uint16Array(serializedModelAsset.indices),
    bounds: serializedModelAsset.bounds,
    meshCount: serializedModelAsset.meshCount,
    materialNames: serializedModelAsset.materialNames,
    textureBindings: serializedModelAsset.textureBindings,
    textureAssets: textureAssets.filter((asset) => textureAssetIds.has(asset.id)),
    warningMessages: serializedModelAsset.warningMessages,
  }
}

export function normalizeProjectSnapshot(
  snapshot: ProjectSnapshot,
): NormalizedProjectSnapshot {
  const normalizedPostProcessPasses =
    snapshot.postProcessPasses && snapshot.postProcessPasses.length > 0
      ? snapshot.postProcessPasses.map((pass, index) =>
          createDefaultPostProcessPass({
            id: pass.id || `post-pass-${index + 1}`,
            name: pass.name || `Pass ${index + 1}`,
            enabled: pass.enabled ?? true,
            source: pass.source ?? defaultPostProcessFragmentShaderSource,
          }),
        )
      : [
          createDefaultPostProcessPass({
            source: snapshot.postProcessSource ?? defaultPostProcessFragmentShaderSource,
          }),
        ]

  const normalizedPostProcessSource =
    normalizedPostProcessPasses[0]?.source ?? defaultPostProcessFragmentShaderSource
  const normalizedActivePostProcessPassId =
    normalizedPostProcessPasses.some((pass) => pass.id === snapshot.activePostProcessPassId)
      ? snapshot.activePostProcessPassId ?? normalizedPostProcessPasses[0]?.id ?? null
      : normalizedPostProcessPasses[0]?.id ?? null

  return {
    ...snapshot,
    postProcessSource: normalizedPostProcessSource,
    postProcessPasses: normalizedPostProcessPasses,
    activePostProcessPassId: normalizedActivePostProcessPassId,
    postProcessEnabled:
      snapshot.postProcessEnabled ?? defaultPostProcessChainState.enabled ?? defaultPostProcessEnabled,
    blendPresetState: snapshot.blendPresetState ?? defaultBlendPresetState,
    modelTransform: snapshot.modelTransform ?? defaultModelTransformState,
  }
}

export function saveProjectSnapshot(snapshot: ProjectSnapshot) {
  const normalizedSnapshot = normalizeProjectSnapshot(snapshot)
  localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(normalizedSnapshot))
}

export function loadStoredProjectSnapshot() {
  const rawValue = localStorage.getItem(PROJECT_STORAGE_KEY)
  if (!rawValue) {
    return null
  }

  return normalizeProjectSnapshot(JSON.parse(rawValue) as ProjectSnapshot)
}

export function clearStoredProjectSnapshot() {
  localStorage.removeItem(PROJECT_STORAGE_KEY)
}
