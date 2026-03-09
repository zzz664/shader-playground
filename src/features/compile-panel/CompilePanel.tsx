interface CompilePanelProps {
  autoCompile: boolean
  isCompiling: boolean
  lastCompileMode: 'manual' | 'auto' | 'initial'
  lastCompileSucceeded: boolean
  errorCount: number
  onCompile: () => void
  onToggleAutoCompile: (nextValue: boolean) => void
}

function formatCompileMode(mode: 'manual' | 'auto' | 'initial') {
  if (mode === 'initial') {
    return '초기 상태'
  }

  return mode === 'auto' ? '자동' : '수동'
}

export function CompilePanel({
  autoCompile,
  isCompiling,
  lastCompileMode,
  lastCompileSucceeded,
  errorCount,
  onCompile,
  onToggleAutoCompile,
}: CompilePanelProps) {
  return (
    <section className="compile-panel">
      <div className="compile-panel__header">
        <div>
          <p className="panel__eyebrow">Compile</p>
          <h2>컴파일 제어</h2>
        </div>

        <button className="compile-panel__button" type="button" onClick={onCompile} disabled={isCompiling}>
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

      <dl className="compile-panel__facts">
        <div>
          <dt>마지막 실행</dt>
          <dd>{formatCompileMode(lastCompileMode)}</dd>
        </div>
        <div>
          <dt>결과</dt>
          <dd>{lastCompileSucceeded ? '성공' : '실패'}</dd>
        </div>
        <div>
          <dt>오류 수</dt>
          <dd>{errorCount}</dd>
        </div>
      </dl>
    </section>
  )
}
