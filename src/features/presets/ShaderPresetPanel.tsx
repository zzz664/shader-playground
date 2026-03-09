import { useEffect, useMemo, useState } from 'react'
import type { ShaderPreset } from './shaderPresets'

interface ShaderPresetPanelProps {
  presets: ShaderPreset[]
  activeVertexSource: string
  activeFragmentSource: string
  onApplyPreset: (preset: ShaderPreset) => void
}

export function ShaderPresetPanel({
  presets,
  activeVertexSource,
  activeFragmentSource,
  onApplyPreset,
}: ShaderPresetPanelProps) {
  const activePresetId = useMemo(() => {
    const activePreset = presets.find(
      (preset) =>
        preset.vertexSource === activeVertexSource && preset.fragmentSource === activeFragmentSource,
    )

    return activePreset?.id ?? presets[0]?.id ?? ''
  }, [activeFragmentSource, activeVertexSource, presets])

  const [selectedPresetId, setSelectedPresetId] = useState(activePresetId)

  useEffect(() => {
    setSelectedPresetId(activePresetId)
  }, [activePresetId])

  const selectedPreset =
    presets.find((preset) => preset.id === selectedPresetId) ?? presets.find((preset) => preset.id === activePresetId)

  return (
    <section className="preset-panel">
      <div className="preset-panel__header">
        <div>
          <p className="panel__eyebrow">Preset</p>
          <h2>예제 셰이더</h2>
        </div>
        <span className="status-chip status-chip--ready">{presets.length}개</span>
      </div>

      <div className="preset-panel__body">
        <label className="preset-panel__select">
          <span>프리셋 선택</span>
          <select
            value={selectedPresetId}
            onChange={(event) => {
              setSelectedPresetId(event.target.value)
            }}
          >
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
        </label>

        <p className="preset-panel__description">{selectedPreset?.description}</p>

        <button
          className="compile-panel__button"
          type="button"
          disabled={!selectedPreset}
          onClick={() => {
            if (selectedPreset) {
              onApplyPreset(selectedPreset)
            }
          }}
        >
          프리셋 적용
        </button>
      </div>
    </section>
  )
}
