import './App.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { RendererStateSnapshot } from './core/renderer/WebGLQuadRenderer'
import { defaultFragmentShaderSource, defaultVertexShaderSource } from './core/shader/templates/defaultShaders'
import { CompilePanel } from './features/compile-panel/CompilePanel'
import { ShaderEditorPanel } from './features/editor/ShaderEditorPanel'
import { MaterialInspectorPanel } from './features/inspector/MaterialInspectorPanel'
import { ViewportPanel } from './features/viewport/ViewportPanel'
import type {
  MaterialPropertyDefinition,
  MaterialPropertyValue,
} from './shared/types/materialProperty'
import type { RenderDiagnostics } from './shared/types/renderDiagnostics'
import type { GeometryPreviewId, SceneMode, ViewportCameraState } from './shared/types/scenePreview'
import type { TextureAsset } from './shared/types/textureAsset'
import { loadTextureAsset } from './shared/utils/loadTextureAsset'
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
  const [materialProperties, setMaterialProperties] = useState<MaterialPropertyDefinition[]>([])
  const [materialValues, setMaterialValues] = useState<Record<string, MaterialPropertyValue>>({})
  const [textureAssets, setTextureAssets] = useState<TextureAsset[]>([])
  const [textureLoadError, setTextureLoadError] = useState<string | null>(null)
  const [sceneMode, setSceneMode] = useState<SceneMode>('screen')
  const [geometryId, setGeometryId] = useState<GeometryPreviewId>('cube')
  const [cameraState, setCameraState] = useState<ViewportCameraState>({
    yaw: 0.6,
    pitch: 0.45,
    distance: 4.8,
  })
  const hasMountedRef = useRef(false)
  const textureAssetsRef = useRef<TextureAsset[]>([])

  const parsedLines = useMemo(() => {
    return diagnostics ? parseRenderDiagnostics(diagnostics) : []
  }, [diagnostics])

  useEffect(() => {
    if (!hasMountedRef.current || !autoCompile) {
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
    setSceneMode(snapshot.sceneMode)
    setGeometryId(snapshot.geometryId)
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
        <p className="panel__eyebrow">Sprint 5</p>
        <h1>기본 geometry preview와 scene mode 분리를 추가한 셰이더 플레이그라운드</h1>
        <p className="hero-panel__description">
          이번 단계에서는 fullscreen screen preview와 model preview를 분리하고, plane/cube/sphere
          geometry와 기본 viewport controls를 연결합니다.
        </p>

        <div className="hero-panel__grid">
          <article className="info-card">
            <h2>이번 작업 항목</h2>
            <ul>
              <li>기본 geometry preview</li>
              <li>screen/model mode 분리</li>
              <li>viewport controls 기초</li>
            </ul>
          </article>

          <article className="info-card">
            <h2>적용 기준</h2>
            <ul>
              <li>WebGL2 우선</li>
              <li>기본 프리미티브만 제공</li>
              <li>마우스 orbit camera는 보류</li>
              <li>glTF 업로드는 이번 범위에서 제외</li>
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
            sceneMode={sceneMode}
            geometryId={geometryId}
            cameraState={cameraState}
            compileRequest={compileRequest}
            onSceneModeChange={setSceneMode}
            onGeometryChange={setGeometryId}
            onCameraChange={setCameraState}
            onCompileResult={handleCompileResult}
          />
        </aside>
      </section>
    </main>
  )
}

export default App
