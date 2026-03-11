import type {
  MaterialPropertyDefinition,
  MaterialPropertyScope,
  MaterialPropertyValue,
} from '../../../shared/types/materialProperty'
import { parseShaderMetadata } from '../metadata/parseShaderMetadata'

const defaultBuiltinUniformNames = new Set(
  [
    'uTime',
    'uResolution',
    'uMouse',
    'uSceneMode',
    'uModel',
    'uView',
    'uProj',
    'uCameraPos',
    'uLightDir',
  ].map((name) => name.toLowerCase()),
)

interface MaterialPropertyTemplate {
  valueType: MaterialPropertyDefinition['valueType']
  uiKind: MaterialPropertyDefinition['uiKind']
  componentCount: MaterialPropertyDefinition['componentCount']
}

function getSupportedUniformTemplate(
  gl: WebGL2RenderingContext,
  type: number,
): MaterialPropertyTemplate | null {
  switch (type) {
    case gl.FLOAT:
      return { valueType: 'float', uiKind: 'number', componentCount: 1 }
    case gl.INT:
      return { valueType: 'int', uiKind: 'number', componentCount: 1 }
    case gl.BOOL:
      return { valueType: 'bool', uiKind: 'checkbox', componentCount: 1 }
    case gl.FLOAT_VEC2:
      return { valueType: 'vec2', uiKind: 'vector', componentCount: 2 }
    case gl.FLOAT_VEC3:
      return { valueType: 'vec3', uiKind: 'vector', componentCount: 3 }
    case gl.FLOAT_VEC4:
      return { valueType: 'vec4', uiKind: 'vector', componentCount: 4 }
    case gl.INT_VEC2:
      return { valueType: 'ivec2', uiKind: 'vector', componentCount: 2 }
    case gl.INT_VEC3:
      return { valueType: 'ivec3', uiKind: 'vector', componentCount: 3 }
    case gl.INT_VEC4:
      return { valueType: 'ivec4', uiKind: 'vector', componentCount: 4 }
    case gl.BOOL_VEC2:
      return { valueType: 'bvec2', uiKind: 'vector', componentCount: 2 }
    case gl.BOOL_VEC3:
      return { valueType: 'bvec3', uiKind: 'vector', componentCount: 3 }
    case gl.BOOL_VEC4:
      return { valueType: 'bvec4', uiKind: 'vector', componentCount: 4 }
    case gl.SAMPLER_2D:
      return { valueType: 'texture2D', uiKind: 'texture', componentCount: 1 }
    default:
      return null
  }
}

export function reflectActiveUniforms(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  options?: {
    vertexSource?: string
    fragmentSource?: string
    builtinUniformNames?: Set<string>
    scope?: MaterialPropertyScope
    idPrefix?: string
    postPassId?: string
    postPassName?: string
  },
): MaterialPropertyDefinition[] {
  const activeUniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number
  const properties: MaterialPropertyDefinition[] = []
  const metadataMap = parseShaderMetadata(
    options?.vertexSource ?? '',
    options?.fragmentSource ?? '',
  )
  const builtinUniformNames = options?.builtinUniformNames ?? defaultBuiltinUniformNames
  const scope = options?.scope ?? 'scene'

  for (let index = 0; index < activeUniformCount; index += 1) {
    const uniform = gl.getActiveUniform(program, index)
    if (!uniform) {
      continue
    }

    const supportedTemplate = getSupportedUniformTemplate(gl, uniform.type)
    if (!supportedTemplate) {
      continue
    }

    const normalizedName = uniform.name.replace(/\[0\]$/, '')
    if (uniform.size > 1) {
      continue
    }

    const metadata = metadataMap.get(normalizedName)

    properties.push({
      id: options?.idPrefix ?? `${scope}:${normalizedName}`,
      name: normalizedName,
      scope,
      postPassId: options?.postPassId,
      postPassName: options?.postPassName,
      valueType: supportedTemplate.valueType,
      uiKind: resolveUiKind(supportedTemplate, metadata?.uiKind),
      componentCount: supportedTemplate.componentCount,
      builtin: builtinUniformNames.has(normalizedName.toLowerCase()),
      label: metadata?.label,
      group: metadata?.group,
      min: metadata?.min,
      max: metadata?.max,
      step: metadata?.step,
    })
  }

  return properties
}

function resolveUiKind(
  template: MaterialPropertyTemplate,
  metadataUiKind: MaterialPropertyDefinition['uiKind'] | undefined,
) {
  if (!metadataUiKind) {
    return template.uiKind
  }

  if (metadataUiKind === 'color' && (template.valueType === 'vec3' || template.valueType === 'vec4')) {
    return metadataUiKind
  }

  if (metadataUiKind === 'slider' && template.valueType === 'float') {
    return metadataUiKind
  }

  if (metadataUiKind === 'checkbox' && template.valueType === 'bool') {
    return metadataUiKind
  }

  if (metadataUiKind === 'texture' && template.valueType === 'texture2D') {
    return metadataUiKind
  }

  return template.uiKind
}

export function createDefaultMaterialValue(definition: MaterialPropertyDefinition): MaterialPropertyValue {
  if (definition.uiKind === 'checkbox' && definition.componentCount === 1) {
    return false
  }

  if (definition.uiKind === 'texture') {
    return null
  }

  if (definition.componentCount === 1) {
    return 0
  }

  if (definition.valueType.startsWith('bvec')) {
    return Array.from({ length: definition.componentCount }, () => false)
  }

  return Array.from({ length: definition.componentCount }, () => 0)
}

export function isMaterialValueCompatible(
  definition: MaterialPropertyDefinition,
  value: MaterialPropertyValue | undefined,
): value is MaterialPropertyValue {
  if (value === undefined) {
    return false
  }

  if (definition.componentCount === 1) {
    if (definition.uiKind === 'texture') {
      return typeof value === 'string' || value === null
    }

    return definition.uiKind === 'checkbox' ? typeof value === 'boolean' : typeof value === 'number'
  }

  if (!Array.isArray(value) || value.length !== definition.componentCount) {
    return false
  }

  if (definition.valueType.startsWith('bvec')) {
    return value.every((entry) => typeof entry === 'boolean')
  }

  return value.every((entry) => typeof entry === 'number')
}
