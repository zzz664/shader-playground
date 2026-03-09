export type ShaderEditorStage = 'vertex' | 'fragment'

export interface StageSnippetSeed {
  label: string
  insertText: string
  detail: string
}

export const commonKeywords = [
  'uniform',
  'in',
  'out',
  'inout',
  'precision',
  'highp',
  'mediump',
  'lowp',
  'const',
  'if',
  'else',
  'for',
  'while',
  'return',
  'struct',
  'layout',
]

export const commonTypes = ['void', 'bool', 'int', 'float', 'vec2', 'vec3', 'vec4', 'mat3', 'mat4', 'sampler2D']

export const commonBuiltins = [
  'sin',
  'cos',
  'tan',
  'pow',
  'min',
  'max',
  'clamp',
  'mix',
  'step',
  'smoothstep',
  'length',
  'normalize',
  'dot',
  'cross',
  'reflect',
  'texture',
]

export const builtinUniforms = ['uTime', 'uResolution', 'uMouse', 'uModel', 'uView', 'uProj', 'uCameraPos', 'uSceneMode']

export const commonVariables = ['vUv', 'vNormal', 'vWorldPosition', 'outColor']

export function getStageSnippetSeeds(stage: ShaderEditorStage): StageSnippetSeed[] {
  if (stage === 'vertex') {
    return [
      {
        label: 'vertex-main',
        detail: '기본 vertex main 템플릿',
        insertText: [
          'void main() {',
          '  vec4 worldPosition = uModel * vec4(aPosition, 1.0);',
          '  vWorldPosition = worldPosition.xyz;',
          '  vNormal = mat3(uModel) * aNormal;',
          '  vUv = aUv;',
          '  gl_Position = uProj * uView * worldPosition;',
          '}',
        ].join('\n'),
      },
    ]
  }

  return [
    {
      label: 'fragment-main',
      detail: '기본 fragment main 템플릿',
      insertText: [
        'void main() {',
        '  vec3 normal = normalize(vNormal);',
        '  vec3 lightDir = normalize(vec3(0.4, 0.7, 0.5));',
        '  float lambert = max(dot(normal, lightDir), 0.0);',
        '  vec3 color = vec3(0.14) + lambert * vec3(0.86);',
        '  outColor = vec4(color, 1.0);',
        '}',
      ].join('\n'),
    },
    {
      label: 'texture-sample',
      detail: 'sampler2D 샘플링 템플릿',
      insertText: 'texture(${1:detailTex}, ${2:vUv})',
    },
  ]
}
