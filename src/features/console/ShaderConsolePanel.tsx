import type { ParsedDiagnosticLine, RenderDiagnostics } from '../../shared/types/renderDiagnostics'

interface ShaderConsolePanelProps {
  diagnostics: RenderDiagnostics | null
  lines: ParsedDiagnosticLine[]
  onSelectLine: (line: ParsedDiagnosticLine) => void
}

function formatStage(stage: ParsedDiagnosticLine['stage']) {
  if (stage === 'program') {
    return 'program'
  }

  if (stage === 'vertex') {
    return 'vertex'
  }

  if (stage === 'fragment') {
    return 'fragment'
  }

  return 'post'
}

export function ShaderConsolePanel({ diagnostics, lines, onSelectLine }: ShaderConsolePanelProps) {
  return (
    <section className="console-panel">
      <div className="console-panel__header">
        <p className="panel__eyebrow">Console</p>
        <span
          className={`status-chip ${lines.length > 0 ? 'status-chip--error' : 'status-chip--ready'}`}
        >
          {lines.length > 0 ? `진단 ${lines.length}건` : '오류 없음'}
        </span>
      </div>

      <div className="console-panel__body">
        {lines.length > 0 ? (
          <ul className="console-panel__list">
            {lines.map((line, index) => (
              <li
                key={`${line.stage}-${line.passId ?? 'global'}-${line.line ?? 'na'}-${index}`}
                className="console-line"
              >
                <button
                  className={`console-line__button console-line__button--${line.severity}`}
                  type="button"
                  onClick={() => {
                    onSelectLine(line)
                  }}
                >
                  <div className="console-line__meta">
                    <strong>{formatStage(line.stage)}</strong>
                    {line.passName ? <span>{line.passName}</span> : null}
                    <span>{line.line ? `L${line.line}` : '라인 정보 없음'}</span>
                    {line.column ? <span>C{line.column}</span> : null}
                    <span>{line.severity === 'warning' ? '경고' : '오류'}</span>
                  </div>
                  <p>{line.message}</p>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="console-panel__empty">
            {diagnostics ? '현재 컴파일 오류가 없습니다.' : '아직 출력할 컴파일 로그가 없습니다.'}
          </p>
        )}
      </div>
    </section>
  )
}
