import type { ParsedDiagnosticLine, RenderDiagnostics } from '../../shared/types/renderDiagnostics'

interface CompilePanelProps {
  diagnostics: RenderDiagnostics | null
  parsedLines: ParsedDiagnosticLine[]
  autoCompile: boolean
  isCompiling: boolean
  lastCompileMode: 'manual' | 'auto' | 'initial'
  lastCompileSucceeded: boolean
  onCompile: () => void
  onToggleAutoCompile: (nextValue: boolean) => void
}

export function CompilePanel({
  diagnostics,
  parsedLines,
  autoCompile,
  isCompiling,
  lastCompileMode,
  lastCompileSucceeded,
  onCompile,
  onToggleAutoCompile,
}: CompilePanelProps) {
  const errorCount = parsedLines.length

  return (
    <section className="compile-panel">
      <div className="compile-panel__header">
        <div>
          <p className="panel__eyebrow">Compile</p>
          <h2>컴파일 제어와 오류 패널</h2>
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
          <dd>{lastCompileMode === 'initial' ? '초기화' : lastCompileMode === 'auto' ? '자동' : '수동'}</dd>
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

      <div className="compile-panel__logs">
        {parsedLines.length > 0 ? (
          <ul className="compile-panel__error-list">
            {parsedLines.map((line, index) => (
              <li key={`${line.stage}-${line.line ?? 'na'}-${index}`}>
                <strong>{line.stage}</strong>
                <span>{line.line ? `L${line.line}` : '라인 정보 없음'}</span>
                <p>{line.message}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="compile-panel__empty">
            {diagnostics ? '현재 컴파일 오류가 없습니다.' : '컴파일 결과가 아직 없습니다.'}
          </p>
        )}
      </div>
    </section>
  )
}
