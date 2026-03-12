import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { frameModelBounds } from "../../core/model/framing/frameModelBounds";
import {
  WebGLQuadRenderer,
  type RendererStateSnapshot,
} from "../../core/renderer/WebGLQuadRenderer";
import type { MaterialPropertyValue } from "../../shared/types/materialProperty";
import type { ModelAsset } from "../../shared/types/modelAsset";
import type { PostProcessPass } from "../../shared/types/postProcess";
import type {
  BlendPreset,
  BlendPresetState,
  GeometryPreviewId,
  ModelTransformState,
  ResolutionScale,
  SceneRenderTargetFormat,
  SceneMode,
  ViewportCameraState,
} from "../../shared/types/scenePreview";
import type { TextureAsset } from "../../shared/types/textureAsset";

interface ViewportPanelState {
  ready: boolean;
  message: string;
  snapshot: RendererStateSnapshot | null;
}

interface ViewportPanelProps {
  vertexSource: string;
  fragmentSource: string;
  postProcessSource: string;
  postProcessPasses: PostProcessPass[];
  materialValues: Record<string, MaterialPropertyValue>;
  textureAssets: TextureAsset[];
  sceneMode: SceneMode;
  geometryId: GeometryPreviewId;
  blendPresetState: BlendPresetState;
  postProcessEnabled: boolean;
  sceneRenderTargetFormat: SceneRenderTargetFormat;
  resolutionScale: ResolutionScale;
  cameraState: ViewportCameraState;
  modelTransform: ModelTransformState;
  modelAsset: ModelAsset | null;
  compileRequest: {
    token: number;
    mode: "auto" | "manual";
  };
  onSceneModeChange: (sceneMode: SceneMode) => void;
  onGeometryChange: (geometryId: GeometryPreviewId) => void;
  onBlendPresetChange: (
    blendAxis: "src" | "dst",
    blendPreset: BlendPreset,
  ) => void;
  onPostProcessEnabledChange: (enabled: boolean) => void;
  onResolutionScaleChange: (resolutionScale: ResolutionScale) => void;
  onCameraChange: (cameraState: ViewportCameraState) => void;
  onModelTransformChange: (modelTransform: ModelTransformState) => void;
  onCompileResult: (
    snapshot: RendererStateSnapshot,
    compileMode: "initial" | "auto" | "manual",
  ) => void;
}

const geometryOptions: Array<{ value: GeometryPreviewId; label: string }> = [
  { value: "plane", label: "Plane" },
  { value: "cube", label: "Cube" },
  { value: "sphere", label: "Sphere" },
];

