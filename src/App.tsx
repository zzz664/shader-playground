import "./App.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { frameModelBounds } from "./core/model/framing/frameModelBounds";
import type { RendererStateSnapshot } from "./core/renderer/WebGLQuadRenderer";
import {
  defaultFragmentShaderSource,
  defaultPostProcessFragmentShaderSource,
  defaultVertexShaderSource,
} from "./core/shader/templates/defaultShaders";
import { AssetBrowserPanel } from "./features/assets/AssetBrowserPanel";
import { CompilePanel } from "./features/compile-panel/CompilePanel";
import { ShaderConsolePanel } from "./features/console/ShaderConsolePanel";
import {
  ShaderEditorPanel,
  type DiagnosticFocusTarget,
} from "./features/editor/ShaderEditorPanel";
import { GuideView } from "./features/guide/GuideView";
import { MaterialInspectorPanel } from "./features/inspector/MaterialInspectorPanel";
import { ModelImportPanel } from "./features/model/ModelImportPanel";
import { ShaderPresetPanel } from "./features/presets/ShaderPresetPanel";
import {
  shaderPresets,
  type ShaderPreset,
} from "./features/presets/shaderPresets";
import { ProjectPanel } from "./features/project/ProjectPanel";
import { ViewportPanel } from "./features/viewport/ViewportPanel";
import type {
  MaterialPropertyDefinition,
  MaterialPropertyValue,
} from "./shared/types/materialProperty";
import type { ModelAsset } from "./shared/types/modelAsset";
import type { ProjectSnapshot } from "./shared/types/projectSnapshot";
import type { RenderDiagnostics } from "./shared/types/renderDiagnostics";
import { defaultModelTransformState } from "./shared/types/scenePreview";
import {
  defaultBlendPresetState,
  defaultPostProcessEnabled,
  defaultSceneRenderTargetFormat,
} from "./shared/types/scenePreview";
import {
  createDefaultPostProcessPass,
  defaultPostProcessChainState,
  type PostProcessChainState,
  type PostProcessRenderTargetFormat,
} from "./shared/types/postProcess";
import type {
  BlendPresetState,
  GeometryPreviewId,
  ModelTransformState,
  ResolutionScale,
  SceneRenderTargetFormat,
  SceneMode,
  ViewportCameraState,
} from "./shared/types/scenePreview";
import type { TextureAsset } from "./shared/types/textureAsset";
import type { TextureWrapMode } from "./shared/types/textureAsset";
import {
  createTextureAssetFromSerialized,
  disposeTextureAsset,
  loadTextureAsset,
  serializeTextureAsset,
} from "./shared/utils/loadTextureAsset";
import { parseRenderDiagnostics } from "./shared/utils/parseDiagnostics";
import {
  clearStoredProjectSnapshot,
  loadStoredProjectSnapshot,
  normalizeProjectSnapshot,
  restoreModelAsset,
  saveProjectSnapshot,
  serializeModelAsset,
} from "./shared/utils/projectPersistence";
import userGuideMarkdown from "../docs/user_webapp_guide.md?raw";
import inspectorGuideMarkdown from "../docs/editor/inspector_comment_metadata_guide.md?raw";

function buildAutoTextureBindings(
  currentValues: Record<string, MaterialPropertyValue>,
  materialProperties: MaterialPropertyDefinition[],
  modelAsset: ModelAsset,
) {
  const textureProperties = materialProperties.filter(
    (property) => property.uiKind === "texture" && property.scope === "scene",
  );
  if (
    textureProperties.length === 0 ||
    modelAsset.textureBindings.length === 0
  ) {
    return currentValues;
  }

  const nextValues = { ...currentValues };
  const unassignedProperties = textureProperties.filter((property) => {
    const value = nextValues[property.id];
    return typeof value !== "string" || value.length === 0;
  });

  if (unassignedProperties.length === 0) {
    return currentValues;
  }

  if (textureProperties.length === 1) {
    nextValues[textureProperties[0].id] =
      modelAsset.textureBindings[0].textureAssetId;
    return nextValues;
  }

  if (modelAsset.textureBindings.length !== unassignedProperties.length) {
    return currentValues;
  }

  modelAsset.textureBindings.forEach((binding, index) => {
    const property = unassignedProperties[index];
    if (property) {
      nextValues[property.id] = binding.textureAssetId;
    }
  });

  return nextValues;
}

