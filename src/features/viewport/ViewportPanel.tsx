import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { frameModelBounds } from '../../core/model/framing/frameModelBounds'
import {
  WebGLQuadRenderer,
  type RendererStateSnapshot,
} from '../../core/renderer/WebGLQuadRenderer'
import type { MaterialPropertyValue } from '../../shared/types/materialProperty'
import type { ModelAsset } from '../../shared/types/modelAsset'
import type {
  BlendMode,
  GeometryPreviewId,
  SceneMode,
  ViewportCameraState,
} from '../../shared/types/scenePreview'
import type { TextureAsset } from '../../shared/types/textureAsset'

interface ViewportPanelState {
  ready: boolean
  message: string
  snapshot: RendererStateSnapshot | null
}

interface ViewportPanelProps {
  vertexSource: string
  fragmentSource: string
  materialValues: Record<string, MaterialPropertyValue>
  textureAssets: TextureAsset[]
  sceneMode: SceneMode
  geometryId: GeometryPreviewId
  blendMode: BlendMode
  cameraState: ViewportCameraState
  modelAsset: ModelAsset | null
  modelLoadError: string | null
  compileRequest: {
    token: number
    mode: 'auto' | 'manual'
  }
  onSceneModeChange: (sceneMode: SceneMode) => void
  onGeometryChange: (geometryId: GeometryPreviewId) => void
  onBlendModeChange: (blendMode: BlendMode) => void
  onCameraChange: (cameraState: ViewportCameraState) => void
  onModelUpload: (files: File[]) => Promise<void>
  onModelClear: () => void
  onCompileResult: (snapshot: RendererStateSnapshot, compileMode: 'initial' | 'auto' | 'manual') => void
}

const geometryOptions: Array<{ value: GeometryPreviewId; label: string }> = [
  { value: 'plane', label: 'Plane' },
  { value: 'cube', label: 'Cube' },
  { value: 'sphere', label: 'Sphere' },
]

