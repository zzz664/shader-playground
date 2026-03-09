import type {
  MaterialPropertyDefinition,
  MaterialPropertyValue,
} from '../../shared/types/materialProperty'
import type { TextureAsset } from '../../shared/types/textureAsset'

interface MaterialInspectorPanelProps {
  properties: MaterialPropertyDefinition[]
  values: Record<string, MaterialPropertyValue>
  textureAssets: TextureAsset[]
  textureLoadError: string | null
  onValueChange: (name: string, value: MaterialPropertyValue) => void
  onTextureUpload: (propertyName: string, file: File) => void
}

interface PropertyGroup {
  name: string
  properties: MaterialPropertyDefinition[]
}

function getDisplayLabel(property: MaterialPropertyDefinition) {
  return property.label || property.name
}

function getNumberStep(property: MaterialPropertyDefinition) {
  if (typeof property.step === 'number') {
    return String(property.step)
  }

  return property.valueType === 'float' || property.valueType.startsWith('vec') ? '0.01' : '1'
}

function buildPropertyGroups(properties: MaterialPropertyDefinition[]) {
  const groupMap = new Map<string, MaterialPropertyDefinition[]>()

  properties.forEach((property) => {
    const groupName = property.group || '기본'
    const groupProperties = groupMap.get(groupName) ?? []
    groupProperties.push(property)
    groupMap.set(groupName, groupProperties)
  })

  return Array.from(groupMap.entries()).map<PropertyGroup>(([name, groupProperties]) => ({
    name,
    properties: groupProperties,
  }))
}

function toColorHex(value: MaterialPropertyValue, componentCount: number) {
  if (!Array.isArray(value)) {
    return '#ffffff'
  }

  const [r, g, b] = value
  const toHex = (entry: number) =>
    Math.max(0, Math.min(255, Math.round(entry * 255)))
      .toString(16)
      .padStart(2, '0')

  if (componentCount < 3) {
    return '#ffffff'
  }

  return `#${toHex(Number(r))}${toHex(Number(g))}${toHex(Number(b))}`
}

function fromColorHex(hex: string, alpha: number | undefined, componentCount: number) {
  const normalizedHex = hex.replace('#', '')
  const channels = normalizedHex.match(/.{1,2}/g)

  if (!channels || channels.length < 3) {
    return componentCount === 4 ? [1, 1, 1, alpha ?? 1] : [1, 1, 1]
  }

  const rgb = channels.slice(0, 3).map((channel) => Number.parseInt(channel, 16) / 255)
  return componentCount === 4 ? [...rgb, alpha ?? 1] : rgb
}

