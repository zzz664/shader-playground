import { Suspense, lazy, type ReactNode } from 'react'
import type { PostProcessPass } from '../../shared/types/postProcess'
import type { ParsedDiagnosticLine } from '../../shared/types/renderDiagnostics'

const CodeMirrorShaderEditor = lazy(async () => await import('./CodeMirrorShaderEditor'))

export interface DiagnosticFocusTarget {
  stage: 'vertex' | 'fragment' | 'post'
  passId?: string
  line: number
  column?: number | null
  token: number
}

interface ShaderEditorPanelProps {
  activeStage: 'vertex' | 'fragment' | 'post'
  vertexSource: string
  fragmentSource: string
  postProcessSource: string
  postProcessPasses: PostProcessPass[]
  activePostProcessPassId: string | null
  vertexDiagnostics: ParsedDiagnosticLine[]
  fragmentDiagnostics: ParsedDiagnosticLine[]
  postDiagnostics: ParsedDiagnosticLine[]
  focusTarget: DiagnosticFocusTarget | null
  presetSlot?: ReactNode
  onStageChange: (stage: 'vertex' | 'fragment' | 'post') => void
  onVertexChange: (nextValue: string) => void
  onFragmentChange: (nextValue: string) => void
  onPostProcessChange: (nextValue: string) => void
  onActivePostProcessPassChange: (passId: string) => void
  onAddPostProcessPass: () => void
  onRemovePostProcessPass: (passId: string) => void
  onRenamePostProcessPass: (passId: string, name: string) => void
  onMovePostProcessPass: (passId: string, direction: 'up' | 'down') => void
}

export function ShaderEditorPanel(props: ShaderEditorPanelProps) {
  return (
    <Suspense
      fallback={
        <section className="editor-panel">
          <div className="editor-panel__header">
            <p className="panel__eyebrow">Editor</p>
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
