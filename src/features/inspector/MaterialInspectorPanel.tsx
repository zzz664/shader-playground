import type {
  MaterialPropertyDefinition,
  MaterialPropertyValue,
} from '../../shared/types/materialProperty'

interface MaterialInspectorPanelProps {
  properties: MaterialPropertyDefinition[]
  values: Record<string, MaterialPropertyValue>
  onValueChange: (name: string, value: MaterialPropertyValue) => void
}

function getNumberStep(valueType: MaterialPropertyDefinition['valueType']) {
  return valueType === 'float' || valueType.startsWith('vec') ? '0.01' : '1'
}

export function MaterialInspectorPanel({
  properties,
  values,
  onValueChange,
}: MaterialInspectorPanelProps) {
  return (
    <section className="inspector-panel">
      <div className="inspector-panel__header">
        <div>
          <p className="panel__eyebrow">Inspector</p>
          <h2>자동 생성 머티리얼 프로퍼티</h2>
        </div>
        <span className="status-chip status-chip--ready">{properties.length}개</span>
      </div>

      {properties.length > 0 ? (
        <div className="inspector-panel__list">
          {properties.map((property) => {
            const value = values[property.name]

            if (property.componentCount === 1 && property.uiKind === 'checkbox') {
              return (
                <label key={property.name} className="property-card property-card--checkbox">
                  <div>
                    <strong>{property.name}</strong>
                    <p>{property.valueType}</p>
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

            if (property.componentCount === 1) {
              return (
                <label key={property.name} className="property-card">
                  <strong>{property.name}</strong>
                  <span>{property.valueType}</span>
                  <input
                    type="number"
                    value={typeof value === 'number' ? value : 0}
                    step={getNumberStep(property.valueType)}
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
                <strong>{property.name}</strong>
                <span>{property.valueType}</span>
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
                          currentIndex === index ? (Number.isNaN(rawValue) ? 0 : rawValue) : Number(currentEntry),
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
      ) : (
        <p className="inspector-panel__empty">
          현재 링크된 프로그램에서 노출된 uniform이 없습니다. `uTime`, `uResolution` 같은 내장 uniform은
          인스펙터에서 제외됩니다.
        </p>
      )}
    </section>
  )
}