export function MaterialInspectorPanel({
  properties,
  values,
  textureAssets,
  textureLoadError,
  onValueChange,
  onTextureUpload,
}: MaterialInspectorPanelProps) {
  const groups = buildPropertyGroups(properties)

  return (
    <section className="inspector-panel">
      <div className="inspector-panel__header">
        <p className="panel__eyebrow">Inspector</p>
      </div>

      {groups.length > 0 ? (
        <div className="inspector-panel__groups">
          {groups.map((group) => (
            <section key={group.name} className="inspector-group">
              <div className="inspector-group__header">
                <h3>{group.name}</h3>
                <span>{group.properties.length}개</span>
              </div>

              <div className="inspector-panel__list">
                {group.properties.map((property) => {
                  const value = values[property.name]

                  if (property.componentCount === 1 && property.uiKind === 'checkbox') {
                    return (
                      <label key={property.name} className="property-card property-card--checkbox">
                        <div>
                          <strong>{getDisplayLabel(property)}</strong>
                          <p>{property.name}</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={Boolean(value)}
                          onChange={(event) => {
                            onValueChange(property.name, event.target.checked)
                          }}
                        />
                      </label>
                    )
                  }

                  if (property.componentCount === 1 && property.uiKind === 'texture') {
                    const selectedAsset = textureAssets.find((asset) => asset.id === value)

                    return (
                      <div key={property.name} className="property-card">
                        <strong>{getDisplayLabel(property)}</strong>
                        <span>{property.name}</span>
                        <label className="texture-slot">
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={(event) => {
                              const file = event.target.files?.[0]
                              if (!file) {
                                return
                              }

                              onTextureUpload(property.name, file)
                              event.currentTarget.value = ''
                            }}
                          />
                          <span>텍스처 업로드</span>
                        </label>
                        {selectedAsset ? (
                          <div className="texture-preview">
                            <img src={selectedAsset.previewUrl} alt={selectedAsset.fileName} />
                            <div>
                              <p>{selectedAsset.fileName}</p>
                              <p>
                                {selectedAsset.width} x {selectedAsset.height}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <p className="texture-preview__empty">현재 연결된 텍스처가 없습니다.</p>
                        )}
                        {textureAssets.length > 0 ? (
                          <select
                            value={typeof value === 'string' ? value : ''}
                            onChange={(event) => {
                              onValueChange(property.name, event.target.value || null)
                            }}
                          >
                            <option value="">텍스처 선택 안 함</option>
                            {textureAssets.map((asset) => (
                              <option key={asset.id} value={asset.id}>
                                {asset.fileName}
                              </option>
                            ))}
                          </select>
                        ) : null}
                        {textureLoadError ? (
                          <p className="texture-preview__error">{textureLoadError}</p>
                        ) : null}
                      </div>
                    )
                  }

                  if (property.componentCount === 1 && property.uiKind === 'slider') {
                    const numericValue = typeof value === 'number' ? value : 0

                    return (
                      <div key={property.name} className="property-card">
                        <strong>{getDisplayLabel(property)}</strong>
                        <span>{property.name}</span>
                        <div className="property-card__slider">
                          <input
                            type="range"
                            min={property.min ?? 0}
                            max={property.max ?? 1}
                            step={property.step ?? 0.01}
                            value={numericValue}
                            onChange={(event) => {
                              onValueChange(property.name, Number(event.target.value))
                            }}
                          />
                          <input
                            type="number"
                            min={property.min}
                            max={property.max}
                            step={getNumberStep(property)}
                            value={numericValue}
                            onChange={(event) => {
                              const rawValue = Number(event.target.value)
                              onValueChange(property.name, Number.isNaN(rawValue) ? 0 : rawValue)
                            }}
                          />
                        </div>
                      </div>
                    )
                  }

                  if (
                    property.uiKind === 'color' &&
                    (property.valueType === 'vec3' || property.valueType === 'vec4')
                  ) {
                    const vectorValue = Array.isArray(value)
                      ? value.map((entry) => Number(entry))
                      : Array.from({ length: property.componentCount }, () => 1)
                    const alphaValue = property.componentCount === 4 ? Number(vectorValue[3] ?? 1) : undefined

                    return (
                      <div key={property.name} className="property-card">
                        <strong>{getDisplayLabel(property)}</strong>
                        <span>{property.name}</span>
                        <div className="property-card__color">
                          <input
                            type="color"
                            value={toColorHex(vectorValue, property.componentCount)}
                            onChange={(event) => {
                              onValueChange(
                                property.name,
                                fromColorHex(event.target.value, alphaValue, property.componentCount),
                              )
                            }}
                          />
                          {property.componentCount === 4 ? (
                            <label className="property-card__alpha">
                              <span>Alpha</span>
                              <input
                                type="range"
                                min={0}
                                max={1}
                                step={0.01}
                                value={alphaValue ?? 1}
                                onChange={(event) => {
                                  onValueChange(
                                    property.name,
                                    fromColorHex(
                                      toColorHex(vectorValue, property.componentCount),
                                      Number(event.target.value),
                                      property.componentCount,
                                    ),
                                  )
                                }}
                              />
                            </label>
                          ) : null}
                        </div>
                      </div>
                    )
                  }

                  if (property.componentCount === 1) {
                    return (
                      <label key={property.name} className="property-card">
                        <strong>{getDisplayLabel(property)}</strong>
                        <span>{property.name}</span>
                        <input
                          type="number"
                          min={property.min}
                          max={property.max}
                          step={getNumberStep(property)}
                          value={typeof value === 'number' ? value : 0}
                          onChange={(event) => {
                            const rawValue = Number(event.target.value)
                            onValueChange(property.name, Number.isNaN(rawValue) ? 0 : rawValue)
                          }}
                        />
                      </label>
                    )
                  }

                  const isBooleanVector = property.valueType.startsWith('bvec')
                  const vectorValues = Array.isArray(value)
                    ? value
                    : Array.from({ length: property.componentCount }, () => (isBooleanVector ? false : 0))

                  return (
                    <div key={property.name} className="property-card">
                      <strong>{getDisplayLabel(property)}</strong>
                      <span>{property.name}</span>
                      <div className="property-card__vector">
                        {vectorValues.map((entry, index) => (
                          <input
                            key={`${property.name}-${index}`}
                            type={isBooleanVector ? 'checkbox' : 'number'}
                            checked={isBooleanVector ? Boolean(entry) : undefined}
                            value={isBooleanVector ? undefined : Number(entry)}
                            step={property.valueType.startsWith('vec') ? '0.01' : '1'}
                            onChange={(event) => {
                              if (isBooleanVector) {
                                const nextValue = vectorValues.map((currentEntry, currentIndex) =>
                                  currentIndex === index ? event.target.checked : Boolean(currentEntry),
                                )

                                onValueChange(property.name, nextValue)
                                return
                              }

                              const rawValue = Number(event.target.value)
                              const nextValue = vectorValues.map((currentEntry, currentIndex) =>
                                currentIndex === index
                                  ? (Number.isNaN(rawValue) ? 0 : rawValue)
                                  : Number(currentEntry),
                              )

                              onValueChange(property.name, nextValue)
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p className="inspector-panel__empty">
          현재 링크된 프로그램에서 노출할 사용자 uniform이 없습니다. `uTime`, `uResolution` 같은
          내장 uniform은 인스펙터에서 제외됩니다.
        </p>
      )}
    </section>
  )
}
