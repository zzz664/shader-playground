export type MaterialPropertyValueType =
  | 'float'
  | 'int'
  | 'bool'
  | 'vec2'
  | 'vec3'
  | 'vec4'
  | 'ivec2'
  | 'ivec3'
  | 'ivec4'
  | 'bvec2'
  | 'bvec3'
  | 'bvec4'

export type MaterialPropertyUiKind = 'number' | 'checkbox' | 'vector'

export type MaterialPropertyValue = number | boolean | number[] | boolean[]

export interface MaterialPropertyDefinition {
  name: string
  valueType: MaterialPropertyValueType
  uiKind: MaterialPropertyUiKind
  componentCount: 1 | 2 | 3 | 4
  builtin: boolean
}
