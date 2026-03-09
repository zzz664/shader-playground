import { Suspense, lazy } from 'react'
import type { ParsedDiagnosticLine } from '../../shared/types/renderDiagnostics'

const CodeMirrorShaderEditor = lazy(async () => await import('./CodeMirrorShaderEditor'))

export interface DiagnosticFocusTarget {
  stage: 'vertex' | 'fragment'
  line: number
  column?: number | null
  token: number
}

interface ShaderEditorPanelProps {
  activeStage: 'vertex' | 'fragment'
  vertexSource: string
  fragmentSource: string
  vertexDiagnostics: ParsedDiagnosticLine[]
  fragmentDiagnostics: ParsedDiagnosticLine[]
  focusTarget: DiagnosticFocusTarget | null
  onStageChange: (stage: 'vertex' | 'fragment') => void
  onVertexChange: (nextValue: string) => void
  onFragmentChange: (nextValue: string) => void
}

export function ShaderEditorPanel(props: ShaderEditorPanelProps) {
  return (
    <Suspense
      fallback={
        <section className="editor-panel">
          <div className="editor-panel__header">
            <div>
              <p className="panel__eyebrow">Editor</p>
              <h2>Shader Editor</h2>
            </div>
            <span className="editor-panel__stage">loading</span>
          </div>

          <div className="editor-panel__loading">
            <p>CodeMirror 에디터를 불러오는 중입니다.</p>
          </div>
        </section>
      }
    >
      <CodeMirrorShaderEditor {...props} />
    </Suspense>
  )
}
