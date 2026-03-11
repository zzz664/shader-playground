import type {
  MaterialPropertyDefinition,
  MaterialPropertyScope,
  MaterialPropertyValue,
} from '../../shared/types/materialProperty'
import type { TextureAsset } from '../../shared/types/textureAsset'

interface MaterialInspectorPanelProps {
  properties: MaterialPropertyDefinition[]
  values: Record<string, MaterialPropertyValue>
  textureAssets: TextureAsset[]
  textureLoadError: string | null
  onValueChange: (name: string, value: MaterialPropertyValue) => void
  onTextureUpload: (propertyId: string, file: File) => void
}

interface PropertyGroup {
  name: string
  properties: MaterialPropertyDefinition[]
}

interface PostPassSection {
  passId: string
  passName: string
  groups: PropertyGroup[]
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

function getScopeTitle(scope: MaterialPropertyScope) {
  return scope === 'scene' ? 'Scene' : 'Post Process'
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

function buildPostPassSections(properties: MaterialPropertyDefinition[]) {
  const passMap = new Map<string, MaterialPropertyDefinition[]>()

  properties.forEach((property) => {
    if (!property.postPassId) {
      return
    }

    const passProperties = passMap.get(property.postPassId) ?? []
    passProperties.push(property)
    passMap.set(property.postPassId, passProperties)
  })

  return Array.from(passMap.entries()).map<PostPassSection>(([passId, passProperties]) => ({
    passId,
    passName: passProperties[0]?.postPassName ?? passId,
    groups: buildPropertyGroups(passProperties),
  }))
}

function toColorHex(value: MaterialPropertyValue, componentCount: number) {
  if (!Array.isArray(value) || componentCount < 3) {
    return '#ffffff'
  }

  const [r, g, b] = value
  const toHex = (entry: number) =>
    Math.max(0, Math.min(255, Math.round(entry * 255)))
      .toString(16)
      .padStart(2, '0')

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

function renderPropertyCard(
  property: MaterialPropertyDefinition,
  value: MaterialPropertyValue,
  textureAssets: TextureAsset[],
  textureLoadError: string | null,
  onValueChange: (name: string, value: MaterialPropertyValue) => void,
  onTextureUpload: (propertyId: string, file: File) => void,
) {
  if (property.componentCount === 1 && property.uiKind === 'checkbox') {
    return (
      <label key={property.id} className="property-card property-card--checkbox">
        <div>
          <strong>{getDisplayLabel(property)}</strong>
          <p>{property.name}</p>
        </div>
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => {
            onValueChange(property.id, event.target.checked)
          }}
        />
      </label>
    )
  }

  if (property.componentCount === 1 && property.uiKind === 'texture') {
    const selectedAsset = textureAssets.find((asset) => asset.id === value)

    return (
      <div key={property.id} className="property-card">
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

              onTextureUpload(property.id, file)
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
              onValueChange(property.id, event.target.value || null)
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
        {textureLoadError ? <p className="texture-preview__error">{textureLoadError}</p> : null}
      </div>
    )
  }

  if (property.componentCount === 1 && property.uiKind === 'slider') {
    const numericValue = typeof value === 'number' ? value : 0

    return (
      <div key={property.id} className="property-card">
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
              onValueChange(property.id, Number(event.target.value))
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
              onValueChange(property.id, Number.isNaN(rawValue) ? 0 : rawValue)
            }}
          />
        </div>
      </div>
    )
  }

