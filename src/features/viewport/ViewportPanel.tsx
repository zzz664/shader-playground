import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
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
  ResolutionScale,
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
  resolutionScale: ResolutionScale
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
  onResolutionScaleChange: (resolutionScale: ResolutionScale) => void
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

type Vector3 = [number, number, number]

interface ProjectedPoint {
  x: number
  y: number
  depth: number
}

function normalizeVector(vector: Vector3): Vector3 {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1
  return [vector[0] / length, vector[1] / length, vector[2] / length]
}

function crossVectors(a: Vector3, b: Vector3): Vector3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

function dotVectors(a: Vector3, b: Vector3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function createOverlayProjector(cameraState: ViewportCameraState) {
  const distance = 3
  const radius = distance * Math.cos(cameraState.pitch)
  const cameraPosition: Vector3 = [
    Math.sin(cameraState.yaw) * radius,
    Math.sin(cameraState.pitch) * distance,
    Math.cos(cameraState.yaw) * radius,
  ]
  const forward = normalizeVector([-cameraPosition[0], -cameraPosition[1], -cameraPosition[2]])
  const right = normalizeVector(crossVectors(forward, [0, 1, 0]))
  const up = normalizeVector(crossVectors(right, forward))

  return (point: Vector3, scale: number, centerX: number, centerY: number): ProjectedPoint => {
    const cameraX = dotVectors(point, right)
    const cameraY = dotVectors(point, up)
    const cameraZ = dotVectors(point, forward)
    const perspective = 3.6
    const perspectiveScale = perspective / Math.max(1.2, perspective - cameraZ)

    return {
      x: centerX + cameraX * scale * perspectiveScale,
      y: centerY - cameraY * scale * perspectiveScale,
      depth: cameraZ,
    }
  }
}

export function ViewportPanel({
  vertexSource,
  fragmentSource,
  materialValues,
  textureAssets,
  sceneMode,
  geometryId,
  blendMode,
  resolutionScale,
  cameraState,
  modelAsset,
  modelLoadError,
  compileRequest,
  onSceneModeChange,
  onGeometryChange,
  onBlendModeChange,
  onResolutionScaleChange,
  onCameraChange,
  onModelUpload,
  onModelClear,
  onCompileResult,
}: ViewportPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const canvasFrameRef = useRef<HTMLDivElement | null>(null)
  const rendererRef = useRef<WebGLQuadRenderer | null>(null)
  const compileTokenRef = useRef(compileRequest.token)
  const onCompileResultRef = useRef(onCompileResult)
  const dragStateRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    yaw: number
    pitch: number
  } | null>(null)
  const initialSourcesRef = useRef({
    vertexSource,
    fragmentSource,
  })
  const initialPreviewRef = useRef({
    sceneMode,
    geometryId,
    blendMode,
    resolutionScale,
    cameraState,
  })
  const [isUploadingModel, setIsUploadingModel] = useState(false)
  const [isPageVisible, setIsPageVisible] = useState(document.visibilityState === 'visible')
  const [isOrbitDragging, setIsOrbitDragging] = useState(false)
  const [state, setState] = useState<ViewportPanelState>({
    ready: false,
    message: 'WebGL2 뷰포트를 초기화하는 중입니다.',
    snapshot: null,
  })

  const overlayProjector = useMemo(() => createOverlayProjector(cameraState), [cameraState])

  const gizmoAxes = useMemo(() => {
    const center = overlayProjector([0, 0, 0], 1, 50, 50)
    const axes = [
      { id: 'x', label: 'X', color: '#f87171', end: overlayProjector([1, 0, 0], 20, 50, 50) },
      { id: 'y', label: 'Y', color: '#4ade80', end: overlayProjector([0, 1, 0], 20, 50, 50) },
      { id: 'z', label: 'Z', color: '#60a5fa', end: overlayProjector([0, 0, 1], 20, 50, 50) },
    ]

    return axes
      .map((axis) => ({
        ...axis,
        center,
      }))
      .sort((left, right) => left.end.depth - right.end.depth)
  }, [overlayProjector])

  const syncSnapshotState = () => {
    const snapshot = rendererRef.current?.getSnapshot() ?? null
    if (!snapshot) {
      return
    }

    setState((currentState) => ({
      ...currentState,
      snapshot,
    }))
  }

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
      renderer.updateResolutionScale(initialPreviewRef.current.resolutionScale)
      renderer.updateCameraState(initialPreviewRef.current.cameraState)
      renderer.setViewportActive(document.visibilityState === 'visible')
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
    syncSnapshotState()
  }, [sceneMode])

  useEffect(() => {
    rendererRef.current?.updateGeometry(geometryId)
    syncSnapshotState()
  }, [geometryId])

  useEffect(() => {
    rendererRef.current?.updateBlendMode(blendMode)
    syncSnapshotState()
  }, [blendMode])

  useEffect(() => {
    rendererRef.current?.updateResolutionScale(resolutionScale)
    syncSnapshotState()
  }, [resolutionScale])

  useEffect(() => {
    rendererRef.current?.updateCameraState(cameraState)
  }, [cameraState])

  useEffect(() => {
    const handleVisibilityChange = () => {
      const nextVisible = document.visibilityState === 'visible'
      setIsPageVisible(nextVisible)
      rendererRef.current?.setViewportActive(nextVisible)
      syncSnapshotState()
      setState((currentState) => ({
        ...currentState,
        message: nextVisible
          ? '탭이 다시 활성화되어 렌더링을 재개했습니다.'
          : '비활성 탭 상태이므로 렌더링을 일시 중지했습니다.',
      }))
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  useEffect(() => {
    const handlePageHide = () => {
      rendererRef.current?.setViewportActive(false)
    }

    const handlePageShow = () => {
      const nextVisible = document.visibilityState === 'visible'
      rendererRef.current?.setViewportActive(nextVisible)
    }

    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('pageshow', handlePageShow)

    return () => {
      window.removeEventListener('pagehide', handlePageHide)
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [])

  useEffect(() => {
    rendererRef.current?.updateModelAsset(modelAsset)
    syncSnapshotState()
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

  useEffect(() => {
    const canvasFrame = canvasFrameRef.current
    if (!canvasFrame) {
      return
    }

    const clampPitch = (pitch: number) => Math.max(-1.45, Math.min(1.45, pitch))
    const rotationSpeed = 0.01

    const handlePointerDown = (event: PointerEvent) => {
      if (sceneMode !== 'model' || event.button !== 0) {
        return
      }

      dragStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        yaw: cameraState.yaw,
        pitch: cameraState.pitch,
      }
      setIsOrbitDragging(true)
      canvasFrame.setPointerCapture(event.pointerId)
    }

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return
      }

      const deltaX = event.clientX - dragState.startX
      const deltaY = event.clientY - dragState.startY

      onCameraChange({
        ...cameraState,
        yaw: dragState.yaw - deltaX * rotationSpeed,
        pitch: clampPitch(dragState.pitch + deltaY * rotationSpeed),
      })
    }

    const clearDragState = (pointerId: number) => {
      const dragState = dragStateRef.current
      if (!dragState || dragState.pointerId !== pointerId) {
        return
      }

      dragStateRef.current = null
      setIsOrbitDragging(false)
      if (canvasFrame.hasPointerCapture(pointerId)) {
        canvasFrame.releasePointerCapture(pointerId)
      }
    }

    const handlePointerUp = (event: PointerEvent) => {
      clearDragState(event.pointerId)
    }

    const handlePointerCancel = (event: PointerEvent) => {
      clearDragState(event.pointerId)
    }

    canvasFrame.addEventListener('pointerdown', handlePointerDown)
    canvasFrame.addEventListener('pointermove', handlePointerMove)
    canvasFrame.addEventListener('pointerup', handlePointerUp)
    canvasFrame.addEventListener('pointercancel', handlePointerCancel)

    return () => {
      canvasFrame.removeEventListener('pointerdown', handlePointerDown)
      canvasFrame.removeEventListener('pointermove', handlePointerMove)
      canvasFrame.removeEventListener('pointerup', handlePointerUp)
      canvasFrame.removeEventListener('pointercancel', handlePointerCancel)
    }
  }, [cameraState, onCameraChange, sceneMode])

  useEffect(() => {
    const canvasFrame = canvasFrameRef.current
    if (!canvasFrame) {
      return
    }

    const clampDistance = (distance: number) => Math.max(1.2, Math.min(40, distance))

    const handleWheel = (event: WheelEvent) => {
      if (sceneMode !== 'model') {
        return
      }

      event.preventDefault()
      const zoomFactor = Math.exp(event.deltaY * 0.0015)

      onCameraChange({
        ...cameraState,
        distance: clampDistance(cameraState.distance * zoomFactor),
      })
    }

    canvasFrame.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      canvasFrame.removeEventListener('wheel', handleWheel)
    }
  }, [cameraState, onCameraChange, sceneMode])

  return (
    <section className="viewport-panel">
      <div className="viewport-panel__header">
        <p className="panel__eyebrow">Viewport</p>
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

        <label className="viewport-toolbar__select">
          <span>Resolution</span>
          <select
            value={String(resolutionScale)}
            onChange={(event) => onResolutionScaleChange(Number(event.target.value) as ResolutionScale)}
          >
            <option value="0.5">50%</option>
            <option value="0.75">75%</option>
            <option value="1">100%</option>
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
              <dt>메시</dt>
              <dd>{modelAsset.meshCount}</dd>
            </div>
            <div>
              <dt>정점</dt>
              <dd>{modelAsset.vertices.length / 8}</dd>
            </div>
            <div>
              <dt>삼각형</dt>
              <dd>{Math.floor(modelAsset.indices.length / 3)}</dd>
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
            업로드한 FBX가 없으면 기본 geometry preview를 사용합니다.
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

      <div
        ref={canvasFrameRef}
        className={`viewport-panel__canvas-frame ${
          sceneMode === 'model'
            ? isOrbitDragging
              ? 'viewport-panel__canvas-frame--dragging'
              : 'viewport-panel__canvas-frame--orbit'
            : ''
        }`}
      >
        {sceneMode === 'model' ? (
          <>
            <svg className="viewport-gizmo" viewBox="0 0 100 100" aria-hidden="true">
              {gizmoAxes.map((axis) => (
                <g key={axis.id}>
                  <line
                    x1={axis.center.x}
                    y1={axis.center.y}
                    x2={axis.end.x}
                    y2={axis.end.y}
                    stroke={axis.color}
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                  <circle cx={axis.end.x} cy={axis.end.y} r="6.5" fill={axis.color} />
                  <text x={axis.end.x} y={axis.end.y} dy="2.2" textAnchor="middle">
                    {axis.label}
                  </text>
                </g>
              ))}
            </svg>
          </>
        ) : null}

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
          <dt>Scale</dt>
          <dd>{Math.round(resolutionScale * 100)}%</dd>
        </div>
        <div>
          <dt>Geometry</dt>
          <dd>{modelAsset ? 'fbx-mesh' : sceneMode === 'screen' ? 'fullscreen-quad' : geometryId}</dd>
        </div>
        <div>
          <dt>Program</dt>
          <dd>{state.snapshot?.diagnostics.program.success ? '링크 성공' : '실패 유지'}</dd>
        </div>
        <div>
          <dt>Tab</dt>
          <dd>{isPageVisible ? 'active' : 'paused'}</dd>
        </div>
      </dl>
    </section>
  )
}