export function ViewportPanel({
  vertexSource,
  fragmentSource,
  postProcessSource,
  postProcessPasses,
  materialValues,
  textureAssets,
  sceneMode,
  geometryId,
  blendPresetState,
  postProcessEnabled,
  sceneRenderTargetFormat,
  resolutionScale,
  cameraState,
  modelTransform,
  modelAsset,
  compileRequest,
  onSceneModeChange,
  onGeometryChange,
  onBlendPresetChange,
  onPostProcessEnabledChange,
  onResolutionScaleChange,
  onCameraChange,
  onCompileResult,
}: ViewportPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasFrameRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<WebGLQuadRenderer | null>(null);
  const compileTokenRef = useRef(compileRequest.token);
  const onCompileResultRef = useRef(onCompileResult);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    yaw: number;
    pitch: number;
  } | null>(null);
  const initialSourcesRef = useRef({
    vertexSource,
    fragmentSource,
    postProcessSource,
    postProcessPasses,
  });
  const initialPreviewRef = useRef({
    sceneMode,
    geometryId,
    blendPresetState,
    postProcessEnabled,
    sceneRenderTargetFormat,
    resolutionScale,
    cameraState,
    modelTransform,
  });
  const [isPageVisible, setIsPageVisible] = useState(
    document.visibilityState === "visible",
  );
  const [isOrbitDragging, setIsOrbitDragging] = useState(false);
  const [state, setState] = useState<ViewportPanelState>({
    ready: false,
    message: "WebGL2 뷰포트를 초기화하는 중입니다.",
    snapshot: null,
  });

  const syncSnapshotState = useCallback(() => {
    const snapshot = rendererRef.current?.getSnapshot() ?? null;
    if (!snapshot) {
      return;
    }

    setState((currentState) => ({
      ...currentState,
      snapshot,
    }));
  }, []);

  const scheduleSnapshotStateSync = useCallback(() => {
    window.requestAnimationFrame(() => {
      syncSnapshotState();
    });
  }, [syncSnapshotState]);

  useEffect(() => {
    onCompileResultRef.current = onCompileResult;
  }, [onCompileResult]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let renderer: WebGLQuadRenderer | null = null;

    try {
      renderer = new WebGLQuadRenderer(canvas, {
        vertexSource: initialSourcesRef.current.vertexSource,
        fragmentSource: initialSourcesRef.current.fragmentSource,
        postProcessSource: initialSourcesRef.current.postProcessSource,
        postProcessPasses: initialSourcesRef.current.postProcessPasses,
      });
      renderer.updateSceneMode(initialPreviewRef.current.sceneMode);
      renderer.updateGeometry(initialPreviewRef.current.geometryId);
      renderer.updateBlendPresetState(
        initialPreviewRef.current.blendPresetState,
      );
      renderer.updatePostProcessEnabled(
        initialPreviewRef.current.postProcessEnabled,
      );
      renderer.updateSceneRenderTargetFormat(
        initialPreviewRef.current.sceneRenderTargetFormat,
      );
      renderer.updateResolutionScale(initialPreviewRef.current.resolutionScale);
      renderer.updateCameraState(initialPreviewRef.current.cameraState);
      renderer.updateModelTransform(initialPreviewRef.current.modelTransform);
      renderer.setViewportActive(document.visibilityState === "visible");
      renderer.start();
      rendererRef.current = renderer;

      const snapshot = renderer.getSnapshot();
      setState({
        ready: true,
        message: "WebGL2 뷰포트가 준비되었습니다.",
        snapshot,
      });
      onCompileResultRef.current(snapshot, "initial");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "초기화 중 알 수 없는 오류가 발생했습니다.";
      setState({
        ready: false,
        message,
        snapshot: null,
      });
    }

    return () => {
      rendererRef.current = null;
      renderer?.dispose();
    };
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || compileTokenRef.current === compileRequest.token) {
      return;
    }

    compileTokenRef.current = compileRequest.token;
    const snapshot = renderer.compileSources(
      vertexSource,
      fragmentSource,
      postProcessPasses,
    );
    setState((currentState) => ({
      ...currentState,
      snapshot,
      message: snapshot.compileSucceeded
        ? "최신 셰이더를 적용했습니다."
        : "컴파일에 실패해 마지막 성공 렌더 결과를 유지합니다.",
    }));
    onCompileResultRef.current(snapshot, compileRequest.mode);
  }, [
    compileRequest.mode,
    compileRequest.token,
    fragmentSource,
    postProcessPasses,
    vertexSource,
  ]);

  useEffect(() => {
    rendererRef.current?.updatePostProcessPasses(postProcessPasses);
  }, [postProcessPasses]);

  useEffect(() => {
    rendererRef.current?.updateMaterialValues(materialValues);
  }, [materialValues]);

  useEffect(() => {
    rendererRef.current?.syncTextureAssets(textureAssets);
  }, [textureAssets]);

  useEffect(() => {
    rendererRef.current?.updateSceneMode(sceneMode);
    scheduleSnapshotStateSync();
  }, [sceneMode, scheduleSnapshotStateSync]);

  useEffect(() => {
    rendererRef.current?.updateGeometry(geometryId);
    scheduleSnapshotStateSync();
  }, [geometryId, scheduleSnapshotStateSync]);

  useEffect(() => {
    rendererRef.current?.updateBlendPresetState(blendPresetState);
    scheduleSnapshotStateSync();
  }, [blendPresetState, scheduleSnapshotStateSync]);

  useEffect(() => {
    rendererRef.current?.updatePostProcessEnabled(postProcessEnabled);
    scheduleSnapshotStateSync();
  }, [postProcessEnabled, scheduleSnapshotStateSync]);

  useEffect(() => {
    rendererRef.current?.updateSceneRenderTargetFormat(sceneRenderTargetFormat);
    scheduleSnapshotStateSync();
  }, [sceneRenderTargetFormat, scheduleSnapshotStateSync]);

  useEffect(() => {
    rendererRef.current?.updateResolutionScale(resolutionScale);
    scheduleSnapshotStateSync();
  }, [resolutionScale, scheduleSnapshotStateSync]);

  useEffect(() => {
    rendererRef.current?.updateCameraState(cameraState);
  }, [cameraState]);

  useEffect(() => {
    rendererRef.current?.updateModelTransform(modelTransform);
  }, [modelTransform]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      const nextVisible = document.visibilityState === "visible";
      setIsPageVisible(nextVisible);
      rendererRef.current?.setViewportActive(nextVisible);
      syncSnapshotState();
      setState((currentState) => ({
        ...currentState,
        message: nextVisible
          ? "탭이 다시 활성화되어 렌더링을 재개했습니다."
          : "비활성 탭 상태이므로 렌더링을 일시 중지했습니다.",
      }));
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [syncSnapshotState]);

  useEffect(() => {
    const handlePageHide = () => {
      rendererRef.current?.setViewportActive(false);
    };

    const handlePageShow = () => {
      const nextVisible = document.visibilityState === "visible";
      rendererRef.current?.setViewportActive(nextVisible);
    };

    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.updateModelAsset(modelAsset);
    window.requestAnimationFrame(() => {
      syncSnapshotState();
      setState((currentState) => ({
        ...currentState,
        message: modelAsset
          ? `${modelAsset.name} 모델이 현재 뷰포트에 반영되었습니다.`
          : currentState.message,
      }));
    });
  }, [modelAsset, syncSnapshotState]);

  const handleCameraAxisChange =
    (key: keyof ViewportCameraState) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      onCameraChange({
        ...cameraState,
        [key]: Number(event.target.value),
      });
    };

  const handleCameraReset = () => {
    const framedDistance = modelAsset
      ? frameModelBounds(modelAsset.bounds).distance
      : 4.8;

    onCameraChange({
      yaw: 0.6,
      pitch: 0.45,
      distance: framedDistance,
    });
  };

  const handleViewportKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const nativeKeyboardEvent = event.nativeEvent as KeyboardEvent & {
      isComposing?: boolean;
    };

    if (
      event.key.toLowerCase() !== "r" ||
      event.repeat ||
      nativeKeyboardEvent.isComposing
    ) {
      return;
    }

    rendererRef.current?.restartPlayback();
    setState((currentState) => ({
      ...currentState,
      message: "셰이더 재생 시간을 다시 시작했습니다.",
    }));
  };

  useEffect(() => {
    const canvasFrame = canvasFrameRef.current;
    if (!canvasFrame) {
      return;
    }

    const clampPitch = (pitch: number) =>
      Math.max(-1.45, Math.min(1.45, pitch));
    const rotationSpeed = 0.01;

    const handlePointerDown = (event: PointerEvent) => {
      if (sceneMode !== "model" || event.button !== 0) {
        return;
      }

      dragStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        yaw: cameraState.yaw,
        pitch: cameraState.pitch,
      };
      setIsOrbitDragging(true);
      canvasFrame.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      const deltaX = event.clientX - dragState.startX;
      const deltaY = event.clientY - dragState.startY;

      onCameraChange({
        ...cameraState,
        yaw: dragState.yaw - deltaX * rotationSpeed,
        pitch: clampPitch(dragState.pitch + deltaY * rotationSpeed),
      });
    };

    const clearDragState = (pointerId: number) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== pointerId) {
        return;
      }

      dragStateRef.current = null;
      setIsOrbitDragging(false);
      if (canvasFrame.hasPointerCapture(pointerId)) {
        canvasFrame.releasePointerCapture(pointerId);
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      clearDragState(event.pointerId);
    };

    const handlePointerCancel = (event: PointerEvent) => {
      clearDragState(event.pointerId);
    };

    canvasFrame.addEventListener("pointerdown", handlePointerDown);
    canvasFrame.addEventListener("pointermove", handlePointerMove);
    canvasFrame.addEventListener("pointerup", handlePointerUp);
    canvasFrame.addEventListener("pointercancel", handlePointerCancel);

    return () => {
      canvasFrame.removeEventListener("pointerdown", handlePointerDown);
      canvasFrame.removeEventListener("pointermove", handlePointerMove);
      canvasFrame.removeEventListener("pointerup", handlePointerUp);
      canvasFrame.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [cameraState, onCameraChange, sceneMode]);

  useEffect(() => {
    const canvasFrame = canvasFrameRef.current;
    if (!canvasFrame) {
      return;
    }

    const clampDistance = (distance: number) =>
      Math.max(1.2, Math.min(40, distance));

    const handleWheel = (event: WheelEvent) => {
      if (sceneMode !== "model") {
        return;
      }

      event.preventDefault();
      const zoomFactor = Math.exp(event.deltaY * 0.0015);

      onCameraChange({
        ...cameraState,
        distance: clampDistance(cameraState.distance * zoomFactor),
      });
    };

    canvasFrame.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      canvasFrame.removeEventListener("wheel", handleWheel);
    };
  }, [cameraState, onCameraChange, sceneMode]);

  return (
    <section className="viewport-panel">
      <div className="viewport-panel__header">
        <p className="panel__eyebrow">Viewport</p>
      </div>

      <div className="viewport-toolbar">
        <div className="viewport-toolbar__group">
          <button
            type="button"
            className={`viewport-mode-button ${sceneMode === "screen" ? "viewport-mode-button--active" : ""}`}
            onClick={() => onSceneModeChange("screen")}
          >
            Screen
          </button>
          <button
            type="button"
            className={`viewport-mode-button ${sceneMode === "model" ? "viewport-mode-button--active" : ""}`}
            onClick={() => onSceneModeChange("model")}
          >
            Model
          </button>
        </div>

        <label className="viewport-toolbar__select">
          <span>Geometry</span>
          <select
            value={geometryId}
            onChange={(event) =>
              onGeometryChange(event.target.value as GeometryPreviewId)
            }
            disabled={sceneMode !== "model" || modelAsset !== null}
          >
            {geometryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="viewport-toolbar__select">
          <span>Src Blend</span>
          <select
            value={blendPresetState.src}
            onChange={(event) =>
              onBlendPresetChange("src", event.target.value as BlendPreset)
            }
          >
            <option value="opaque">Opaque</option>
            <option value="alpha">Alpha</option>
            <option value="additive">Additive</option>
          </select>
        </label>

        <label className="viewport-toolbar__select">
          <span>Dst Blend</span>
          <select
            value={blendPresetState.dst}
            onChange={(event) =>
              onBlendPresetChange("dst", event.target.value as BlendPreset)
            }
          >
            <option value="opaque">Opaque</option>
            <option value="alpha">Alpha</option>
            <option value="additive">Additive</option>
          </select>
        </label>

        <label className="viewport-toolbar__select">
          <span>Post</span>
          <select
            value={postProcessEnabled ? "on" : "off"}
            onChange={(event) =>
              onPostProcessEnabledChange(event.target.value === "on")
            }
          >
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
        </label>

        <label className="viewport-toolbar__select">
          <span>Resolution</span>
          <select
            value={String(resolutionScale)}
            onChange={(event) =>
              onResolutionScaleChange(
                Number(event.target.value) as ResolutionScale,
              )
            }
          >
            <option value="0.5">50%</option>
            <option value="0.75">75%</option>
            <option value="1">100%</option>
          </select>
        </label>
      </div>

      <div
        ref={canvasFrameRef}
        className={`viewport-panel__canvas-frame ${
          sceneMode === "model"
            ? isOrbitDragging
              ? "viewport-panel__canvas-frame--dragging"
              : "viewport-panel__canvas-frame--orbit"
            : ""
        }`}
        tabIndex={0}
        onKeyDown={handleViewportKeyDown}
      >
        <canvas ref={canvasRef} className="viewport-panel__canvas" />
      </div>

      <div className="viewport-controls">
        <div className="viewport-controls__header">
          <strong>Viewport Controls</strong>
          <button
            type="button"
            className="viewport-controls__reset"
            onClick={handleCameraReset}
          >
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
              onChange={handleCameraAxisChange("yaw")}
              disabled={sceneMode !== "model"}
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
              onChange={handleCameraAxisChange("pitch")}
              disabled={sceneMode !== "model"}
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
              onChange={handleCameraAxisChange("distance")}
              disabled={sceneMode !== "model"}
            />
          </label>
        </div>
      </div>

      <p className="viewport-panel__message">{state.message}</p>

      <dl className="viewport-panel__facts">
        <div>
          <dt>Program</dt>
          <dd>
            {state.snapshot?.diagnostics.program.success ? "링크 성공" : "실패 유지"}
          </dd>
        </div>
        <div>
          <dt>Tab</dt>
          <dd>{isPageVisible ? "active" : "paused"}</dd>
        </div>
      </dl>
    </section>
  );
}