  if (property.uiKind === 'color' && (property.valueType === 'vec3' || property.valueType === 'vec4')) {
    const vectorValue = Array.isArray(value)
      ? value.map((entry) => Number(entry))
      : Array.from({ length: property.componentCount }, () => 1)
    const alphaValue = property.componentCount === 4 ? Number(vectorValue[3] ?? 1) : undefined

    return (
      <div key={property.id} className="property-card">
        <strong>{getDisplayLabel(property)}</strong>
        <span>{property.name}</span>
        <div className="property-card__color">
          <input
            type="color"
            value={toColorHex(vectorValue, property.componentCount)}
            onChange={(event) => {
              onValueChange(
                property.id,
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
                    property.id,
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
      <label key={property.id} className="property-card">
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
            onValueChange(property.id, Number.isNaN(rawValue) ? 0 : rawValue)
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
    <div key={property.id} className="property-card">
      <strong>{getDisplayLabel(property)}</strong>
      <span>{property.name}</span>
      <div className="property-card__vector">
        {vectorValues.map((entry, index) => (
          <input
            key={`${property.id}-${index}`}
            type={isBooleanVector ? 'checkbox' : 'number'}
            checked={isBooleanVector ? Boolean(entry) : undefined}
            value={isBooleanVector ? undefined : Number(entry)}
            step={property.valueType.startsWith('vec') ? '0.01' : '1'}
            onChange={(event) => {
              if (isBooleanVector) {
                const nextValue = vectorValues.map((currentEntry, currentIndex) =>
                  currentIndex === index ? event.target.checked : Boolean(currentEntry),
                )
                onValueChange(property.id, nextValue)
                return
              }

              const rawValue = Number(event.target.value)
              const nextValue = vectorValues.map((currentEntry, currentIndex) =>
                currentIndex === index
                  ? (Number.isNaN(rawValue) ? 0 : rawValue)
                  : Number(currentEntry),
              )
              onValueChange(property.id, nextValue)
            }}
          />
        ))}
      </div>
    </div>
  )
}

export function MaterialInspectorPanel({
  properties,
  values,
  textureAssets,
  textureLoadError,
  onValueChange,
  onTextureUpload,
}: MaterialInspectorPanelProps) {
  const sceneGroups = buildPropertyGroups(properties.filter((property) => property.scope === 'scene'))
  const postPassSections = buildPostPassSections(
    properties.filter((property) => property.scope === 'post'),
  )

  return (
    <section className="inspector-panel">
      <div className="inspector-panel__header">
        <p className="panel__eyebrow">Inspector</p>
      </div>

      {properties.length > 0 ? (
        <div className="inspector-panel__groups">
          {sceneGroups.length > 0 ? (
            <section className="inspector-scope">
              <div className="inspector-group__header">
                <h3>{getScopeTitle('scene')}</h3>
                <span>{sceneGroups.reduce((count, group) => count + group.properties.length, 0)}개</span>
              </div>

              {sceneGroups.map((group) => (
                <section key={`scene-${group.name}`} className="inspector-group">
                  <div className="inspector-group__header">
                    <h3>{group.name}</h3>
                    <span>{group.properties.length}개</span>
                  </div>

                  <div className="inspector-panel__list">
                    {group.properties.map((property) =>
                      renderPropertyCard(
                        property,
                        values[property.id],
                        textureAssets,
                        textureLoadError,
                        onValueChange,
                        onTextureUpload,
                      ),
                    )}
                  </div>
                </section>
              ))}
            </section>
          ) : null}

          {postPassSections.length > 0 ? (
            <section className="inspector-scope">
              <div className="inspector-group__header">
                <h3>{getScopeTitle('post')}</h3>
                <span>
                  {postPassSections.reduce(
                    (count, section) =>
                      count +
                      section.groups.reduce(
                        (groupCount, group) => groupCount + group.properties.length,
                        0,
                      ),
                    0,
                  )}
                  개
                </span>
              </div>

              {postPassSections.map((section) => (
                <section key={section.passId} className="inspector-group">
                  <div className="inspector-group__header">
                    <h3>{section.passName}</h3>
                    <span>
                      {section.groups.reduce(
                        (count, group) => count + group.properties.length,
                        0,
                      )}
                      개
                    </span>
                  </div>

                  {section.groups.map((group) => (
                    <section key={`${section.passId}-${group.name}`} className="inspector-group">
                      <div className="inspector-group__header">
                        <h3>{group.name}</h3>
                        <span>{group.properties.length}개</span>
                      </div>

                      <div className="inspector-panel__list">
                        {group.properties.map((property) =>
                          renderPropertyCard(
                            property,
                            values[property.id],
                            textureAssets,
                            textureLoadError,
                            onValueChange,
                            onTextureUpload,
                          ),
                        )}
                      </div>
                    </section>
                  ))}
                </section>
              ))}
            </section>
          ) : null}
        </div>
      ) : (
        <p className="inspector-panel__empty">
          현재 링크된 프로그램에서 인스펙터에 표시할 사용자 uniform이 없습니다.
        </p>
      )}
    </section>
  )
}
