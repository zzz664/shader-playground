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
    presets.find((preset) => preset.id === selectedPresetId) ??
    presets.find((preset) => preset.id === activePresetId)

  return (
    <section className="preset-panel preset-panel--compact">
      <div className="preset-panel__compact-header">
        <p className="panel__eyebrow">Preset</p>
        <span className="preset-panel__count">{presets.length}</span>
      </div>

      <div className="preset-panel__compact-controls">
        <label className="preset-panel__select" htmlFor="shader-preset-select">
          <span className="sr-only">프리셋 선택</span>
          <select
            id="shader-preset-select"
            title={selectedPreset?.description ?? '선택한 프리셋 설명'}
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

        <button
          className="compile-panel__button preset-panel__apply"
          title={selectedPreset?.description ?? '선택한 프리셋 적용'}
          type="button"
          disabled={!selectedPreset}
          onClick={() => {
            if (selectedPreset) {
              onApplyPreset(selectedPreset)
            }
          }}
        >
          적용
        </button>

        <span
          aria-label={selectedPreset?.description ?? '선택한 프리셋 설명'}
          className="preset-panel__info"
          title={selectedPreset?.description ?? '선택한 프리셋 설명'}
        >
          ?
        </span>
      </div>
    </section>
  )
}
