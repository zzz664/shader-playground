import './App.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { frameModelBounds } from './core/model/framing/frameModelBounds'
import { loadFbxAsset } from './core/model/loader/loadFbxAsset'
import type { RendererStateSnapshot } from './core/renderer/WebGLQuadRenderer'
import {
  defaultFragmentShaderSource,
  defaultVertexShaderSource,
} from './core/shader/templates/defaultShaders'
import { AssetBrowserPanel } from './features/assets/AssetBrowserPanel'
import { CompilePanel } from './features/compile-panel/CompilePanel'
import { ShaderConsolePanel } from './features/console/ShaderConsolePanel'
import { ShaderEditorPanel, type DiagnosticFocusTarget } from './features/editor/ShaderEditorPanel'
import { MaterialInspectorPanel } from './features/inspector/MaterialInspectorPanel'
import { ShaderPresetPanel } from './features/presets/ShaderPresetPanel'
import { shaderPresets, type ShaderPreset } from './features/presets/shaderPresets'
import { ProjectPanel } from './features/project/ProjectPanel'
import { ViewportPanel } from './features/viewport/ViewportPanel'
import type {
  MaterialPropertyDefinition,
  MaterialPropertyValue,
} from './shared/types/materialProperty'
import type { ModelAsset } from './shared/types/modelAsset'
import type { ProjectSnapshot } from './shared/types/projectSnapshot'
import type { RenderDiagnostics } from './shared/types/renderDiagnostics'
import type {
  BlendMode,
  GeometryPreviewId,
  SceneMode,
  ViewportCameraState,
} from './shared/types/scenePreview'
import type { TextureAsset } from './shared/types/textureAsset'
import {
  createTextureAssetFromSerialized,
  disposeTextureAsset,
  loadTextureAsset,
  serializeTextureAsset,
} from './shared/utils/loadTextureAsset'
import { parseRenderDiagnostics } from './shared/utils/parseDiagnostics'
import {
  clearStoredProjectSnapshot,
  loadStoredProjectSnapshot,
  restoreModelAsset,
  saveProjectSnapshot,
  serializeModelAsset,
} from './shared/utils/projectPersistence'

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

function removeTextureReferences(
  values: Record<string, MaterialPropertyValue>,
  assetIds: Set<string>,
) {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      name,
      typeof value === 'string' && assetIds.has(value) ? null : value,
    ]),
  )
}

function formatSavedAt(savedAt: string) {
  return new Date(savedAt).toLocaleString('ko-KR')
}