export function ViewportPanel({
  vertexSource,
  fragmentSource,
  materialValues,
  textureAssets,
  sceneMode,
  geometryId,
  blendMode,
  cameraState,
  modelAsset,
  modelLoadError,
  compileRequest,
  onSceneModeChange,
  onGeometryChange,
  onBlendModeChange,
  onCameraChange,
  onModelUpload,
  onModelClear,
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
  const initialPreviewRef = useRef({
    sceneMode,
    geometryId,
    blendMode,
    cameraState,
  })
  const [isUploadingModel, setIsUploadingModel] = useState(false)
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
      renderer.updateSceneMode(initialPreviewRef.current.sceneMode)
      renderer.updateGeometry(initialPreviewRef.current.geometryId)
      renderer.updateBlendMode(initialPreviewRef.current.blendMode)
      renderer.updateCameraState(initialPreviewRef.current.cameraState)
      renderer.start()
      rendererRef.current = renderer

      const snapshot = renderer.getSnapshot()
      setState({
        ready: true,
        message: 'WebGL2 viewport가 준비되었습니다.',
        snapshot,
      })
      onCompileResultRef.current(snapshot, 'initial')
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '초기화 중 알 수 없는 오류가 발생했습니다.'
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
        ? '최신 셰이더를 적용했습니다.'
        : '컴파일에 실패해 마지막 성공 렌더 결과를 유지합니다.',
    }))
    onCompileResultRef.current(snapshot, compileRequest.mode)
  }, [compileRequest.mode, compileRequest.token, fragmentSource, vertexSource])

  useEffect(() => {
    rendererRef.current?.updateMaterialValues(materialValues)
  }, [materialValues])

  useEffect(() => {
    rendererRef.current?.syncTextureAssets(textureAssets)
  }, [textureAssets])

  useEffect(() => {
    rendererRef.current?.updateSceneMode(sceneMode)
  }, [sceneMode])

  useEffect(() => {
    rendererRef.current?.updateGeometry(geometryId)
  }, [geometryId])

  useEffect(() => {
    rendererRef.current?.updateBlendMode(blendMode)
  }, [blendMode])

  useEffect(() => {
    rendererRef.current?.updateCameraState(cameraState)
  }, [cameraState])

  useEffect(() => {
    rendererRef.current?.updateModelAsset(modelAsset)
    setState((currentState) => ({
      ...currentState,
      message: modelAsset
        ? `${modelAsset.name} 모델을 현재 셰이더로 렌더링 중입니다.`
        : currentState.message,
    }))
  }, [modelAsset])

  const handleCameraAxisChange =
    (key: keyof ViewportCameraState) => (event: ChangeEvent<HTMLInputElement>) => {
      onCameraChange({
        ...cameraState,
        [key]: Number(event.target.value),
      })
    }

  const handleCameraReset = () => {
    const framedDistance = modelAsset ? frameModelBounds(modelAsset.bounds).distance : 4.8

    onCameraChange({
      yaw: 0.6,
      pitch: 0.45,
      distance: framedDistance,
    })
  }

  const handleModelFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const nextFiles = event.target.files ? Array.from(event.target.files) : []
    if (nextFiles.length === 0) {
      return
    }

    setIsUploadingModel(true)
    try {
      await onModelUpload(nextFiles)
    } finally {
      setIsUploadingModel(false)
      event.target.value = ''
    }
  }

  return (
    <section className="viewport-panel">
      <div className="viewport-panel__header">
        <div>
          <p className="panel__eyebrow">Viewport</p>
          <h2>{sceneMode === 'screen' ? 'Screen Preview' : 'FBX Preview'}</h2>
        </div>
        <span className={`status-chip ${state.ready ? 'status-chip--ready' : 'status-chip--error'}`}>
          {state.ready ? '준비됨' : '오류'}
        </span>
      </div>

      <div className="viewport-toolbar">
        <div className="viewport-toolbar__group">
          <button
            type="button"
            className={`viewport-mode-button ${sceneMode === 'screen' ? 'viewport-mode-button--active' : ''}`}
            onClick={() => onSceneModeChange('screen')}
          >
            Screen
          </button>
          <button
            type="button"
            className={`viewport-mode-button ${sceneMode === 'model' ? 'viewport-mode-button--active' : ''}`}
            onClick={() => onSceneModeChange('model')}
          >
            Model
          </button>
        </div>

        <label className="viewport-toolbar__select">
          <span>Geometry</span>
          <select
            value={geometryId}
            onChange={(event) => onGeometryChange(event.target.value as GeometryPreviewId)}
            disabled={sceneMode !== 'model' || modelAsset !== null}
          >
            {geometryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="viewport-toolbar__select">
          <span>Blending</span>
          <select
            value={blendMode}
            onChange={(event) => onBlendModeChange(event.target.value as BlendMode)}
          >
            <option value="opaque">Opaque</option>
            <option value="alpha">Alpha</option>
            <option value="additive">Additive</option>
          </select>
        </label>
      </div>

      <div className="model-upload-card">
        <div className="model-upload-card__header">
          <strong>FBX Import</strong>
          {modelAsset ? (
            <button type="button" className="viewport-controls__reset" onClick={onModelClear}>
              Clear
            </button>
          ) : null}
        </div>

        <label className="texture-slot">
          <span>{isUploadingModel ? 'FBX 로딩 중' : 'FBX와 관련 텍스처 업로드'}</span>
          <input
            type="file"
            accept=".fbx,image/png,image/jpeg,image/webp"
            multiple
            onChange={handleModelFileChange}
            disabled={isUploadingModel}
          />
        </label>

        {modelAsset ? (
          <dl className="model-upload-card__facts">
            <div>
              <dt>파일</dt>
              <dd>{modelAsset.name}</dd>
            </div>
            <div>
              <dt>메쉬</dt>
              <dd>{modelAsset.meshCount}</dd>
            </div>
            <div>
              <dt>정점</dt>
              <dd>{modelAsset.vertices.length / 8}</dd>
            </div>
            <div>
              <dt>삼각형</dt>
              <dd>{modelAsset.indices.length / 3}</dd>
            </div>
            <div>
              <dt>재질</dt>
              <dd>{modelAsset.materialNames.length}</dd>
            </div>
            <div>
              <dt>텍스처</dt>
              <dd>{modelAsset.textureAssets.length}</dd>
            </div>
            <div>
              <dt>반경</dt>
              <dd>{modelAsset.bounds.radius.toFixed(2)}</dd>
            </div>
          </dl>
        ) : (
          <p className="model-upload-card__empty">
            업로드된 FBX가 없으면 기본 geometry preview를 사용합니다.
          </p>
        )}

        {modelAsset?.warningMessages.length ? (
          <ul className="model-upload-card__warnings">
            {modelAsset.warningMessages.map((warningMessage) => (
              <li key={warningMessage}>{warningMessage}</li>
            ))}
          </ul>
        ) : null}

        {modelLoadError ? <p className="model-upload-card__error">{modelLoadError}</p> : null}
      </div>

      <div className="viewport-panel__canvas-frame">
        <canvas ref={canvasRef} className="viewport-panel__canvas" />
      </div>

      <div className="viewport-controls">
        <div className="viewport-controls__header">
          <strong>Viewport Controls</strong>
          <button type="button" className="viewport-controls__reset" onClick={handleCameraReset}>
            Reset
          </button>
        </div>

        <div className="viewport-controls__grid">
          <label>
            <span>Yaw</span>
            <input
              type="range"
              min={-3.14}
              max={3.14}
              step={0.01}
              value={cameraState.yaw}
              onChange={handleCameraAxisChange('yaw')}
              disabled={sceneMode !== 'model'}
            />
          </label>
          <label>
            <span>Pitch</span>
            <input
              type="range"
              min={-1.2}
              max={1.2}
              step={0.01}
              value={cameraState.pitch}
              onChange={handleCameraAxisChange('pitch')}
              disabled={sceneMode !== 'model'}
            />
          </label>
          <label>
            <span>Distance</span>
            <input
              type="range"
              min={1.2}
              max={24}
              step={0.05}
              value={cameraState.distance}
              onChange={handleCameraAxisChange('distance')}
              disabled={sceneMode !== 'model'}
            />
          </label>
        </div>
      </div>

      <p className="viewport-panel__message">{state.message}</p>

      <dl className="viewport-panel__facts">
        <div>
          <dt>해상도</dt>
          <dd>{state.snapshot ? `${state.snapshot.viewportWidth} x ${state.snapshot.viewportHeight}` : '-'}</dd>
        </div>
        <div>
          <dt>Mode</dt>
          <dd>{sceneMode}</dd>
        </div>
        <div>
          <dt>Blend</dt>
          <dd>{blendMode}</dd>
        </div>
        <div>
          <dt>Geometry</dt>
          <dd>{modelAsset ? 'fbx-mesh' : sceneMode === 'screen' ? 'fullscreen-quad' : geometryId}</dd>
        </div>
        <div>
          <dt>Program</dt>
          <dd>{state.snapshot?.diagnostics.program.success ? '링크 성공' : '실패 유지'}</dd>
        </div>
      </dl>
    </section>
  )
}