function removeTextureReferences(
  values: Record<string, MaterialPropertyValue>,
  assetIds: Set<string>,
) {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      name,
      typeof value === "string" && assetIds.has(value) ? null : value,
    ]),
  );
}

function formatSavedAt(savedAt: string) {
  return new Date(savedAt).toLocaleString("ko-KR");
}

function buildProjectSignature(snapshot: ProjectSnapshot) {
  return JSON.stringify({
    ...snapshot,
    savedAt: "",
  });
}

function buildPostProcessCompileSignature(chainState: PostProcessChainState) {
  return JSON.stringify(
    chainState.passes.map((pass) => ({
      id: pass.id,
      enabled: pass.enabled,
      renderTargetFormat: pass.renderTargetFormat,
      source: pass.source,
    })),
  );
}

function createBlendPresetStateFromLegacyMode(
  blendMode: ProjectSnapshot["blendMode"],
): BlendPresetState {
  if (blendMode === "alpha") {
    return { src: "alpha", dst: "alpha" };
  }

  if (blendMode === "additive") {
    return { src: "additive", dst: "additive" };
  }

  return { src: "opaque", dst: "opaque" };
}

function App() {
  const [appView, setAppView] = useState<
    "playground" | "guide" | "comment-guide"
  >("playground");
  const [vertexSource, setVertexSource] = useState(defaultVertexShaderSource);
  const [fragmentSource, setFragmentSource] = useState(
    defaultFragmentShaderSource,
  );
  const [postProcessChainState, setPostProcessChainState] =
    useState<PostProcessChainState>(defaultPostProcessChainState);
  const [autoCompile, setAutoCompile] = useState(true);
  const [compileRequest, setCompileRequest] = useState({
    token: 0,
    mode: "manual" as "auto" | "manual",
  });
  const [isCompiling, setIsCompiling] = useState(false);
  const [lastCompileMode, setLastCompileMode] = useState<
    "manual" | "auto" | "initial"
  >("initial");
  const [lastCompileSucceeded, setLastCompileSucceeded] = useState(true);
  const [diagnostics, setDiagnostics] = useState<RenderDiagnostics | null>(
    null,
  );
  const [materialProperties, setMaterialProperties] = useState<
    MaterialPropertyDefinition[]
  >([]);
  const [materialValues, setMaterialValues] = useState<
    Record<string, MaterialPropertyValue>
  >({});
  const [textureAssets, setTextureAssets] = useState<TextureAsset[]>([]);
  const [textureLoadError, setTextureLoadError] = useState<string | null>(null);
  const [sceneMode, setSceneMode] = useState<SceneMode>("screen");
  const [geometryId, setGeometryId] = useState<GeometryPreviewId>("cube");
  const [blendPresetState, setBlendPresetState] = useState<BlendPresetState>(
    defaultBlendPresetState,
  );
  const [postProcessEnabled, setPostProcessEnabled] = useState(
    defaultPostProcessEnabled,
  );
  const [sceneRenderTargetFormat, setSceneRenderTargetFormat] =
    useState<SceneRenderTargetFormat>(defaultSceneRenderTargetFormat);
  const [resolutionScale, setResolutionScale] = useState<ResolutionScale>(1);
  const [cameraState, setCameraState] = useState<ViewportCameraState>({
    yaw: 0.6,
    pitch: 0.45,
    distance: 4.8,
  });
  const [modelTransform, setModelTransform] = useState<ModelTransformState>(
    defaultModelTransformState,
  );
  const [modelAsset, setModelAsset] = useState<ModelAsset | null>(null);
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);
  const [isUploadingModel, setIsUploadingModel] = useState(false);
  const [projectStatusMessage, setProjectStatusMessage] = useState<
    string | null
  >(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [isProjectDirty, setIsProjectDirty] = useState(false);
  const [focusedDiagnostic, setFocusedDiagnostic] =
    useState<DiagnosticFocusTarget | null>(null);
  const [activeEditorStage, setActiveEditorStage] = useState<
    "vertex" | "fragment" | "post"
  >("fragment");
  const [activePostProcessPassId, setActivePostProcessPassId] = useState<
    string | null
  >(defaultPostProcessChainState.passes[0]?.id ?? null);
  const hasMountedRef = useRef(false);
  const textureAssetsRef = useRef<TextureAsset[]>([]);
  const restoreInProgressRef = useRef(false);
  const projectSignatureRef = useRef("");

  const parsedLines = useMemo(() => {
    return diagnostics ? parseRenderDiagnostics(diagnostics) : [];
  }, [diagnostics]);

  const postProcessCompileSignature = useMemo(
    () => buildPostProcessCompileSignature(postProcessChainState),
    [postProcessChainState],
  );

  const activePostProcessSource = useMemo(
    () =>
      (postProcessChainState.passes.find(
        (pass) => pass.id === activePostProcessPassId,
      ) ?? postProcessChainState.passes[0])?.source ??
      defaultPostProcessFragmentShaderSource,
    [activePostProcessPassId, postProcessChainState],
  );

  const vertexDiagnosticLines = useMemo(() => {
    return parsedLines.filter((line) => line.stage === "vertex");
  }, [parsedLines]);

  const fragmentDiagnosticLines = useMemo(() => {
    return parsedLines.filter((line) => line.stage === "fragment");
  }, [parsedLines]);

  const postDiagnosticLines = useMemo(() => {
    return parsedLines.filter(
      (line) =>
        line.stage === "post" &&
        (activePostProcessPassId === null || line.passId === activePostProcessPassId),
    );
  }, [activePostProcessPassId, parsedLines]);

  const usedTextureIds = useMemo(() => {
    const ids = new Set<string>();

    Object.values(materialValues).forEach((value) => {
      if (typeof value === "string") {
        ids.add(value);
      }
    });

    modelAsset?.textureBindings.forEach((binding) => {
      ids.add(binding.textureAssetId);
    });

    return ids;
  }, [materialValues, modelAsset]);

  const projectSnapshot = useMemo<ProjectSnapshot>(
    () => ({
      version: 1,
      savedAt: new Date().toISOString(),
      vertexSource,
      fragmentSource,
      postProcessSource: activePostProcessSource,
      postProcessPasses: postProcessChainState.passes,
      activePostProcessPassId,
      postProcessEnabled,
      sceneRenderTargetFormat,
      sceneMode,
      geometryId,
      blendPresetState,
      resolutionScale,
      cameraState,
      modelTransform,
      materialValues,
      textureAssets: textureAssets.map(serializeTextureAsset),
      modelAsset: serializeModelAsset(modelAsset),
    }),
    [
      blendPresetState,
      cameraState,
      fragmentSource,
      geometryId,
      materialValues,
      modelAsset,
      modelTransform,
      activePostProcessSource,
      activePostProcessPassId,
      postProcessChainState,
      postProcessEnabled,
      sceneRenderTargetFormat,
      resolutionScale,
      sceneMode,
      textureAssets,
      vertexSource,
    ],
  );

  const applyProjectSnapshot = async (
    snapshot: ProjectSnapshot,
    sourceLabel: string,
  ) => {
    restoreInProgressRef.current = true;

    try {
      const normalizedSnapshot = normalizeProjectSnapshot(snapshot);
      const restoredTextures = await Promise.all(
        normalizedSnapshot.textureAssets.map((asset) =>
          createTextureAssetFromSerialized(asset),
        ),
      );
      const restoredModelAsset = restoreModelAsset(
        normalizedSnapshot.modelAsset,
        restoredTextures,
      );

      textureAssetsRef.current.forEach((asset) => {
        disposeTextureAsset(asset);
      });

      setTextureAssets(restoredTextures);
      setVertexSource(normalizedSnapshot.vertexSource);
      setFragmentSource(normalizedSnapshot.fragmentSource);
      setPostProcessChainState({
        enabled: normalizedSnapshot.postProcessEnabled,
        passes: normalizedSnapshot.postProcessPasses,
      });
      setActivePostProcessPassId(
        normalizedSnapshot.activePostProcessPassId ??
          normalizedSnapshot.postProcessPasses[0]?.id ??
          null,
      );
      setPostProcessEnabled(normalizedSnapshot.postProcessEnabled);
      setSceneRenderTargetFormat(normalizedSnapshot.sceneRenderTargetFormat);
      setSceneMode(normalizedSnapshot.sceneMode);
      setGeometryId(normalizedSnapshot.geometryId);
      setBlendPresetState(
        normalizedSnapshot.blendPresetState ??
          createBlendPresetStateFromLegacyMode(normalizedSnapshot.blendMode),
      );
      setResolutionScale(normalizedSnapshot.resolutionScale ?? 1);
      setCameraState(normalizedSnapshot.cameraState);
      setModelTransform(normalizedSnapshot.modelTransform);
      setMaterialValues(normalizedSnapshot.materialValues);
      setModelAsset(restoredModelAsset);
      setTextureLoadError(null);
      setModelLoadError(null);
      setLastSavedAt(formatSavedAt(normalizedSnapshot.savedAt));
      setProjectStatusMessage(`${sourceLabel} 불러오기를 완료했습니다.`);
      projectSignatureRef.current = buildProjectSignature(normalizedSnapshot);
      setIsProjectDirty(false);
      setIsCompiling(true);
      setCompileRequest((currentValue) => ({
        token: currentValue.token + 1,
        mode: "manual",
      }));
    } finally {
      restoreInProgressRef.current = false;
    }
  };

  useEffect(() => {
    void (async () => {
      const storedSnapshot = loadStoredProjectSnapshot();
      if (storedSnapshot) {
        await applyProjectSnapshot(storedSnapshot, "로컬 프로젝트");
      }

      hasMountedRef.current = true;
    })();
  }, []);

  useEffect(() => {
    if (!hasMountedRef.current || !autoCompile) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCompileRequest((currentValue) => ({
        token: currentValue.token + 1,
        mode: "auto",
      }));
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [autoCompile, fragmentSource, postProcessCompileSignature, vertexSource]);

  useEffect(() => {
    if (!hasMountedRef.current || restoreInProgressRef.current) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const snapshot = projectSnapshot;
      try {
        saveProjectSnapshot(snapshot);
        projectSignatureRef.current = buildProjectSignature(snapshot);
        setLastSavedAt(formatSavedAt(snapshot.savedAt));
        setProjectStatusMessage("최근 작업을 자동 저장했습니다.");
        setIsProjectDirty(false);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "자동 저장 중 오류가 발생했습니다.";
        setProjectStatusMessage(message);
      }
    }, 500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [projectSnapshot]);

  useEffect(() => {
    if (!hasMountedRef.current || restoreInProgressRef.current) {
      return;
    }

    const nextSignature = buildProjectSignature(projectSnapshot);
    setIsProjectDirty(nextSignature !== projectSignatureRef.current);
  }, [projectSnapshot]);

  useEffect(() => {
    textureAssetsRef.current = textureAssets;
  }, [textureAssets]);

  useEffect(() => {
    return () => {
      textureAssetsRef.current.forEach((asset) => {
        disposeTextureAsset(asset);
      });
    };
  }, []);

  const handleVertexSourceChange = (nextValue: string) => {
    if (nextValue === vertexSource) {
      return;
    }

    setVertexSource(nextValue);

    if (autoCompile && hasMountedRef.current) {
      setIsCompiling(true);
    }
  };

  const handleFragmentSourceChange = (nextValue: string) => {
    if (nextValue === fragmentSource) {
      return;
    }

    setFragmentSource(nextValue);

    if (autoCompile && hasMountedRef.current) {
      setIsCompiling(true);
    }
  };

  const handleCompileClick = () => {
    setIsCompiling(true);
    setCompileRequest((currentValue) => ({
      token: currentValue.token + 1,
      mode: "manual",
    }));
  };

  const handleCompileResult = (
    snapshot: RendererStateSnapshot,
    compileMode: "initial" | "auto" | "manual",
  ) => {
    setFocusedDiagnostic(null);
    setDiagnostics(snapshot.diagnostics);
    setLastCompileSucceeded(snapshot.compileSucceeded);
    setLastCompileMode(compileMode);
    setMaterialProperties(snapshot.materialProperties);
    setMaterialValues((currentValues) => ({
      ...snapshot.materialValues,
      ...currentValues,
    }));
    setIsCompiling(false);
  };

  const handleMaterialValueChange = (
    name: string,
    value: MaterialPropertyValue,
  ) => {
    setMaterialValues((currentValues) => ({
      ...currentValues,
      [name]: value,
    }));
  };

  const handleTextureUpload = async (propertyName: string, file: File) => {
    setTextureLoadError(null);

    try {
      const { asset } = await loadTextureAsset(file, { sourceKind: "manual" });
      setTextureAssets((currentAssets) => [...currentAssets, asset]);
      setMaterialValues((currentValues) => ({
        ...currentValues,
        [propertyName]: asset.id,
      }));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "텍스쳐를 불러오지 못했습니다.";
      setTextureLoadError(message);
    }
  };

  const removeTextureAssetsByIds = (assetIds: Set<string>) => {
    setTextureAssets((currentAssets) => {
      const nextAssets = currentAssets.filter((asset) => {
        if (assetIds.has(asset.id)) {
          disposeTextureAsset(asset);
          return false;
        }

        return true;
      });

      return nextAssets;
    });
    setMaterialValues((currentValues) =>
      removeTextureReferences(currentValues, assetIds),
    );
    setModelAsset((currentModelAsset) => {
      if (!currentModelAsset) {
        return null;
      }

      return {
        ...currentModelAsset,
        textureAssets: currentModelAsset.textureAssets.filter(
          (asset) => !assetIds.has(asset.id),
        ),
        textureBindings: currentModelAsset.textureBindings.filter(
          (binding) => !assetIds.has(binding.textureAssetId),
        ),
      };
    });
  };

  const clearCurrentModel = () => {
    if (modelAsset) {
      const modelTextureIds = new Set(
        textureAssets
          .filter((asset) => asset.ownerModelId === modelAsset.id)
          .map((asset) => asset.id),
      );
      if (modelTextureIds.size > 0) {
        removeTextureAssetsByIds(modelTextureIds);
      }
    }

    setModelAsset(null);
    setModelLoadError(null);
    setModelTransform(defaultModelTransformState);
  };

  const handlePostProcessSourceChange = (nextValue: string) => {
    if (nextValue === activePostProcessSource) {
      return;
    }

    setPostProcessChainState((currentState) => {
      const activePassId =
        activePostProcessPassId ?? currentState.passes[0]?.id ?? null;
      const nextPasses =
        currentState.passes.length > 0
          ? currentState.passes.map((pass) =>
              pass.id === activePassId
                ? {
                    ...pass,
                    source: nextValue,
                  }
                : pass,
            )
          : [createDefaultPostProcessPass({ source: nextValue })];

      return {
        ...currentState,
        passes: nextPasses,
      };
    });

    if (autoCompile && hasMountedRef.current) {
      setIsCompiling(true);
    }
  };

  const handleAddPostProcessPass = () => {
    const nextPassId = `post-pass-${Date.now()}`;
    const nextPass = createDefaultPostProcessPass({
      id: nextPassId,
      name: `Pass ${postProcessChainState.passes.length + 1}`,
    });

    setPostProcessChainState((currentState) => ({
      ...currentState,
      passes: [...currentState.passes, nextPass],
    }));
    setActivePostProcessPassId(nextPassId);
    setActiveEditorStage("post");
    setFocusedDiagnostic(null);

    if (autoCompile && hasMountedRef.current) {
      setIsCompiling(true);
    }
  };

  const handleRemovePostProcessPass = (passId: string) => {
    setPostProcessChainState((currentState) => {
      const nextPasses = currentState.passes.filter((pass) => pass.id !== passId);

      if (nextPasses.length === 0) {
        const fallbackPass = createDefaultPostProcessPass();
        setActivePostProcessPassId(fallbackPass.id);
        return {
          ...currentState,
          passes: [fallbackPass],
        };
      }

      if (activePostProcessPassId === passId) {
        setActivePostProcessPassId(nextPasses[0].id);
      }

      return {
        ...currentState,
        passes: nextPasses,
      };
    });
    setFocusedDiagnostic(null);

    if (autoCompile && hasMountedRef.current) {
      setIsCompiling(true);
    }
  };

  const handleRenamePostProcessPass = (passId: string, name: string) => {
    setPostProcessChainState((currentState) => ({
      ...currentState,
      passes: currentState.passes.map((pass) =>
        pass.id === passId
          ? {
              ...pass,
              name,
            }
          : pass,
      ),
    }));
  };

  const handleMovePostProcessPass = (
    passId: string,
    direction: "up" | "down",
  ) => {
    setPostProcessChainState((currentState) => {
      const index = currentState.passes.findIndex((pass) => pass.id === passId);
      if (index === -1) {
        return currentState;
      }

      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= currentState.passes.length) {
        return currentState;
      }

      const nextPasses = [...currentState.passes];
      const [selectedPass] = nextPasses.splice(index, 1);
      nextPasses.splice(targetIndex, 0, selectedPass);

      return {
        ...currentState,
        passes: nextPasses,
      };
    });
    setFocusedDiagnostic(null);

    if (autoCompile && hasMountedRef.current) {
      setIsCompiling(true);
    }
  };

  const handleUpdatePostProcessPassFormat = (
    passId: string,
    format: PostProcessRenderTargetFormat,
  ) => {
    setPostProcessChainState((currentState) => ({
      ...currentState,
      passes: currentState.passes.map((pass) =>
        pass.id === passId
          ? {
              ...pass,
              renderTargetFormat: format,
            }
          : pass,
      ),
    }));

    if (autoCompile && hasMountedRef.current) {
      setIsCompiling(true);
    }
  };

  const handleModelUpload = async (files: File[]) => {
    setModelLoadError(null);
    setIsUploadingModel(true);

    try {
      if (modelAsset) {
        clearCurrentModel();
      }

      const { loadFbxAsset } = await import("./core/model/loader/loadFbxAsset");
      const nextModelAsset = await loadFbxAsset(files);
      const frameState = frameModelBounds(nextModelAsset.bounds);
      const taggedTextureAssets = nextModelAsset.textureAssets.map((asset) => ({
        ...asset,
        sourceKind: "model" as const,
        ownerModelId: nextModelAsset.id,
      }));
      const nextTaggedModelAsset: ModelAsset = {
        ...nextModelAsset,
        textureAssets: taggedTextureAssets,
      };

      if (taggedTextureAssets.length > 0) {
        setTextureAssets((currentAssets) => [
          ...currentAssets,
          ...taggedTextureAssets,
        ]);
      }

      setModelTransform(defaultModelTransformState);
      setModelAsset(nextTaggedModelAsset);
      setSceneMode("model");
      setCameraState((currentState) => ({
        ...currentState,
        distance: frameState.distance,
      }));
      setMaterialValues((currentValues) =>
        buildAutoTextureBindings(
          currentValues,
          materialProperties,
          nextTaggedModelAsset,
        ),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "FBX 모델을 불러오지 못했습니다.";
      setModelLoadError(message);
    } finally {
      setIsUploadingModel(false);
    }
  };

  const handleDeleteTexture = (assetId: string) => {
    removeTextureAssetsByIds(new Set([assetId]));
    setProjectStatusMessage("텍스처 자산을 삭제하고 참조를 정리했습니다.");
  };

  const handleTextureWrapChange = (
    assetId: string,
    wrapAxis: "wrapS" | "wrapT",
    wrapMode: TextureWrapMode,
  ) => {
    setTextureAssets((currentAssets) =>
      currentAssets.map((asset) =>
        asset.id === assetId
          ? {
              ...asset,
              [wrapAxis]: wrapMode,
            }
          : asset,
      ),
    );
  };

  const handleSaveProject = () => {
    const snapshot = projectSnapshot;
    try {
      saveProjectSnapshot(snapshot);
      projectSignatureRef.current = buildProjectSignature(snapshot);
      setLastSavedAt(formatSavedAt(snapshot.savedAt));
      setProjectStatusMessage("프로젝트를 로컬 저장소에 저장했습니다.");
      setIsProjectDirty(false);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "프로젝트 저장 중 오류가 발생했습니다.";
      setProjectStatusMessage(message);
    }
  };

  const handleLoadProject = async () => {
    const snapshot = loadStoredProjectSnapshot();
    if (!snapshot) {
      setProjectStatusMessage("저장된 로컬 프로젝트가 없습니다.");
      return;
    }

    await applyProjectSnapshot(snapshot, "로컬 프로젝트");
  };

  const handleExportProject = () => {
    const snapshot = projectSnapshot;
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `shader-playground-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setProjectStatusMessage("프로젝트 JSON 내보내기를 완료했습니다.");
  };

  const handleImportProject = async (file: File) => {
    try {
      const parsedSnapshot = normalizeProjectSnapshot(
        JSON.parse(await file.text()) as ProjectSnapshot,
      );
      await applyProjectSnapshot(parsedSnapshot, "JSON 프로젝트");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "프로젝트 파일을 불러오지 못했습니다.";
      setProjectStatusMessage(message);
    }
  };

  const handleClearStoredProject = () => {
    clearStoredProjectSnapshot();
    setProjectStatusMessage("로컬 저장본을 삭제했습니다.");
    projectSignatureRef.current = "";
    setIsProjectDirty(true);
    setLastSavedAt(null);
  };

  const handleSelectDiagnostic = (line: (typeof parsedLines)[number]) => {
    if (line.stage === "program" || line.line === null) {
      return;
    }

    if (line.stage === "post" && line.passId) {
      setActivePostProcessPassId(line.passId);
    }

    setFocusedDiagnostic({
      stage: line.stage,
      passId: line.passId,
      line: line.line,
      column: line.column,
      token: Date.now(),
    });
    setActiveEditorStage(line.stage);
  };

  const handleApplyPreset = (preset: ShaderPreset) => {
    setVertexSource(preset.vertexSource);
    setFragmentSource(preset.fragmentSource);
    setPostProcessChainState(defaultPostProcessChainState);
    setActivePostProcessPassId(defaultPostProcessChainState.passes[0]?.id ?? null);
    setFocusedDiagnostic(null);
    setIsCompiling(true);
    setCompileRequest((currentValue) => ({
      token: currentValue.token + 1,
      mode: "manual",
    }));
  };

  return (
    <>
      <header className="app-header">
        <div className="app-header__brand">
          <p className="panel__eyebrow">Shader Playground</p>
          <strong>웹 셰이더 플레이그라운드</strong>
        </div>

        <div className="app-header__tabs">
          <button
            type="button"
            className={`app-header__tab ${appView === "playground" ? "app-header__tab--active" : ""}`}
            onClick={() => setAppView("playground")}
          >
            Playground
          </button>
          <button
            type="button"
            className={`app-header__tab ${appView === "guide" ? "app-header__tab--active" : ""}`}
            onClick={() => setAppView("guide")}
          >
            이용 가이드
          </button>
          <button
            type="button"
            className={`app-header__tab ${appView === "comment-guide" ? "app-header__tab--active" : ""}`}
            onClick={() => setAppView("comment-guide")}
          >
            주석 가이드
          </button>
        </div>
      </header>

      {appView === "guide" ? (
        <main className="app-shell">
          <GuideView
            eyebrow="Guide"
            title="웹앱 이용 가이드"
            description="셰이더 플레이그라운드의 주요 기능과 기본 작업 흐름을 정리한 사용자용 안내 문서입니다."
            markdown={userGuideMarkdown}
          />
        </main>
      ) : appView === "comment-guide" ? (
        <main className="app-shell">
          <GuideView
            eyebrow="Comment Guide"
            title="인스펙터 주석 이용 가이드"
            description="uniform 주석 메타데이터를 사용해 인스펙터 표시 이름, 그룹, UI 종류와 범위를 제어하는 방법을 정리한 문서입니다."
            markdown={inspectorGuideMarkdown}
          />
        </main>
      ) : (
        <main className="app-shell">
      <section className="topbar-grid">
        <ModelImportPanel
          modelAsset={modelAsset}
          modelLoadError={modelLoadError}
          isUploadingModel={isUploadingModel}
          onModelUpload={handleModelUpload}
          onModelClear={clearCurrentModel}
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

        <CompilePanel
          autoCompile={autoCompile}
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
            key={`viewport-post-${postProcessEnabled ? "on" : "off"}`}
            vertexSource={vertexSource}
            fragmentSource={fragmentSource}
            sceneRenderTargetFormat={sceneRenderTargetFormat}
            postProcessSource={activePostProcessSource}
            postProcessPasses={postProcessChainState.passes}
            materialValues={materialValues}
            textureAssets={textureAssets}
            sceneMode={sceneMode}
            geometryId={geometryId}
            blendPresetState={blendPresetState}
            postProcessEnabled={postProcessEnabled}
            resolutionScale={resolutionScale}
            cameraState={cameraState}
            modelTransform={modelTransform}
            modelAsset={modelAsset}
            compileRequest={compileRequest}
            onSceneModeChange={setSceneMode}
            onGeometryChange={setGeometryId}
            onBlendPresetChange={(blendAxis, blendPreset) =>
              setBlendPresetState((currentState) => ({
                ...currentState,
                [blendAxis]: blendPreset,
              }))
            }
            onPostProcessEnabledChange={setPostProcessEnabled}
            onResolutionScaleChange={setResolutionScale}
            onCameraChange={setCameraState}
            onModelTransformChange={setModelTransform}
            onCompileResult={handleCompileResult}
          />
        </aside>

        <div className="workspace-column workspace-column--editor">
          <ShaderEditorPanel
            activeStage={activeEditorStage}
            vertexSource={vertexSource}
            fragmentSource={fragmentSource}
            sceneRenderTargetFormat={sceneRenderTargetFormat}
            postProcessSource={activePostProcessSource}
            postProcessPasses={postProcessChainState.passes}
            activePostProcessPassId={activePostProcessPassId}
            vertexDiagnostics={vertexDiagnosticLines}
            fragmentDiagnostics={fragmentDiagnosticLines}
            postDiagnostics={postDiagnosticLines}
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
            onSceneRenderTargetFormatChange={setSceneRenderTargetFormat}
            onPostProcessChange={handlePostProcessSourceChange}
            onActivePostProcessPassChange={setActivePostProcessPassId}
            onAddPostProcessPass={handleAddPostProcessPass}
            onRemovePostProcessPass={handleRemovePostProcessPass}
            onRenamePostProcessPass={handleRenamePostProcessPass}
            onMovePostProcessPass={handleMovePostProcessPass}
            onUpdatePostProcessPassFormat={handleUpdatePostProcessPassFormat}
          />

          <ShaderConsolePanel
            diagnostics={diagnostics}
            lines={parsedLines}
            onSelectLine={handleSelectDiagnostic}
          />

          <AssetBrowserPanel
            modelAsset={modelAsset}
            textureAssets={textureAssets}
            usedTextureIds={usedTextureIds}
            onDeleteTexture={handleDeleteTexture}
            onTextureWrapChange={handleTextureWrapChange}
            onClearModel={clearCurrentModel}
          />
        </div>

        <aside className="workspace-column workspace-column--inspector">
          <MaterialInspectorPanel
            properties={materialProperties}
            postProcessPasses={postProcessChainState.passes}
            values={materialValues}
            textureAssets={textureAssets}
            textureLoadError={textureLoadError}
            onValueChange={handleMaterialValueChange}
            onTextureUpload={handleTextureUpload}
          />
        </aside>
      </section>
        </main>
      )}
    </>
  );
}

export default App;
