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
  | 'texture2D'

export type MaterialPropertyUiKind =
  | 'number'
  | 'checkbox'
  | 'vector'
  | 'texture'
  | 'slider'
  | 'color'

export type MaterialPropertyValue = number | boolean | number[] | boolean[] | string | null

export interface MaterialPropertyDefinition {
  name: string
  valueType: MaterialPropertyValueType
  uiKind: MaterialPropertyUiKind
  componentCount: 1 | 2 | 3 | 4
  builtin: boolean
  label?: string
  group?: string
  min?: number
  max?: number
  step?: number
}
