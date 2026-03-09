import './App.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { defaultFragmentShaderSource, defaultVertexShaderSource } from './core/shader/templates/defaultShaders'
import { CompilePanel } from './features/compile-panel/CompilePanel'
import { ShaderEditorPanel } from './features/editor/ShaderEditorPanel'
import { MaterialInspectorPanel } from './features/inspector/MaterialInspectorPanel'
import { ViewportPanel } from './features/viewport/ViewportPanel'
import type { RendererStateSnapshot } from './core/renderer/WebGLQuadRenderer'
import type { RenderDiagnostics } from './shared/types/renderDiagnostics'
import { parseRenderDiagnostics } from './shared/utils/parseDiagnostics'
import type {
  MaterialPropertyDefinition,
  MaterialPropertyValue,
} from './shared/types/materialProperty'
import type { TextureAsset } from './shared/types/textureAsset'
import { loadTextureAsset } from './shared/utils/loadTextureAsset'

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
  const [materialProperties, setMaterialProperties] = useState<MaterialPropertyDefinition[]>([])
  const [materialValues, setMaterialValues] = useState<Record<string, MaterialPropertyValue>>({})
  const [textureAssets, setTextureAssets] = useState<TextureAsset[]>([])
  const [textureLoadError, setTextureLoadError] = useState<string | null>(null)
  const hasMountedRef = useRef(false)
  const textureAssetsRef = useRef<TextureAsset[]>([])

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
    setMaterialProperties(snapshot.materialProperties)
    setMaterialValues(snapshot.materialValues)
    setIsCompiling(false)
  }

  const handleMaterialValueChange = (name: string, value: MaterialPropertyValue) => {
    setMaterialValues((currentValues) => ({
      ...currentValues,
      [name]: value,
    }))
  }

  const handleTextureUpload = async (propertyName: string, file: File) => {
    setTextureLoadError(null)

    try {
      const { asset } = await loadTextureAsset(file)

      setTextureAssets((currentAssets) => [...currentAssets, asset])
      setMaterialValues((currentValues) => ({
        ...currentValues,
        [propertyName]: asset.id,
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : '텍스처를 불러오지 못했습니다.'
      setTextureLoadError(message)
    }
  }

  useEffect(() => {
    textureAssetsRef.current = textureAssets
  }, [textureAssets])

  useEffect(() => {
    return () => {
      textureAssetsRef.current.forEach((asset) => {
        URL.revokeObjectURL(asset.previewUrl)
        asset.bitmap.close()
      })
    }
  }, [])

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <p className="panel__eyebrow">Sprint 4</p>
        <h1>텍스처 업로드와 sampler2D 연결을 붙인 머티리얼 실험 화면</h1>
        <p className="hero-panel__description">
          이번 단계는 texture upload, `sampler2D` 슬롯 자동 연결, 텍스처 preview를 추가해 머티리얼 인스펙터를 확장하는 데 집중합니다.
        </p>

        <div className="hero-panel__grid">
          <article className="info-card">
            <h2>이번 작업 항목</h2>
            <ul>
              <li>texture upload</li>
              <li>sampler2D 연결</li>
              <li>texture preview</li>
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

          <MaterialInspectorPanel
            properties={materialProperties}
            values={materialValues}
            textureAssets={textureAssets}
            textureLoadError={textureLoadError}
            onValueChange={handleMaterialValueChange}
            onTextureUpload={handleTextureUpload}
          />
        </div>

        <aside className="workspace-sidebar">
          <ViewportPanel
            vertexSource={vertexSource}
            fragmentSource={fragmentSource}
            materialValues={materialValues}
            textureAssets={textureAssets}
            compileRequest={compileRequest}
            onCompileResult={handleCompileResult}
          />
        </aside>
      </section>
    </main>
  )
}

export default App
