import './App.css'
import { defaultFragmentShaderSource, defaultVertexShaderSource } from './core/shader/templates/defaultShaders'
import { ViewportPanel } from './features/viewport/ViewportPanel'

function App() {
  return (
    <main className="app-shell">
      <section className="hero-panel">
        <p className="panel__eyebrow">Sprint 1</p>
        <h1>셰이더 플레이그라운드 초기 렌더링 기반</h1>
        <p className="hero-panel__description">
          이번 단계는 프로젝트 기본 레이아웃과 WebGL2 기반 fullscreen quad 렌더링 경로를 고정하는 데
          집중합니다.
        </p>

        <div className="hero-panel__grid">
          <article className="info-card">
            <h2>이번 작업 항목</h2>
            <ul>
              <li>프로젝트 기본 레이아웃 정리</li>
              <li>WebGL2 컨텍스트 초기화</li>
              <li>fullscreen quad 렌더링</li>
              <li>기본 shader compile/link 구조</li>
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
        <ViewportPanel />

        <aside className="workspace-sidebar">
          <article className="info-card">
            <h2>기본 Vertex Shader</h2>
            <pre>{defaultVertexShaderSource}</pre>
          </article>

          <article className="info-card">
            <h2>기본 Fragment Shader</h2>
            <pre>{defaultFragmentShaderSource}</pre>
          </article>
        </aside>
      </section>
    </main>
  )
}

export default App
