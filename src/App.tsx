import './App.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { defaultFragmentShaderSource, defaultVertexShaderSource } from './core/shader/templates/defaultShaders'
import { CompilePanel } from './features/compile-panel/CompilePanel'
import { ShaderEditorPanel } from './features/editor/ShaderEditorPanel'
import { ViewportPanel } from './features/viewport/ViewportPanel'
import type { RendererStateSnapshot } from './core/renderer/WebGLQuadRenderer'
import type { RenderDiagnostics } from './shared/types/renderDiagnostics'
import { parseRenderDiagnostics } from './shared/utils/parseDiagnostics'

function App() {
  const [vertexSource, setVertexSource] = useState(defaultVertexShaderSource)
  const [fragmentSource, setFragmentSource] = useState(defaultFragmentShaderSource)
  const [autoCompile, setAutoCompile] = useState(true)
  const [compileRequest, setCompileRequest] = useState({
    token: 0,
    mode: 'manual' as 'auto' | 'manual',
  })
  const [isCompiling, setIsCompiling] = useState(false)
  const [lastCompileMode, setLastCompileMode] = useState<'manual' | 'auto' | 'initial'>('initial')
  const [lastCompileSucceeded, setLastCompileSucceeded] = useState(true)
  const [diagnostics, setDiagnostics] = useState<RenderDiagnostics | null>(null)
  const hasMountedRef = useRef(false)

  const parsedLines = useMemo(() => {
    return diagnostics ? parseRenderDiagnostics(diagnostics) : []
  }, [diagnostics])

  useEffect(() => {
    if (!hasMountedRef.current) {
      return
    }

    if (!autoCompile) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setCompileRequest((currentValue) => ({
        token: currentValue.token + 1,
        mode: 'auto',
      }))
    }, 350)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [autoCompile, fragmentSource, vertexSource])

  useEffect(() => {
    hasMountedRef.current = true
  }, [])

  const handleVertexSourceChange = (nextValue: string) => {
    setVertexSource(nextValue)

    if (autoCompile && hasMountedRef.current) {
      setIsCompiling(true)
    }
  }

  const handleFragmentSourceChange = (nextValue: string) => {
    setFragmentSource(nextValue)

    if (autoCompile && hasMountedRef.current) {
      setIsCompiling(true)
    }
  }

  const handleCompileClick = () => {
    setIsCompiling(true)
    setCompileRequest((currentValue) => ({
      token: currentValue.token + 1,
      mode: 'manual',
    }))
  }

  const handleCompileResult = (
    snapshot: RendererStateSnapshot,
    compileMode: 'initial' | 'auto' | 'manual',
  ) => {
    setDiagnostics(snapshot.diagnostics)
    setLastCompileSucceeded(snapshot.compileSucceeded)
    setLastCompileMode(compileMode)
    setIsCompiling(false)
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <p className="panel__eyebrow">Sprint 2</p>
        <h1>코드 편집과 컴파일 제어를 붙인 셰이더 실험 화면</h1>
        <p className="hero-panel__description">
          이번 단계는 vertex/fragment 코드 편집, 수동 compile 버튼, auto compile, 오류 패널을 추가해
          렌더러와 편집 흐름을 연결하는 데 집중합니다.
        </p>

        <div className="hero-panel__grid">
          <article className="info-card">
            <h2>이번 작업 항목</h2>
            <ul>
              <li>코드 에디터 통합</li>
              <li>Compile 버튼 추가</li>
              <li>Auto Compile 추가</li>
              <li>오류 패널 추가</li>
            </ul>
          </article>

          <article className="info-card">
            <h2>적용 기준</h2>
            <ul>
              <li>WebGL2 우선</li>
              <li>GLSL ES 3.00 템플릿 사용</li>
              <li>에러는 화면에 드러내기</li>
              <li>과도한 추상화는 보류</li>
            </ul>
          </article>
        </div>
      </section>

      <section className="workspace">
        <div className="workspace-main">
          <div className="editor-grid">
            <ShaderEditorPanel
              title="Vertex Shader"
              stage="vertex"
              value={vertexSource}
              onChange={handleVertexSourceChange}
            />
            <ShaderEditorPanel
              title="Fragment Shader"
              stage="fragment"
              value={fragmentSource}
              onChange={handleFragmentSourceChange}
            />
          </div>

          <CompilePanel
            diagnostics={diagnostics}
            parsedLines={parsedLines}
            autoCompile={autoCompile}
            isCompiling={isCompiling}
            lastCompileMode={lastCompileMode}
            lastCompileSucceeded={lastCompileSucceeded}
            onCompile={handleCompileClick}
            onToggleAutoCompile={setAutoCompile}
          />
        </div>

        <aside className="workspace-sidebar">
          <ViewportPanel
            vertexSource={vertexSource}
            fragmentSource={fragmentSource}
            compileRequest={compileRequest}
            onCompileResult={handleCompileResult}
          />
        </aside>
      </section>
    </main>
  )
}

export default App
