import { defaultPostProcessFragmentShaderSource } from '../../core/shader/templates/defaultShaders'

export type PostProcessRenderTargetFormat = 'rgba8' | 'rgba16f'

export interface PostProcessPass {
  id: string;
  name: string;
  enabled: boolean;
  source: string;
  renderTargetFormat: PostProcessRenderTargetFormat;
}

export interface PostProcessChainState {
  enabled: boolean
  passes: PostProcessPass[]
}

export function createDefaultPostProcessPassSource(passName = 'Pass 1') {
  return defaultPostProcessFragmentShaderSource.replace(
    'vec3 color = mix(sceneColor.rgb, prevPassColor.rgb, 0.85);',
    `vec3 color = mix(sceneColor.rgb, prevPassColor.rgb, 0.85); // ${passName}`,
  )
}

export function createDefaultPostProcessPass(
  overrides: Partial<PostProcessPass> = {},
): PostProcessPass {
  return {
    id: overrides.id ?? 'post-pass-1',
    name: overrides.name ?? 'Pass 1',
    enabled: overrides.enabled ?? true,
    renderTargetFormat: overrides.renderTargetFormat ?? 'rgba8',
    source:
      overrides.source ?? createDefaultPostProcessPassSource(overrides.name ?? 'Pass 1'),
  }
}

export const defaultPostProcessChainState: PostProcessChainState = {
  enabled: true,
  passes: [createDefaultPostProcessPass()],
}