function buildProjectSignature(snapshot: ProjectSnapshot) {
  return JSON.stringify({
    ...snapshot,
    savedAt: '',
  })
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
  const [projectStatusMessage, setProjectStatusMessage] = useState<string | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [isProjectDirty, setIsProjectDirty] = useState(false)
  const [focusedDiagnostic, setFocusedDiagnostic] = useState<DiagnosticFocusTarget | null>(null)
  const hasMountedRef = useRef(false)
  const textureAssetsRef = useRef<TextureAsset[]>([])
  const restoreInProgressRef = useRef(false)
  const projectSignatureRef = useRef('')

  const parsedLines = useMemo(() => {
    return diagnostics ? parseRenderDiagnostics(diagnostics) : []
  }, [diagnostics])

  const vertexDiagnosticLines = useMemo(() => {
    return parsedLines.filter((line) => line.stage === 'vertex')
  }, [parsedLines])

  const fragmentDiagnosticLines = useMemo(() => {
    return parsedLines.filter((line) => line.stage === 'fragment')
  }, [parsedLines])

  const usedTextureIds = useMemo(() => {
    const ids = new Set<string>()

    Object.values(materialValues).forEach((value) => {
      if (typeof value === 'string') {
        ids.add(value)
      }
    })

    modelAsset?.textureBindings.forEach((binding) => {
      ids.add(binding.textureAssetId)
    })

    return ids
  }, [materialValues, modelAsset])

  const projectSnapshot = useMemo<ProjectSnapshot>(
    () => ({
      version: 1,
      savedAt: new Date().toISOString(),
      vertexSource,
      fragmentSource,
      sceneMode,
      geometryId,
      blendMode,
      cameraState,
      materialValues,
      textureAssets: textureAssets.map(serializeTextureAsset),
      modelAsset: serializeModelAsset(modelAsset),
    }),
    [
      blendMode,
      cameraState,
      fragmentSource,
      geometryId,
      materialValues,
      modelAsset,
      sceneMode,
      textureAssets,
      vertexSource,
    ],
  )

  const applyProjectSnapshot = async (snapshot: ProjectSnapshot, sourceLabel: string) => {
    restoreInProgressRef.current = true

    try {
      const restoredTextures = await Promise.all(
        snapshot.textureAssets.map((asset) => createTextureAssetFromSerialized(asset)),
      )
      const restoredModelAsset = restoreModelAsset(snapshot.modelAsset, restoredTextures)

      textureAssetsRef.current.forEach((asset) => {
        disposeTextureAsset(asset)
      })

      setTextureAssets(restoredTextures)
      setVertexSource(snapshot.vertexSource)
      setFragmentSource(snapshot.fragmentSource)
      setSceneMode(snapshot.sceneMode)
      setGeometryId(snapshot.geometryId)
      setBlendMode(snapshot.blendMode)
      setCameraState(snapshot.cameraState)
      setMaterialValues(snapshot.materialValues)
      setModelAsset(restoredModelAsset)
      setTextureLoadError(null)
      setModelLoadError(null)
      setLastSavedAt(formatSavedAt(snapshot.savedAt))
      setProjectStatusMessage(`${sourceLabel} 불러오기를 완료했습니다.`)
      projectSignatureRef.current = buildProjectSignature(snapshot)
      setIsProjectDirty(false)
      setIsCompiling(true)
      setCompileRequest((currentValue) => ({
        token: currentValue.token + 1,
        mode: 'manual',
      }))
    } finally {
      restoreInProgressRef.current = false
    }
  }

  useEffect(() => {
    void (async () => {
      const storedSnapshot = loadStoredProjectSnapshot()
      if (storedSnapshot) {
        await applyProjectSnapshot(storedSnapshot, '로컬 프로젝트')
      }

      hasMountedRef.current = true
    })()
  }, [])

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
    if (!hasMountedRef.current || restoreInProgressRef.current) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      const snapshot = projectSnapshot
      try {
        saveProjectSnapshot(snapshot)
        projectSignatureRef.current = buildProjectSignature(snapshot)
        setLastSavedAt(formatSavedAt(snapshot.savedAt))
        setProjectStatusMessage('최근 작업을 자동 저장했습니다.')
        setIsProjectDirty(false)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : '자동 저장 중 오류가 발생했습니다.'
        setProjectStatusMessage(message)
      }
    }, 500)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [
    projectSnapshot,
  ])

  useEffect(() => {
    if (!hasMountedRef.current || restoreInProgressRef.current) {
      return
    }

    const nextSignature = buildProjectSignature(projectSnapshot)
    setIsProjectDirty(nextSignature !== projectSignatureRef.current)
  }, [projectSnapshot])

  useEffect(() => {
    textureAssetsRef.current = textureAssets
  }, [textureAssets])

  useEffect(() => {
    return () => {
      textureAssetsRef.current.forEach((asset) => {
        disposeTextureAsset(asset)
      })
    }
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
    setFocusedDiagnostic(null)
    setDiagnostics(snapshot.diagnostics)
    setLastCompileSucceeded(snapshot.compileSucceeded)
    setLastCompileMode(compileMode)
    setMaterialProperties(snapshot.materialProperties)
    setMaterialValues((currentValues) => ({
      ...snapshot.materialValues,
      ...currentValues,
    }))
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
      const { asset } = await loadTextureAsset(file, { sourceKind: 'manual' })
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

  const removeTextureAssetsByIds = (assetIds: Set<string>) => {
    setTextureAssets((currentAssets) => {
      const nextAssets = currentAssets.filter((asset) => {
        if (assetIds.has(asset.id)) {
          disposeTextureAsset(asset)
          return false
        }

        return true
      })

      return nextAssets
    })
    setMaterialValues((currentValues) => removeTextureReferences(currentValues, assetIds))
    setModelAsset((currentModelAsset) => {
      if (!currentModelAsset) {
        return null
      }

      return {
        ...currentModelAsset,
        textureAssets: currentModelAsset.textureAssets.filter((asset) => !assetIds.has(asset.id)),
        textureBindings: currentModelAsset.textureBindings.filter(
          (binding) => !assetIds.has(binding.textureAssetId),
        ),
      }
    })
  }

  const clearCurrentModel = () => {
    if (modelAsset) {
      const modelTextureIds = new Set(
        textureAssets.filter((asset) => asset.ownerModelId === modelAsset.id).map((asset) => asset.id),
      )
      if (modelTextureIds.size > 0) {
        removeTextureAssetsByIds(modelTextureIds)
      }
    }

    setModelAsset(null)
    setModelLoadError(null)
  }

  const handleModelUpload = async (files: File[]) => {
    setModelLoadError(null)

    try {
      if (modelAsset) {
        clearCurrentModel()
      }

      const nextModelAsset = await loadFbxAsset(files)
      const frameState = frameModelBounds(nextModelAsset.bounds)
      const taggedTextureAssets = nextModelAsset.textureAssets.map((asset) => ({
        ...asset,
        sourceKind: 'model' as const,
        ownerModelId: nextModelAsset.id,
      }))
      const nextTaggedModelAsset: ModelAsset = {
        ...nextModelAsset,
        textureAssets: taggedTextureAssets,
      }

      if (taggedTextureAssets.length > 0) {
        setTextureAssets((currentAssets) => [...currentAssets, ...taggedTextureAssets])
      }

      setModelAsset(nextTaggedModelAsset)
      setSceneMode('model')
      setCameraState((currentState) => ({
        ...currentState,
        distance: frameState.distance,
      }))
      setMaterialValues((currentValues) =>
        buildAutoTextureBindings(currentValues, materialProperties, nextTaggedModelAsset),
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'FBX 모델을 불러오지 못했습니다.'
      setModelLoadError(message)
    }
  }

  const handleDeleteTexture = (assetId: string) => {
    removeTextureAssetsByIds(new Set([assetId]))
    setProjectStatusMessage('텍스처 자산을 삭제하고 참조를 정리했습니다.')
  }

  const handleSaveProject = () => {
    const snapshot = projectSnapshot
    try {
      saveProjectSnapshot(snapshot)
      projectSignatureRef.current = buildProjectSignature(snapshot)
      setLastSavedAt(formatSavedAt(snapshot.savedAt))
      setProjectStatusMessage('프로젝트를 로컬 저장소에 저장했습니다.')
      setIsProjectDirty(false)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '프로젝트 저장 중 오류가 발생했습니다.'
      setProjectStatusMessage(message)
    }
  }

  const handleLoadProject = async () => {
    const snapshot = loadStoredProjectSnapshot()
    if (!snapshot) {
      setProjectStatusMessage('저장된 로컬 프로젝트가 없습니다.')
      return
    }

    await applyProjectSnapshot(snapshot, '로컬 프로젝트')
  }

  const handleExportProject = () => {
    const snapshot = projectSnapshot
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `shader-playground-${Date.now()}.json`
    link.click()
    URL.revokeObjectURL(url)
    setProjectStatusMessage('프로젝트 JSON 내보내기를 완료했습니다.')
  }

  const handleImportProject = async (file: File) => {
    try {
      const parsedSnapshot = JSON.parse(await file.text()) as ProjectSnapshot
      await applyProjectSnapshot(parsedSnapshot, 'JSON 프로젝트')
    } catch (error) {
      const message = error instanceof Error ? error.message : '프로젝트 파일을 불러오지 못했습니다.'
      setProjectStatusMessage(message)
    }
  }

  const handleClearStoredProject = () => {
    clearStoredProjectSnapshot()
    setProjectStatusMessage('로컬 저장본을 삭제했습니다.')
    projectSignatureRef.current = ''
    setIsProjectDirty(true)
    setLastSavedAt(null)
  }

  const handleSelectDiagnostic = (line: (typeof parsedLines)[number]) => {
    if (line.stage === 'program' || line.line === null) {
      return
    }

    setFocusedDiagnostic({
      stage: line.stage,
      line: line.line,
      column: line.column,
      token: Date.now(),
    })
  }

  const handleApplyPreset = (preset: ShaderPreset) => {
    setVertexSource(preset.vertexSource)
    setFragmentSource(preset.fragmentSource)
    setFocusedDiagnostic(null)
    setIsCompiling(true)
    setCompileRequest((currentValue) => ({
      token: currentValue.token + 1,
      mode: 'manual',
    }))
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <p className="panel__eyebrow">Sprint 8</p>
        <h1>프로젝트 저장과 에셋 관리를 포함한 셰이더 플레이그라운드</h1>
        <p className="hero-panel__description">
          이번 단계에서는 현재 작업 상태를 저장하고 다시 불러올 수 있게 만들고, 업로드한
          텍스처와 모델을 한 곳에서 확인하고 정리할 수 있는 asset browser를 추가합니다.
        </p>

        <div className="hero-panel__grid">
          <article className="info-card">
            <h2>이번 작업 항목</h2>
            <ul>
              <li>project save / load</li>
              <li>asset browser</li>
              <li>cleanup / stability 작업</li>
            </ul>
          </article>

          <article className="info-card">
            <h2>주의점</h2>
            <ul>
              <li>최근 작업 저장은 localStorage 기반으로 구현합니다.</li>
              <li>자산 삭제 시 연결된 shader 참조와 모델 텍스처 참조를 함께 정리합니다.</li>
              <li>IndexedDB 기반 대용량 저장은 이번 범위에 포함하지 않습니다.</li>
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
              diagnostics={vertexDiagnosticLines}
              focusTarget={focusedDiagnostic}
              onChange={handleVertexSourceChange}
            />
            <ShaderEditorPanel
              title="Fragment Shader"
              stage="fragment"
              value={fragmentSource}
              diagnostics={fragmentDiagnosticLines}
              focusTarget={focusedDiagnostic}
              onChange={handleFragmentSourceChange}
            />
          </div>

          <ShaderPresetPanel
            presets={shaderPresets}
            activeVertexSource={vertexSource}
            activeFragmentSource={fragmentSource}
            onApplyPreset={handleApplyPreset}
          />

          <CompilePanel
            autoCompile={autoCompile}
            errorCount={parsedLines.length}
            isCompiling={isCompiling}
            lastCompileMode={lastCompileMode}
            lastCompileSucceeded={lastCompileSucceeded}
            onCompile={handleCompileClick}
            onToggleAutoCompile={setAutoCompile}
          />

          <ShaderConsolePanel
            diagnostics={diagnostics}
            lines={parsedLines}
            onSelectLine={handleSelectDiagnostic}
          />

          <MaterialInspectorPanel
            properties={materialProperties}
            values={materialValues}
            textureAssets={textureAssets}
            textureLoadError={textureLoadError}
            onValueChange={handleMaterialValueChange}
            onTextureUpload={handleTextureUpload}
          />

          <ProjectPanel
            isDirty={isProjectDirty}
            lastSavedAt={lastSavedAt}
            projectStatusMessage={projectStatusMessage}
            onSave={handleSaveProject}
            onLoad={handleLoadProject}
            onExport={handleExportProject}
            onImport={handleImportProject}
            onClearStored={handleClearStoredProject}
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
            onModelClear={clearCurrentModel}
            onCompileResult={handleCompileResult}
          />

          <AssetBrowserPanel
            modelAsset={modelAsset}
            textureAssets={textureAssets}
            usedTextureIds={usedTextureIds}
            onDeleteTexture={handleDeleteTexture}
            onClearModel={clearCurrentModel}
          />
        </aside>
      </section>
    </main>
  )
}

export default App
