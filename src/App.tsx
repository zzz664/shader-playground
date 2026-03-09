import './App.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { frameModelBounds } from './core/model/framing/frameModelBounds'
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
  ResolutionScale,
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
  const [resolutionScale, setResolutionScale] = useState<ResolutionScale>(1)
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
  const [activeEditorStage, setActiveEditorStage] = useState<'vertex' | 'fragment'>('fragment')
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
      resolutionScale,
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
      resolutionScale,
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
      setResolutionScale(snapshot.resolutionScale ?? 1)
      setCameraState(snapshot.cameraState)
      setMaterialValues(snapshot.materialValues)
      setModelAsset(restoredModelAsset)
      setTextureLoadError(null)
      setModelLoadError(null)
      setLastSavedAt(formatSavedAt(snapshot.savedAt))
      setProjectStatusMessage(`${sourceLabel} 遺덈윭?ㅺ린瑜??꾨즺?덉뒿?덈떎.`)
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
        await applyProjectSnapshot(storedSnapshot, '濡쒖뺄 ?꾨줈?앺듃')
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
        setProjectStatusMessage('理쒓렐 ?묒뾽???먮룞 ??ν뻽?듬땲??')
        setIsProjectDirty(false)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : '?먮룞 ???以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.'
        setProjectStatusMessage(message)
      }
    }, 500)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [projectSnapshot])

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
    if (nextValue === vertexSource) {
      return
    }

    setVertexSource(nextValue)

    if (autoCompile && hasMountedRef.current) {
      setIsCompiling(true)
    }
  }

  const handleFragmentSourceChange = (nextValue: string) => {
    if (nextValue === fragmentSource) {
      return
    }

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
      const message = error instanceof Error ? error.message : '?띿뒪泥섎? 遺덈윭?ㅼ? 紐삵뻽?듬땲??'
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

      const { loadFbxAsset } = await import('./core/model/loader/loadFbxAsset')
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
      const message = error instanceof Error ? error.message : 'FBX 紐⑤뜽??遺덈윭?ㅼ? 紐삵뻽?듬땲??'
      setModelLoadError(message)
    }
  }

  const handleDeleteTexture = (assetId: string) => {
    removeTextureAssetsByIds(new Set([assetId]))
    setProjectStatusMessage('?띿뒪泥??먯궛????젣?섍퀬 李몄“瑜??뺣━?덉뒿?덈떎.')
  }

  const handleSaveProject = () => {
    const snapshot = projectSnapshot
    try {
      saveProjectSnapshot(snapshot)
      projectSignatureRef.current = buildProjectSignature(snapshot)
      setLastSavedAt(formatSavedAt(snapshot.savedAt))
      setProjectStatusMessage('?꾨줈?앺듃瑜?濡쒖뺄 ??μ냼????ν뻽?듬땲??')
      setIsProjectDirty(false)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '?꾨줈?앺듃 ???以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.'
      setProjectStatusMessage(message)
    }
  }

  const handleLoadProject = async () => {
    const snapshot = loadStoredProjectSnapshot()
    if (!snapshot) {
      setProjectStatusMessage('??λ맂 濡쒖뺄 ?꾨줈?앺듃媛 ?놁뒿?덈떎.')
      return
    }

    await applyProjectSnapshot(snapshot, '濡쒖뺄 ?꾨줈?앺듃')
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
    setProjectStatusMessage('?꾨줈?앺듃 JSON ?대낫?닿린瑜??꾨즺?덉뒿?덈떎.')
  }

  const handleImportProject = async (file: File) => {
    try {
      const parsedSnapshot = JSON.parse(await file.text()) as ProjectSnapshot
      await applyProjectSnapshot(parsedSnapshot, 'JSON ?꾨줈?앺듃')
    } catch (error) {
      const message = error instanceof Error ? error.message : '?꾨줈?앺듃 ?뚯씪??遺덈윭?ㅼ? 紐삵뻽?듬땲??'
      setProjectStatusMessage(message)
    }
  }

  const handleClearStoredProject = () => {
    clearStoredProjectSnapshot()
    setProjectStatusMessage('濡쒖뺄 ??λ낯????젣?덉뒿?덈떎.')
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
    setActiveEditorStage(line.stage)
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
      <section className="topbar-grid">
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

        <CompilePanel
          autoCompile={autoCompile}
          errorCount={parsedLines.length}
          isCompiling={isCompiling}
          lastCompileMode={lastCompileMode}
          lastCompileSucceeded={lastCompileSucceeded}
          onCompile={handleCompileClick}
          onToggleAutoCompile={setAutoCompile}
        />
      </section>

      <section className="workspace workspace--three-column">
        <aside className="workspace-column workspace-column--viewport">
          <ViewportPanel
            vertexSource={vertexSource}
            fragmentSource={fragmentSource}
            materialValues={materialValues}
            textureAssets={textureAssets}
            sceneMode={sceneMode}
            geometryId={geometryId}
            blendMode={blendMode}
            resolutionScale={resolutionScale}
            cameraState={cameraState}
            modelAsset={modelAsset}
            modelLoadError={modelLoadError}
            compileRequest={compileRequest}
            onSceneModeChange={setSceneMode}
            onGeometryChange={setGeometryId}
            onBlendModeChange={setBlendMode}
            onResolutionScaleChange={setResolutionScale}
            onCameraChange={setCameraState}
            onModelUpload={handleModelUpload}
            onModelClear={clearCurrentModel}
            onCompileResult={handleCompileResult}
          />
        </aside>

        <div className="workspace-column workspace-column--editor">
          <ShaderEditorPanel
            activeStage={activeEditorStage}
            vertexSource={vertexSource}
            fragmentSource={fragmentSource}
            vertexDiagnostics={vertexDiagnosticLines}
            fragmentDiagnostics={fragmentDiagnosticLines}
            focusTarget={focusedDiagnostic}
            presetSlot={
              <ShaderPresetPanel
                presets={shaderPresets}
                activeVertexSource={vertexSource}
                activeFragmentSource={fragmentSource}
                onApplyPreset={handleApplyPreset}
              />
            }
            onStageChange={setActiveEditorStage}
            onVertexChange={handleVertexSourceChange}
            onFragmentChange={handleFragmentSourceChange}
          />

          <ShaderConsolePanel
            diagnostics={diagnostics}
            lines={parsedLines}
            onSelectLine={handleSelectDiagnostic}
          />
        </div>

        <aside className="workspace-column workspace-column--inspector">
          <MaterialInspectorPanel
            properties={materialProperties}
            values={materialValues}
            textureAssets={textureAssets}
            textureLoadError={textureLoadError}
            onValueChange={handleMaterialValueChange}
            onTextureUpload={handleTextureUpload}
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
