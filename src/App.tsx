import './App.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { frameModelBounds } from './core/model/framing/frameModelBounds'
import { loadFbxAsset } from './core/model/loader/loadFbxAsset'
import type { RendererStateSnapshot } from './core/renderer/WebGLQuadRenderer'
import {
  defaultFragmentShaderSource,
  defaultVertexShaderSource,
} from './core/shader/templates/defaultShaders'
import { CompilePanel } from './features/compile-panel/CompilePanel'
import { ShaderEditorPanel } from './features/editor/ShaderEditorPanel'
import { MaterialInspectorPanel } from './features/inspector/MaterialInspectorPanel'
import { ViewportPanel } from './features/viewport/ViewportPanel'
import type {
  MaterialPropertyDefinition,
  MaterialPropertyValue,
} from './shared/types/materialProperty'
import type { ModelAsset } from './shared/types/modelAsset'
import type { RenderDiagnostics } from './shared/types/renderDiagnostics'
import type {
  BlendMode,
  GeometryPreviewId,
  SceneMode,
  ViewportCameraState,
} from './shared/types/scenePreview'
import type { TextureAsset } from './shared/types/textureAsset'
import { loadTextureAsset } from './shared/utils/loadTextureAsset'
import { parseRenderDiagnostics } from './shared/utils/parseDiagnostics'

function buildAutoTextureBindings(
  currentValues: Record<string, MaterialPropertyValue>,
  materialProperties: MaterialPropertyDefinition[],
  modelAsset: ModelAsset,
) {
  const textureProperties = materialProperties.filter((property) => property.uiKind === 'texture')
  if (textureProperties.length === 0 || modelAsset.textureBindings.length === 0) {
    return currentValues
  }

  const nextValues = { ...currentValues }
  const unassignedProperties = textureProperties.filter((property) => {
    const value = nextValues[property.name]
    return typeof value !== 'string' || value.length === 0
  })

  if (unassignedProperties.length === 0) {
    return currentValues
  }

  if (textureProperties.length === 1) {
    nextValues[textureProperties[0].name] = modelAsset.textureBindings[0].textureAssetId
    return nextValues
  }

  if (modelAsset.textureBindings.length !== unassignedProperties.length) {
    return currentValues
  }

  modelAsset.textureBindings.forEach((binding, index) => {
    const property = unassignedProperties[index]
    if (property) {
      nextValues[property.name] = binding.textureAssetId
    }
  })

  return nextValues
}

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
  const [blendMode, setBlendMode] = useState<BlendMode>('opaque')
  const [cameraState, setCameraState] = useState<ViewportCameraState>({
    yaw: 0.6,
    pitch: 0.45,
    distance: 4.8,
  })
  const [modelAsset, setModelAsset] = useState<ModelAsset | null>(null)
  const [modelLoadError, setModelLoadError] = useState<string | null>(null)
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
    setBlendMode(snapshot.blendMode)
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
      const message =
        error instanceof Error ? error.message : '텍스처를 불러오지 못했습니다.'
      setTextureLoadError(message)
    }
  }

  const handleModelUpload = async (files: File[]) => {
    setModelLoadError(null)

    try {
      const nextModelAsset = await loadFbxAsset(files)
      const frameState = frameModelBounds(nextModelAsset.bounds)

      if (nextModelAsset.textureAssets.length > 0) {
        setTextureAssets((currentAssets) => [...currentAssets, ...nextModelAsset.textureAssets])
      }

      setModelAsset(nextModelAsset)
      setSceneMode('model')
      setCameraState((currentState) => ({
        ...currentState,
        distance: frameState.distance,
      }))
      setMaterialValues((currentValues) =>
        buildAutoTextureBindings(currentValues, materialProperties, nextModelAsset),
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'FBX 모델을 불러오지 못했습니다.'
      setModelLoadError(message)
    }
  }

  const handleModelClear = () => {
    setModelAsset(null)
    setModelLoadError(null)
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
        <p className="panel__eyebrow">FBX Start</p>
        <h1>Binary/ASCII FBX 모델과 텍스처를 셰이더에 연결하는 플레이그라운드</h1>
        <p className="hero-panel__description">
          이번 단계에서는 Binary/ASCII FBX 정적 메시를 읽고 node transform과 normal/UV를
          반영한 뒤, 관련 텍스처를 현재 셰이더의 sampler 슬롯과 연결할 수 있는 최소 경로를
          구현합니다.
        </p>

        <div className="hero-panel__grid">
          <article className="info-card">
            <h2>이번 작업 항목</h2>
            <ul>
              <li>FBX 업로드</li>
              <li>Binary/ASCII FBX 메시 파싱</li>
              <li>bounds 기반 프레이밍</li>
              <li>FBX 머티리얼 텍스처 연결</li>
            </ul>
          </article>

          <article className="info-card">
            <h2>주의점</h2>
            <ul>
              <li>이번 단계는 Binary/ASCII FBX 정적 메시를 우선 지원합니다.</li>
              <li>스킨과 애니메이션은 아직 범위 밖입니다.</li>
              <li>sampler 슬롯이 여러 개인 경우 자동 연결은 보수적으로만 수행합니다.</li>
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
            blendMode={blendMode}
            cameraState={cameraState}
            modelAsset={modelAsset}
            modelLoadError={modelLoadError}
            compileRequest={compileRequest}
            onSceneModeChange={setSceneMode}
            onGeometryChange={setGeometryId}
            onBlendModeChange={setBlendMode}
            onCameraChange={setCameraState}
            onModelUpload={handleModelUpload}
            onModelClear={handleModelClear}
            onCompileResult={handleCompileResult}
          />
        </aside>
      </section>
    </main>
  )
}

export default App
