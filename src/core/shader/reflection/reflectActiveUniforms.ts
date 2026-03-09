import type { MaterialPropertyDefinition, MaterialPropertyValue } from '../../../shared/types/materialProperty'

const builtinUniformNames = new Set([
  'uTime',
  'uResolution',
  'uMouse',
  'uSceneMode',
  'uModel',
  'uView',
  'uProj',
  'uCameraPos',
  'uLightDir',
])

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
): MaterialPropertyDefinition[] {
  const activeUniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number
  const properties: MaterialPropertyDefinition[] = []

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

    properties.push({
      name: normalizedName,
      valueType: supportedTemplate.valueType,
      uiKind: supportedTemplate.uiKind,
      componentCount: supportedTemplate.componentCount,
      builtin: builtinUniformNames.has(normalizedName),
    })
  }

  return properties
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
