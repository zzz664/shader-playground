import type { MaterialPropertyDefinition } from '../../../shared/types/materialProperty'

export interface ParsedShaderMetadata {
  label?: string
  group?: string
  uiKind?: MaterialPropertyDefinition['uiKind']
  min?: number
  max?: number
  step?: number
}

const metadataPattern =
  /uniform\s+\w+\s+([A-Za-z_]\w*)\s*;[^\S\r\n]*(?:\/\/([^\n\r]*))?/g

const tokenPattern = /@([a-zA-Z]+)\s+([^@]+)/g

export function parseShaderMetadata(...sources: string[]) {
  const metadataMap = new Map<string, ParsedShaderMetadata>()

  sources.forEach((source) => {
    let match: RegExpExecArray | null = metadataPattern.exec(source)

    while (match) {
      const uniformName = match[1]
      const comment = match[2]?.trim()
      const currentMetadata = metadataMap.get(uniformName) ?? {}

      if (comment) {
        let tokenMatch: RegExpExecArray | null = tokenPattern.exec(comment)

        while (tokenMatch) {
          const key = tokenMatch[1]
          const rawValue = tokenMatch[2].trim()
          applyMetadataToken(currentMetadata, key, rawValue)
          tokenMatch = tokenPattern.exec(comment)
        }

        tokenPattern.lastIndex = 0
      }

      metadataMap.set(uniformName, currentMetadata)
      match = metadataPattern.exec(source)
    }

    metadataPattern.lastIndex = 0
  })

  return metadataMap
}

function applyMetadataToken(metadata: ParsedShaderMetadata, key: string, rawValue: string) {
  switch (key) {
    case 'label':
      metadata.label = rawValue
      break
    case 'group':
      metadata.group = rawValue
      break
    case 'ui':
      if (isSupportedUiKind(rawValue)) {
        metadata.uiKind = rawValue
      }
      break
    case 'min':
      metadata.min = toFiniteNumber(rawValue)
      break
    case 'max':
      metadata.max = toFiniteNumber(rawValue)
      break
    case 'step':
      metadata.step = toFiniteNumber(rawValue)
      break
    default:
      break
  }
}

function isSupportedUiKind(value: string): value is MaterialPropertyDefinition['uiKind'] {
  return (
    value === 'number' ||
    value === 'checkbox' ||
    value === 'vector' ||
    value === 'texture' ||
    value === 'slider' ||
    value === 'color'
  )
}

function toFiniteNumber(value: string) {
  const parsedValue = Number(value)
  return Number.isFinite(parsedValue) ? parsedValue : undefined
}
