interface CompilePanelProps {
  autoCompile: boolean
  isCompiling: boolean
  lastCompileMode: 'manual' | 'auto' | 'initial'
  lastCompileSucceeded: boolean
  onCompile: () => void
  onToggleAutoCompile: (nextValue: boolean) => void
}

function formatCompileResult(
  mode: 'manual' | 'auto' | 'initial',
  succeeded: boolean,
) {
  if (mode === 'initial') {
    return succeeded ? '초기 컴파일 완료' : '초기 컴파일 실패'
  }

  const modeLabel = mode === 'auto' ? '자동' : '수동'
  return `${modeLabel} 컴파일 ${succeeded ? '성공' : '실패'}`
}

export function CompilePanel({
  autoCompile,
  isCompiling,
  lastCompileMode,
  lastCompileSucceeded,
  onCompile,
  onToggleAutoCompile,
}: CompilePanelProps) {
  return (
    <section className="compile-panel">
      <div className="compile-panel__header">
        <p className="panel__eyebrow">Compile</p>
        <button
          className="compile-panel__button"
          type="button"
          onClick={onCompile}
          disabled={isCompiling}
        >
          {isCompiling ? '컴파일 중...' : 'Compile'}
        </button>
      </div>

      <label className="compile-panel__toggle">
        <input
          type="checkbox"
          checked={autoCompile}
          onChange={(event) => {
            onToggleAutoCompile(event.target.checked)
          }}
        />
        <span>Auto Compile</span>
      </label>

      <p className="compile-panel__result">
        {isCompiling
          ? '컴파일 중...'
          : formatCompileResult(lastCompileMode, lastCompileSucceeded)}
      </p>
    </section>
  )
}
