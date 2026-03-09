import { useEffect, useRef, useState } from 'react'
import { WebGLQuadRenderer, type RendererStateSnapshot } from '../../core/renderer/WebGLQuadRenderer'

interface ViewportPanelState {
  ready: boolean
  message: string
  snapshot: RendererStateSnapshot | null
}

export function ViewportPanel() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [state, setState] = useState<ViewportPanelState>({
    ready: false,
    message: 'WebGL2 렌더러를 초기화하는 중입니다.',
    snapshot: null,
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    let renderer: WebGLQuadRenderer | null = null

    try {
      renderer = new WebGLQuadRenderer(canvas)
      renderer.start()

      setState({
        ready: true,
        message: 'WebGL2, fullscreen quad, 기본 셰이더 링크가 완료되었습니다.',
        snapshot: renderer.getSnapshot(),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '알 수 없는 초기화 오류가 발생했습니다.'
      setState({
        ready: false,
        message,
        snapshot: null,
      })
    }

    return () => {
      renderer?.dispose()
    }
  }, [])

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
          <dd>{state.snapshot?.diagnostics.program.success ? '링크 성공' : '대기'}</dd>
        </div>
      </dl>
    </section>
  )
}
