import { useEffect, useRef, useState } from 'react'
import { WebGLQuadRenderer, type RendererStateSnapshot } from '../../core/renderer/WebGLQuadRenderer'

interface ViewportPanelState {
  ready: boolean
  message: string
  snapshot: RendererStateSnapshot | null
}

interface ViewportPanelProps {
  vertexSource: string
  fragmentSource: string
  compileRequest: {
    token: number
    mode: 'auto' | 'manual'
  }
  onCompileResult: (snapshot: RendererStateSnapshot, compileMode: 'initial' | 'auto' | 'manual') => void
}

export function ViewportPanel({
  vertexSource,
  fragmentSource,
  compileRequest,
  onCompileResult,
}: ViewportPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<WebGLQuadRenderer | null>(null)
  const compileTokenRef = useRef(compileRequest.token)
  const onCompileResultRef = useRef(onCompileResult)
  const initialSourcesRef = useRef({
    vertexSource,
    fragmentSource,
  })
  const [state, setState] = useState<ViewportPanelState>({
    ready: false,
    message: 'WebGL2 렌더러를 초기화하는 중입니다.',
    snapshot: null,
  })

  useEffect(() => {
    onCompileResultRef.current = onCompileResult
  }, [onCompileResult])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    let renderer: WebGLQuadRenderer | null = null

    try {
      renderer = new WebGLQuadRenderer(canvas, {
        vertexSource: initialSourcesRef.current.vertexSource,
        fragmentSource: initialSourcesRef.current.fragmentSource,
      })
      rendererRef.current = renderer
      renderer.start()
      const snapshot = renderer.getSnapshot()

      setState({
        ready: true,
        message: 'WebGL2, fullscreen quad, 기본 셰이더 링크가 완료되었습니다.',
        snapshot,
      })
      onCompileResultRef.current(snapshot, 'initial')
    } catch (error) {
      const message = error instanceof Error ? error.message : '알 수 없는 초기화 오류가 발생했습니다.'
      setState({
        ready: false,
        message,
        snapshot: null,
      })
    }

    return () => {
      rendererRef.current = null
      renderer?.dispose()
    }
  }, [])

  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer || compileTokenRef.current === compileRequest.token) {
      return
    }

    compileTokenRef.current = compileRequest.token
    const snapshot = renderer.compileSources(vertexSource, fragmentSource)

    setState((currentState) => ({
      ...currentState,
      snapshot,
      message: snapshot.compileSucceeded
        ? '최신 셰이더가 적용되었습니다.'
        : '컴파일에 실패하여 마지막 성공 결과를 유지합니다.',
    }))

    onCompileResultRef.current(snapshot, compileRequest.mode)
  }, [compileRequest.mode, compileRequest.token, fragmentSource, vertexSource])

  return (
    <section className="viewport-panel">
      <div className="viewport-panel__header">
        <div>
          <p className="panel__eyebrow">Viewport</p>
          <h2>WebGL2 fullscreen quad</h2>
        </div>
        <span className={`status-chip ${state.ready ? 'status-chip--ready' : 'status-chip--error'}`}>
          {state.ready ? '준비됨' : '오류'}
        </span>
      </div>

      <div className="viewport-panel__canvas-frame">
        <canvas ref={canvasRef} className="viewport-panel__canvas" />
      </div>

      <p className="viewport-panel__message">{state.message}</p>

      <dl className="viewport-panel__facts">
        <div>
          <dt>해상도</dt>
          <dd>
            {state.snapshot ? `${state.snapshot.viewportWidth} x ${state.snapshot.viewportHeight}` : '-'}
          </dd>
        </div>
        <div>
          <dt>Vertex</dt>
          <dd>{state.snapshot?.diagnostics.shaders[0]?.success ? '성공' : '대기'}</dd>
        </div>
        <div>
          <dt>Fragment</dt>
          <dd>{state.snapshot?.diagnostics.shaders[1]?.success ? '성공' : '대기'}</dd>
        </div>
        <div>
          <dt>Program</dt>
          <dd>{state.snapshot?.diagnostics.program.success ? '링크 성공' : '실패 유지'}</dd>
        </div>
      </dl>
    </section>
  )
}
