interface ShaderEditorPanelProps {
  title: string
  stage: 'vertex' | 'fragment'
  value: string
  onChange: (nextValue: string) => void
}

export function ShaderEditorPanel({ title, stage, value, onChange }: ShaderEditorPanelProps) {
  return (
    <section className="editor-panel">
      <div className="editor-panel__header">
        <div>
          <p className="panel__eyebrow">Editor</p>
          <h2>{title}</h2>
        </div>
        <span className="editor-panel__stage">{stage}</span>
      </div>

      <textarea
        className="editor-panel__textarea"
        value={value}
        spellCheck={false}
        onChange={(event) => {
          onChange(event.target.value)
        }}
      />
    </section>
  )
}
