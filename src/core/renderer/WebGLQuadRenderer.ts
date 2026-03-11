import type { MaterialPropertyDefinition, MaterialPropertyValue } from '../../shared/types/materialProperty'
import type { ModelAsset, ModelBounds } from '../../shared/types/modelAsset'
import type { PostProcessPass } from '../../shared/types/postProcess'
import type { RenderDiagnostics } from '../../shared/types/renderDiagnostics'
import {
  defaultBlendPresetState,
  defaultModelTransformState,
  defaultPostProcessEnabled,
} from '../../shared/types/scenePreview'
import type {
  BlendPreset,
  BlendPresetState,
  GeometryPreviewId,
  ModelTransformState,
  ResolutionScale,
  SceneMode,
  ViewportCameraState,
} from '../../shared/types/scenePreview'
import type { TextureAsset, TextureWrapMode } from '../../shared/types/textureAsset'
import { frameModelBounds } from '../model/framing/frameModelBounds'
import { createShaderProgram } from '../shader/compiler/shaderCompiler'
import {
  createDefaultMaterialValue,
  isMaterialValueCompatible,
  reflectActiveUniforms,
} from '../shader/reflection/reflectActiveUniforms'
import {
  defaultFragmentShaderSource,
  defaultPostProcessFragmentShaderSource,
  defaultPostProcessVertexShaderSource,
  defaultVertexShaderSource,
} from '../shader/templates/defaultShaders'
import { createScreenQuadMesh, getPrimitiveMeshData, PRIMITIVE_VERTEX_STRIDE } from './geometry/primitiveMeshes'
import { createWebGL2Context } from './gl/webglContext'
import {
  createEulerRotationMatrix4,
  createIdentityMatrix4,
  createLookAtMatrix4,
  createPerspectiveMatrix4,
  createTranslationMatrix4,
  multiplyMatrix4,
} from './math/matrix4'

interface UploadedMesh {
  vao: WebGLVertexArrayObject
  vertexBuffer: WebGLBuffer
  indexBuffer: WebGLBuffer
  indexCount: number
  indexType: number
}

interface HelperLineMesh {
  vao: WebGLVertexArrayObject
  vertexBuffer: WebGLBuffer
  vertexCount: number
}

interface RendererUniformLocations {
  time: WebGLUniformLocation | null
  resolution: WebGLUniformLocation | null
  sceneMode: WebGLUniformLocation | null
  model: WebGLUniformLocation | null
  view: WebGLUniformLocation | null
  projection: WebGLUniformLocation | null
  cameraPosition: WebGLUniformLocation | null
}

type BuiltinUniformKey =
  | 'time'
  | 'resolution'
  | 'sceneMode'
  | 'model'
  | 'view'
  | 'projection'
  | 'cameraPosition'

interface HelperProgramUniformLocations {
  view: WebGLUniformLocation | null
  projection: WebGLUniformLocation | null
}

interface PostProcessUniformLocations {
  sceneColor: WebGLUniformLocation | null
  prevPassColor: WebGLUniformLocation | null
  passColors: Array<WebGLUniformLocation | null>
  resolution: WebGLUniformLocation | null
  time: WebGLUniformLocation | null
}

interface SceneRenderTarget {
  framebuffer: WebGLFramebuffer
  colorTexture: WebGLTexture
  depthRenderbuffer: WebGLRenderbuffer
  width: number
  height: number
}

interface PostRenderTarget {
  framebuffer: WebGLFramebuffer
  colorTexture: WebGLTexture
  width: number
  height: number
}

interface PostPassRuntime {
  id: string
  name: string
  enabled: boolean
  source: string
  program: WebGLProgram
  uniformLocations: PostProcessUniformLocations
}

const GRID_VERTEX_SHADER_SOURCE = `#version 300 es

precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec4 aColor;

uniform mat4 uView;
uniform mat4 uProj;

out vec4 vColor;

void main() {
  vColor = aColor;
  gl_Position = uProj * uView * vec4(aPosition, 1.0);
}
`

const GRID_FRAGMENT_SHADER_SOURCE = `#version 300 es

precision highp float;

in vec4 vColor;

out vec4 outColor;

void main() {
  outColor = vColor;
}
`

const builtinUniformAliases: Record<BuiltinUniformKey, string[]> = {
  time: ['uTime'],
  resolution: ['uResolution'],
  sceneMode: ['uSceneMode'],
  model: ['uModel'],
  view: ['uView'],
  projection: ['uProj'],
  cameraPosition: ['uCameraPos'],
}

const postProcessBuiltinUniformNames = new Set(
  ['uSceneColor', 'uPrevPassColor', 'uResolution', 'uTime'].map((name) => name.toLowerCase()),
)

export interface RendererStateSnapshot {
  diagnostics: RenderDiagnostics
  viewportWidth: number
  viewportHeight: number
  compileSucceeded: boolean
  materialProperties: MaterialPropertyDefinition[]
  materialValues: Record<string, MaterialPropertyValue>
  sceneMode: SceneMode
  geometryId: GeometryPreviewId
  blendPresetState: BlendPresetState
  postProcessEnabled: boolean
  resolutionScale: ResolutionScale
}

export class WebGLQuadRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly gl: WebGL2RenderingContext
  private program: WebGLProgram
  private readonly resizeObserver: ResizeObserver
  private animationFrameId: number | null = null
  private elapsedSeconds = 0
  private lastFrameTime = 0
  private viewportWidth = 0
  private viewportHeight = 0
  private diagnostics: RenderDiagnostics
  private compileSucceeded = false
  private vertexSource: string
  private fragmentSource: string
  private postProcessPasses: PostProcessPass[]
  private materialProperties: MaterialPropertyDefinition[] = []
  private materialValues: Record<string, MaterialPropertyValue> = {}
  private materialUniformLocations = new Map<string, WebGLUniformLocation>()
  private textureAssets = new Map<string, WebGLTexture>()
  private fallbackTexture: WebGLTexture | null = null
  private postFallbackTexture: WebGLTexture | null = null
  private uniformLocations: RendererUniformLocations
  private readonly helperProgram: WebGLProgram
  private readonly helperUniformLocations: HelperProgramUniformLocations
  private readonly copyPostProcessProgram: WebGLProgram
  private readonly copyPostProcessUniformLocations: PostProcessUniformLocations
  private postPassRuntimes: PostPassRuntime[] = []
  private sceneRenderTarget: SceneRenderTarget | null = null
  private postRenderTargets: PostRenderTarget[] = []
  private screenMesh: UploadedMesh
  private geometryMeshes: Record<GeometryPreviewId, UploadedMesh>
  private readonly gridMesh: HelperLineMesh
  private uploadedModelMesh: UploadedMesh | null = null
  private uploadedModelBounds: ModelBounds | null = null
  private sceneMode: SceneMode = 'screen'
  private geometryId: GeometryPreviewId = 'cube'
  private blendPresetState: BlendPresetState = {
    src: defaultBlendPresetState.src,
    dst: defaultBlendPresetState.dst,
  }
  private postProcessEnabled = defaultPostProcessEnabled
  private resolutionScale: ResolutionScale = 1
  private isViewportActive = true
  private modelTransform: ModelTransformState = {
    position: { ...defaultModelTransformState.position },
    rotation: { ...defaultModelTransformState.rotation },
  }
  private cameraState: ViewportCameraState = {
    yaw: 0.6,
    pitch: 0.45,
    distance: 4.8,
  }

  constructor(
    canvas: HTMLCanvasElement,
    initialSources: {
      vertexSource?: string
      fragmentSource?: string
      postProcessSource?: string
      postProcessPasses?: PostProcessPass[]
    } = {},
  ) {
    this.canvas = canvas
    this.gl = createWebGL2Context(canvas)
    this.vertexSource = initialSources.vertexSource ?? defaultVertexShaderSource
    this.fragmentSource = initialSources.fragmentSource ?? defaultFragmentShaderSource
    this.postProcessPasses =
      initialSources.postProcessPasses && initialSources.postProcessPasses.length > 0
        ? initialSources.postProcessPasses
        : [
            {
              id: 'post-pass-1',
              name: 'Pass 1',
              enabled: true,
              source:
                initialSources.postProcessSource ?? defaultPostProcessFragmentShaderSource,
            },
          ]

    const { program, diagnostics } = createShaderProgram(
      this.gl,
      this.vertexSource,
      this.fragmentSource,
    )

    this.diagnostics = diagnostics

    if (!program) {
      throw new Error(diagnostics.program.log)
    }

    this.program = program
    this.compileSucceeded = true
    this.uniformLocations = this.getRendererUniformLocations()
    this.helperProgram = this.createHelperProgram()
    this.helperUniformLocations = {
      view: this.gl.getUniformLocation(this.helperProgram, 'uView'),
      projection: this.gl.getUniformLocation(this.helperProgram, 'uProj'),
    }
    this.copyPostProcessProgram = this.createPostProcessProgram(
      defaultPostProcessFragmentShaderSource,
    )
    this.copyPostProcessUniformLocations = this.getPostProcessUniformLocations(
      this.copyPostProcessProgram,
    )
    this.postPassRuntimes = this.createPostPassRuntimes(this.postProcessPasses)
    this.fallbackTexture = this.createFallbackTexture()
    this.postFallbackTexture = this.createFallbackTexture([0, 0, 0, 255])
    this.screenMesh = this.createMesh(createScreenQuadMesh())
    this.geometryMeshes = {
      plane: this.createMesh(getPrimitiveMeshData('plane')),
      cube: this.createMesh(getPrimitiveMeshData('cube')),
      sphere: this.createMesh(getPrimitiveMeshData('sphere')),
    }
    this.gridMesh = this.createHelperLineMesh(this.createWorldGridVertices())
    this.syncMaterialProperties()
    this.syncCompileSucceededState()

    this.gl.enable(this.gl.DEPTH_TEST)
    this.gl.enable(this.gl.CULL_FACE)
    this.gl.cullFace(this.gl.BACK)

    this.resizeObserver = new ResizeObserver(() => {
      this.resize()
    })
    this.resizeObserver.observe(this.canvas)
    this.resize()
  }

  start() {
    if (this.animationFrameId !== null || !this.isViewportActive) {
      return
    }

    this.lastFrameTime = performance.now()
    const frame = (now: number) => {
      const deltaSeconds = Math.min((now - this.lastFrameTime) * 0.001, 0.1)
      this.lastFrameTime = now
      this.elapsedSeconds += deltaSeconds
      this.render(this.elapsedSeconds)
      this.animationFrameId = window.requestAnimationFrame(frame)
    }

    this.animationFrameId = window.requestAnimationFrame(frame)
  }

  stop() {
    if (this.animationFrameId !== null) {
      window.cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
  }

  restartPlayback() {
    this.elapsedSeconds = 0
    this.lastFrameTime = performance.now()
    this.render(0)
  }

  getSnapshot(): RendererStateSnapshot {
    return {
      diagnostics: this.diagnostics,
      viewportWidth: this.viewportWidth,
      viewportHeight: this.viewportHeight,
      compileSucceeded: this.compileSucceeded,
      materialProperties: this.materialProperties,
      materialValues: this.materialValues,
      sceneMode: this.sceneMode,
      geometryId: this.geometryId,
      blendPresetState: this.blendPresetState,
      postProcessEnabled: this.postProcessEnabled,
      resolutionScale: this.resolutionScale,
    }
  }

  compileSources(
    vertexSource: string,
    fragmentSource: string,
    postProcessPasses: PostProcessPass[],
  ): RendererStateSnapshot {
    const sceneCompileResult = createShaderProgram(this.gl, vertexSource, fragmentSource)
    this.diagnostics = sceneCompileResult.diagnostics

    if (!sceneCompileResult.program) {
      this.compileSucceeded = false
      return this.getSnapshot()
    }

    this.gl.deleteProgram(this.program)
    this.program = sceneCompileResult.program
    this.vertexSource = vertexSource
    this.fragmentSource = fragmentSource
    this.uniformLocations = this.getRendererUniformLocations()
    const postCompileSucceeded = this.compilePostProcessPasses(postProcessPasses)
    this.syncMaterialProperties()
    this.compileSucceeded = this.postProcessEnabled ? postCompileSucceeded : true
    this.syncCompileSucceededState()

    return this.getSnapshot()
  }

  compilePostProcessPasses(postProcessPasses: PostProcessPass[]) {
    this.postProcessPasses = postProcessPasses

    const compileResults = postProcessPasses.map((pass) => {
      const result = createShaderProgram(
        this.gl,
        defaultPostProcessVertexShaderSource,
        pass.source,
        {
          fragment: 'post',
        },
      )

      return {
        pass,
        result,
      }
    })

    const firstFailedResult = compileResults.find((entry) => !entry.result.program)
    const representativeResult =
      firstFailedResult?.result ?? compileResults[compileResults.length - 1]?.result ?? null

    this.diagnostics = {
      ...this.diagnostics,
      shaders: representativeResult
        ? [
            ...this.diagnostics.shaders.filter((diagnostic) => diagnostic.stage !== 'post'),
            ...representativeResult.diagnostics.shaders.filter(
              (diagnostic) => diagnostic.stage === 'post',
            ),
          ]
        : this.diagnostics.shaders.filter((diagnostic) => diagnostic.stage !== 'post'),
      postProgram: representativeResult?.diagnostics.program,
      postPasses: compileResults.map((entry) => ({
        passId: entry.pass.id,
        passName: entry.pass.name,
        shaders: entry.result.diagnostics.shaders.filter((diagnostic) => diagnostic.stage === 'post'),
        program: entry.result.diagnostics.program,
      })),
    }

    if (firstFailedResult) {
      compileResults.forEach((entry) => {
        if (entry.result.program) {
          this.gl.deleteProgram(entry.result.program)
        }
      })
      return false
    }

    this.postPassRuntimes.forEach((runtime) => {
      this.gl.deleteProgram(runtime.program)
    })

    this.postPassRuntimes = compileResults.map((entry) => {
      const program = entry.result.program as WebGLProgram
      return {
        id: entry.pass.id,
        name: entry.pass.name,
        enabled: entry.pass.enabled,
        source: entry.pass.source,
        program,
        uniformLocations: this.getPostProcessUniformLocations(program),
      }
    })
    return true
  }

  updateMaterialValues(nextValues: Record<string, MaterialPropertyValue>) {
    this.materialValues = nextValues
    this.render(this.elapsedSeconds)
  }

  updateSceneMode(sceneMode: SceneMode) {
    this.sceneMode = sceneMode
  }

  updateGeometry(geometryId: GeometryPreviewId) {
    this.geometryId = geometryId
  }

  updateBlendPresetState(blendPresetState: BlendPresetState) {
    this.blendPresetState = blendPresetState
    this.render(this.elapsedSeconds)
  }

  updatePostProcessEnabled(postProcessEnabled: boolean) {
    if (this.postProcessEnabled === postProcessEnabled) {
      return
    }

    this.postProcessEnabled = postProcessEnabled

    this.ensureSceneRenderTarget()

    this.syncCompileSucceededState()
    this.render(this.elapsedSeconds)
  }

  updatePostProcessPasses(postProcessPasses: PostProcessPass[]) {
    this.postProcessPasses = postProcessPasses

    const runtimeMap = new Map(this.postPassRuntimes.map((runtime) => [runtime.id, runtime]))
    const canReuseRuntimes =
      postProcessPasses.length === this.postPassRuntimes.length &&
      postProcessPasses.every((pass) => {
        const runtime = runtimeMap.get(pass.id)
        return runtime !== undefined && runtime.source === pass.source
      })

    if (canReuseRuntimes) {
      this.postPassRuntimes = postProcessPasses.map((pass) => {
        const runtime = runtimeMap.get(pass.id) as PostPassRuntime
        return {
          ...runtime,
          name: pass.name,
          enabled: pass.enabled,
          source: pass.source,
        }
      })
      this.syncMaterialProperties()
      this.render(this.elapsedSeconds)
    }
  }

  updateResolutionScale(resolutionScale: ResolutionScale) {
    this.resolutionScale = resolutionScale
    this.resize()
    this.render(this.elapsedSeconds)
  }

  updateCameraState(cameraState: ViewportCameraState) {
    this.cameraState = cameraState
  }

  updateModelTransform(modelTransform: ModelTransformState) {
    this.modelTransform = modelTransform
    this.render(this.elapsedSeconds)
  }

  setViewportActive(isActive: boolean) {
    this.isViewportActive = isActive

    if (isActive) {
      this.start()
      return
    }

    this.stop()
  }

  updateModelAsset(modelAsset: ModelAsset | null) {
    if (this.uploadedModelMesh) {
      this.deleteMesh(this.uploadedModelMesh)
      this.uploadedModelMesh = null
    }
    this.uploadedModelBounds = null

    if (!modelAsset) {
      return
    }

    this.uploadedModelMesh = this.createMesh({
      vertices: modelAsset.vertices,
      indices: modelAsset.indices,
    })
    this.uploadedModelBounds = modelAsset.bounds
    this.render(this.elapsedSeconds)
  }

  syncTextureAssets(assets: TextureAsset[]) {
    const nextAssetIds = new Set(assets.map((asset) => asset.id))

    this.textureAssets.forEach((texture, assetId) => {
      if (!nextAssetIds.has(assetId)) {
        this.gl.deleteTexture(texture)
        this.textureAssets.delete(assetId)
      }
    })

    assets.forEach((asset) => {
      const existingTexture = this.textureAssets.get(asset.id)
      if (existingTexture) {
        this.gl.bindTexture(this.gl.TEXTURE_2D, existingTexture)
        this.applyTextureWrapMode(asset.wrapS, asset.wrapT)
        this.gl.bindTexture(this.gl.TEXTURE_2D, null)
        return
      }

      const texture = this.gl.createTexture()
      if (!texture) {
        return
      }

      this.gl.bindTexture(this.gl.TEXTURE_2D, texture)
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR_MIPMAP_LINEAR)
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR)
      this.applyTextureWrapMode(asset.wrapS, asset.wrapT)
      this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, 1)
      this.gl.texImage2D(
        this.gl.TEXTURE_2D,
        0,
        this.gl.RGBA,
        this.gl.RGBA,
        this.gl.UNSIGNED_BYTE,
        asset.bitmap,
      )
      this.gl.generateMipmap(this.gl.TEXTURE_2D)
      this.gl.bindTexture(this.gl.TEXTURE_2D, null)
      this.textureAssets.set(asset.id, texture)
    })

    this.render(this.elapsedSeconds)
  }

  dispose() {
    this.stop()
    this.resizeObserver.disconnect()
    this.textureAssets.forEach((texture) => {
      this.gl.deleteTexture(texture)
    })
    if (this.fallbackTexture) {
      this.gl.deleteTexture(this.fallbackTexture)
    }
    if (this.postFallbackTexture) {
      this.gl.deleteTexture(this.postFallbackTexture)
    }
    this.deleteSceneRenderTarget()
    this.deletePostRenderTargets()
    this.deleteMesh(this.screenMesh)
    Object.values(this.geometryMeshes).forEach((mesh) => {
      this.deleteMesh(mesh)
    })
    this.deleteHelperLineMesh(this.gridMesh)
    if (this.uploadedModelMesh) {
      this.deleteMesh(this.uploadedModelMesh)
    }
    this.gl.deleteProgram(this.copyPostProcessProgram)
    this.postPassRuntimes.forEach((runtime) => {
      this.gl.deleteProgram(runtime.program)
    })
    this.gl.deleteProgram(this.helperProgram)
    this.gl.deleteProgram(this.program)
  }

  private render(elapsedSeconds: number) {
    this.ensureSceneRenderTarget()

    const aspect = this.viewportWidth / Math.max(this.viewportHeight, 1)
    const frameState = this.uploadedModelBounds ? frameModelBounds(this.uploadedModelBounds) : null
    const cameraTarget = frameState?.center ?? [0, 0, 0]
    const effectiveCameraDistance = Math.max(this.cameraState.distance, frameState?.distance ?? 2.2)
    const clippingRadius = frameState?.radius ?? 1
    const cameraPosition = this.getCameraPosition(cameraTarget)
    const viewMatrix = createLookAtMatrix4(cameraPosition, cameraTarget, [0, 1, 0])
    const projectionMatrix = createPerspectiveMatrix4(
      Math.PI / 3,
      Math.max(aspect, 0.0001),
      Math.max(effectiveCameraDistance - clippingRadius * 4, 0.05),
      Math.max(effectiveCameraDistance + clippingRadius * 6, 100),
    )
    const modelMatrix =
      this.sceneMode === 'model' && this.uploadedModelMesh
        ? this.createModelTransformMatrix()
        : createIdentityMatrix4()

    this.beginScenePass()
    this.gl.useProgram(this.program)

    if (this.uniformLocations.time) {
      this.gl.uniform1f(this.uniformLocations.time, elapsedSeconds)
    }

    if (this.uniformLocations.resolution) {
      this.gl.uniform2f(this.uniformLocations.resolution, this.viewportWidth, this.viewportHeight)
    }

    if (this.uniformLocations.sceneMode) {
      this.gl.uniform1i(this.uniformLocations.sceneMode, this.sceneMode === 'screen' ? 0 : 1)
    }

    if (this.uniformLocations.model) {
      this.gl.uniformMatrix4fv(this.uniformLocations.model, false, modelMatrix)
    }

    if (this.uniformLocations.view) {
      this.gl.uniformMatrix4fv(this.uniformLocations.view, false, viewMatrix)
    }

    if (this.uniformLocations.projection) {
      this.gl.uniformMatrix4fv(this.uniformLocations.projection, false, projectionMatrix)
    }

    if (this.uniformLocations.cameraPosition) {
      this.gl.uniform3f(
        this.uniformLocations.cameraPosition,
        cameraPosition[0],
        cameraPosition[1],
        cameraPosition[2],
      )
    }

    if (this.sceneMode !== 'screen') {
      this.gl.enable(this.gl.CULL_FACE)
      this.gl.cullFace(this.gl.BACK)
    }

    if (this.sceneMode === 'model') {
      this.drawWorldGrid(viewMatrix, projectionMatrix)
      this.applySceneGeometryState()
    }

    // Helper pass가 다른 program과 상태를 사용하므로 메인 draw 직전에 sampler를 다시 맞춘다.
    this.gl.useProgram(this.program)
    this.applyMaterialUniforms()

    if (this.sceneMode === 'model' && this.uploadedModelMesh) {
      this.gl.useProgram(this.program)
      this.drawMesh(this.uploadedModelMesh)
      this.gl.bindVertexArray(null)
      this.finishFrame(elapsedSeconds)
      return
    }

    const mesh = this.sceneMode === 'screen' ? this.screenMesh : this.geometryMeshes[this.geometryId]
    this.drawMesh(mesh)
    this.gl.bindVertexArray(null)
    this.finishFrame(elapsedSeconds)
  }

  private finishFrame(elapsedSeconds: number) {
    this.drawPostProcessChain(elapsedSeconds)
  }

  private resize() {
    const dpr = window.devicePixelRatio || 1
    const scaledDpr = Math.max(0.25, dpr * this.resolutionScale)
    const nextWidth = Math.max(1, Math.floor(this.canvas.clientWidth * scaledDpr))
    const nextHeight = Math.max(1, Math.floor(this.canvas.clientHeight * scaledDpr))

    if (this.canvas.width !== nextWidth || this.canvas.height !== nextHeight) {
      this.canvas.width = nextWidth
      this.canvas.height = nextHeight
    }

    this.viewportWidth = nextWidth
    this.viewportHeight = nextHeight
    this.gl.viewport(0, 0, nextWidth, nextHeight)
    this.recreateSceneRenderTarget(nextWidth, nextHeight)
  }

  private applyBlendMode() {
    if (
      this.blendPresetState.src === 'opaque' &&
      this.blendPresetState.dst === 'opaque'
    ) {
      this.gl.disable(this.gl.BLEND)
      this.gl.depthMask(true)
      return
    }

    this.gl.enable(this.gl.BLEND)
    this.gl.blendEquation(this.gl.FUNC_ADD)
    this.gl.blendFunc(
      this.resolveSrcBlendFactor(this.blendPresetState.src),
      this.resolveDstBlendFactor(this.blendPresetState.dst),
    )
    this.gl.depthMask(false)
  }

  private beginScenePass() {
    this.bindSceneRenderTarget()
    this.gl.clearColor(0.02, 0.04, 0.08, 1)
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT)
    this.applySceneGeometryState()
  }

  private applySceneGeometryState() {
    this.applyBlendMode()

    if (this.sceneMode === 'screen') {
      this.gl.disable(this.gl.DEPTH_TEST)
      this.gl.disable(this.gl.CULL_FACE)
      return
    }

    this.gl.enable(this.gl.DEPTH_TEST)
    this.gl.enable(this.gl.CULL_FACE)
    this.gl.cullFace(this.gl.BACK)
  }

  private resolveSrcBlendFactor(blendPreset: BlendPreset) {
    if (blendPreset === 'alpha') {
      return this.gl.SRC_ALPHA
    }

    return this.gl.ONE
  }

  private resolveDstBlendFactor(blendPreset: BlendPreset) {
    if (blendPreset === 'opaque') {
      return this.gl.ZERO
    }

    if (blendPreset === 'alpha') {
      return this.gl.ONE_MINUS_SRC_ALPHA
    }

    return this.gl.ONE
  }

  private syncMaterialProperties() {
    const reflectedSceneProperties = reflectActiveUniforms(this.gl, this.program, {
      vertexSource: this.vertexSource,
      fragmentSource: this.fragmentSource,
      scope: 'scene',
    }).filter((property) => !property.builtin)
    const reflectedPostProperties = this.postPassRuntimes.flatMap((runtime) =>
      reflectActiveUniforms(this.gl, runtime.program, {
        vertexSource: defaultPostProcessVertexShaderSource,
        fragmentSource: runtime.source,
        builtinUniformNames: postProcessBuiltinUniformNames,
        scope: 'post',
        idPrefix: `post:${runtime.id}:`,
        postPassId: runtime.id,
        postPassName: runtime.name,
      })
        .map((property) => ({
          ...property,
          id: `post:${runtime.id}:${property.name}`,
        }))
        .filter((property) => !property.builtin && !/^uPass\d+Color$/i.test(property.name)),
    )
    const reflectedProperties = [
      ...reflectedSceneProperties,
      ...reflectedPostProperties,
    ]
    const nextUniformLocations = new Map<string, WebGLUniformLocation>()
    const nextValues: Record<string, MaterialPropertyValue> = {}

    reflectedProperties.forEach((property) => {
      const targetProgram =
        property.scope === 'post'
          ? this.postPassRuntimes.find((runtime) => runtime.id === property.postPassId)?.program ??
            this.copyPostProcessProgram
          : this.program
      const location = this.gl.getUniformLocation(targetProgram, property.name)
      if (location !== null) {
        nextUniformLocations.set(property.id, location)
      }

      const currentValue = this.materialValues[property.id]
      nextValues[property.id] = isMaterialValueCompatible(property, currentValue)
        ? currentValue
        : createDefaultMaterialValue(property)
    })

    this.materialProperties = reflectedProperties
    this.materialUniformLocations = nextUniformLocations
    this.materialValues = nextValues
  }

  private applyMaterialUniforms() {
    this.applyMaterialUniformsForScope('scene', 0)
  }

  private applyPostProcessMaterialUniforms(postPassId: string) {
    this.applyMaterialUniformsForScope('post', 1, postPassId)
  }

  private applyMaterialUniformsForScope(
    scope: 'scene' | 'post',
    textureUnitStart: number,
    postPassId?: string,
  ) {
    let textureUnit = textureUnitStart

    this.materialProperties.forEach((property) => {
      if (property.scope !== scope) {
        return
      }

      if (scope === 'post' && property.postPassId !== postPassId) {
        return
      }

      const location = this.materialUniformLocations.get(property.id)
      const value = this.materialValues[property.id]

      if (location === undefined || value === undefined) {
        return
      }

      if (property.componentCount === 1) {
        if (property.uiKind === 'texture') {
          const assetId = typeof value === 'string' ? value : null
          const texture = (assetId ? this.textureAssets.get(assetId) : null) ?? this.fallbackTexture

          if (!texture) {
            return
          }

          this.gl.activeTexture(this.gl.TEXTURE0 + textureUnit)
          this.gl.bindTexture(this.gl.TEXTURE_2D, texture)
          this.gl.uniform1i(location, textureUnit)
          textureUnit += 1
          return
        }

        if (property.uiKind === 'checkbox') {
          this.gl.uniform1i(location, value ? 1 : 0)
          return
        }

        if (property.valueType === 'float') {
          this.gl.uniform1f(location, Number(value))
          return
        }

        this.gl.uniform1i(location, Number(value))
        return
      }

      if (!Array.isArray(value)) {
        return
      }

      if (property.valueType.startsWith('bvec')) {
        const booleanValues = value.map((entry) => (entry ? 1 : 0))

        if (property.componentCount === 2) {
          this.gl.uniform2iv(location, booleanValues)
        } else if (property.componentCount === 3) {
          this.gl.uniform3iv(location, booleanValues)
        } else {
          this.gl.uniform4iv(location, booleanValues)
        }

        return
      }

      if (property.valueType.startsWith('vec')) {
        if (property.componentCount === 2) {
          this.gl.uniform2f(location, Number(value[0]), Number(value[1]))
        } else if (property.componentCount === 3) {
          this.gl.uniform3f(location, Number(value[0]), Number(value[1]), Number(value[2]))
        } else {
          this.gl.uniform4f(location, Number(value[0]), Number(value[1]), Number(value[2]), Number(value[3]))
        }

        return
      }

      if (property.componentCount === 2) {
        this.gl.uniform2iv(location, value.map((entry) => Number(entry)))
      } else if (property.componentCount === 3) {
        this.gl.uniform3iv(location, value.map((entry) => Number(entry)))
      } else {
        this.gl.uniform4iv(location, value.map((entry) => Number(entry)))
      }
    })
  }

  private getRendererUniformLocations(): RendererUniformLocations {
    return {
      time: this.findBuiltinUniformLocation('time'),
      resolution: this.findBuiltinUniformLocation('resolution'),
      sceneMode: this.findBuiltinUniformLocation('sceneMode'),
      model: this.findBuiltinUniformLocation('model'),
      view: this.findBuiltinUniformLocation('view'),
      projection: this.findBuiltinUniformLocation('projection'),
      cameraPosition: this.findBuiltinUniformLocation('cameraPosition'),
    }
  }

  private findBuiltinUniformLocation(key: BuiltinUniformKey) {
    const expectedNames = builtinUniformAliases[key].map((name) => name.toLowerCase())
    const activeUniformCount = this.gl.getProgramParameter(this.program, this.gl.ACTIVE_UNIFORMS) as number

    for (let index = 0; index < activeUniformCount; index += 1) {
      const uniform = this.gl.getActiveUniform(this.program, index)
      if (!uniform) {
        continue
      }

      const normalizedName = uniform.name.replace(/\[0\]$/, '')
      if (!expectedNames.includes(normalizedName.toLowerCase())) {
        continue
      }

      return this.gl.getUniformLocation(this.program, normalizedName)
    }

    return null
  }

  private createMesh(meshData: { vertices: Float32Array; indices: Uint16Array | Uint32Array }): UploadedMesh {
    const vao = this.gl.createVertexArray()
    const vertexBuffer = this.gl.createBuffer()
    const indexBuffer = this.gl.createBuffer()

    if (!vao || !vertexBuffer || !indexBuffer) {
      throw new Error('geometry preview 버퍼를 초기화하지 못했습니다.')
    }

    this.gl.bindVertexArray(vao)
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vertexBuffer)
    this.gl.bufferData(this.gl.ARRAY_BUFFER, meshData.vertices, this.gl.STATIC_DRAW)

    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
    this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, meshData.indices, this.gl.STATIC_DRAW)

    this.gl.enableVertexAttribArray(0)
    this.gl.vertexAttribPointer(0, 3, this.gl.FLOAT, false, PRIMITIVE_VERTEX_STRIDE, 0)
    this.gl.enableVertexAttribArray(1)
    this.gl.vertexAttribPointer(
      1,
      3,
      this.gl.FLOAT,
      false,
      PRIMITIVE_VERTEX_STRIDE,
      3 * Float32Array.BYTES_PER_ELEMENT,
    )
    this.gl.enableVertexAttribArray(2)
    this.gl.vertexAttribPointer(
      2,
      2,
      this.gl.FLOAT,
      false,
      PRIMITIVE_VERTEX_STRIDE,
      6 * Float32Array.BYTES_PER_ELEMENT,
    )

    this.gl.bindVertexArray(null)
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null)

    return {
      vao,
      vertexBuffer,
      indexBuffer,
      indexCount: meshData.indices.length,
      indexType: meshData.indices instanceof Uint32Array ? this.gl.UNSIGNED_INT : this.gl.UNSIGNED_SHORT,
    }
  }

  private deleteMesh(mesh: UploadedMesh) {
    this.gl.deleteBuffer(mesh.vertexBuffer)
    this.gl.deleteBuffer(mesh.indexBuffer)
    this.gl.deleteVertexArray(mesh.vao)
  }

  private drawMesh(mesh: UploadedMesh) {
    this.gl.bindVertexArray(mesh.vao)
    this.gl.drawElements(this.gl.TRIANGLES, mesh.indexCount, mesh.indexType, 0)
  }

  private getPostProcessUniformLocations(program: WebGLProgram): PostProcessUniformLocations {
    const passColors = this.postProcessPasses.map((_, index) =>
      this.gl.getUniformLocation(program, `uPass${index + 1}Color`),
    )

    return {
      sceneColor: this.gl.getUniformLocation(program, 'uSceneColor'),
      prevPassColor: this.gl.getUniformLocation(program, 'uPrevPassColor'),
      passColors,
      resolution: this.gl.getUniformLocation(program, 'uResolution'),
      time: this.gl.getUniformLocation(program, 'uTime'),
    }
  }

  private createPostProcessProgram(fragmentSource: string) {
    const { program, diagnostics } = createShaderProgram(
      this.gl,
      defaultPostProcessVertexShaderSource,
      fragmentSource,
    )

    if (!program) {
      throw new Error(diagnostics.program.log || 'post process program 생성에 실패했습니다.')
    }

    return program
  }

  private createPostPassRuntimes(postProcessPasses: PostProcessPass[]) {
    return postProcessPasses.map((pass) => {
      const program = this.createPostProcessProgram(pass.source)

      return {
        id: pass.id,
        name: pass.name,
        enabled: pass.enabled,
        source: pass.source,
        program,
        uniformLocations: this.getPostProcessUniformLocations(program),
      }
    })
  }

  private createHelperProgram() {
    const vertexShader = this.gl.createShader(this.gl.VERTEX_SHADER)
    const fragmentShader = this.gl.createShader(this.gl.FRAGMENT_SHADER)

    if (!vertexShader || !fragmentShader) {
      throw new Error('helper shader를 초기화하지 못했습니다.')
    }

    this.gl.shaderSource(vertexShader, GRID_VERTEX_SHADER_SOURCE)
    this.gl.compileShader(vertexShader)
    if (!this.gl.getShaderParameter(vertexShader, this.gl.COMPILE_STATUS)) {
      const log = this.gl.getShaderInfoLog(vertexShader) ?? 'helper vertex shader compile failed'
      this.gl.deleteShader(vertexShader)
      this.gl.deleteShader(fragmentShader)
      throw new Error(log)
    }

    this.gl.shaderSource(fragmentShader, GRID_FRAGMENT_SHADER_SOURCE)
    this.gl.compileShader(fragmentShader)
    if (!this.gl.getShaderParameter(fragmentShader, this.gl.COMPILE_STATUS)) {
      const log = this.gl.getShaderInfoLog(fragmentShader) ?? 'helper fragment shader compile failed'
      this.gl.deleteShader(vertexShader)
      this.gl.deleteShader(fragmentShader)
      throw new Error(log)
    }

    const program = this.gl.createProgram()
    if (!program) {
      this.gl.deleteShader(vertexShader)
      this.gl.deleteShader(fragmentShader)
      throw new Error('helper program을 생성하지 못했습니다.')
    }

    this.gl.attachShader(program, vertexShader)
    this.gl.attachShader(program, fragmentShader)
    this.gl.linkProgram(program)
    this.gl.deleteShader(vertexShader)
    this.gl.deleteShader(fragmentShader)

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      const log = this.gl.getProgramInfoLog(program) ?? 'helper program link failed'
      this.gl.deleteProgram(program)
      throw new Error(log)
    }

    return program
  }

  private createHelperLineMesh(vertices: Float32Array): HelperLineMesh {
    const vao = this.gl.createVertexArray()
    const vertexBuffer = this.gl.createBuffer()

    if (!vao || !vertexBuffer) {
      throw new Error('grid helper buffer를 초기화하지 못했습니다.')
    }

    const stride = 7 * Float32Array.BYTES_PER_ELEMENT

    this.gl.bindVertexArray(vao)
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vertexBuffer)
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW)

    this.gl.enableVertexAttribArray(0)
    this.gl.vertexAttribPointer(0, 3, this.gl.FLOAT, false, stride, 0)
    this.gl.enableVertexAttribArray(1)
    this.gl.vertexAttribPointer(
      1,
      4,
      this.gl.FLOAT,
      false,
      stride,
      3 * Float32Array.BYTES_PER_ELEMENT,
    )

    this.gl.bindVertexArray(null)
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null)

    return {
      vao,
      vertexBuffer,
      vertexCount: vertices.length / 7,
    }
  }

  private deleteHelperLineMesh(mesh: HelperLineMesh) {
    this.gl.deleteBuffer(mesh.vertexBuffer)
    this.gl.deleteVertexArray(mesh.vao)
  }

  private createWorldGridVertices() {
    const values: number[] = []
    const extent = 5
    const steps = 10

    const pushLine = (
      start: [number, number, number],
      end: [number, number, number],
      color: [number, number, number, number],
    ) => {
      values.push(
        start[0],
        start[1],
        start[2],
        color[0],
        color[1],
        color[2],
        color[3],
        end[0],
        end[1],
        end[2],
        color[0],
        color[1],
        color[2],
        color[3],
      )
    }

    for (let step = -steps; step <= steps; step += 1) {
      const offset = (step / steps) * extent
      const isMajor = step === 0
      const lineColor: [number, number, number, number] = isMajor
        ? [0.55, 0.72, 0.98, 0.85]
        : [0.42, 0.48, 0.58, 0.35]

      pushLine([-extent, 0, offset], [extent, 0, offset], lineColor)
      pushLine([offset, 0, -extent], [offset, 0, extent], lineColor)
    }

    pushLine([-extent, 0, 0], [extent, 0, 0], [0.96, 0.45, 0.45, 0.95])
    pushLine([0, 0, -extent], [0, 0, extent], [0.35, 0.65, 1.0, 0.95])

    return new Float32Array(values)
  }

  private drawWorldGrid(viewMatrix: Float32Array, projectionMatrix: Float32Array) {
    this.gl.useProgram(this.helperProgram)

    if (this.helperUniformLocations.view) {
      this.gl.uniformMatrix4fv(this.helperUniformLocations.view, false, viewMatrix)
    }

    if (this.helperUniformLocations.projection) {
      this.gl.uniformMatrix4fv(this.helperUniformLocations.projection, false, projectionMatrix)
    }

    this.gl.enable(this.gl.BLEND)
    this.gl.blendEquation(this.gl.FUNC_ADD)
    this.gl.blendFuncSeparate(
      this.gl.SRC_ALPHA,
      this.gl.ONE_MINUS_SRC_ALPHA,
      this.gl.ONE,
      this.gl.ONE_MINUS_SRC_ALPHA,
    )
    this.gl.depthMask(true)
    this.gl.disable(this.gl.CULL_FACE)
    this.gl.bindVertexArray(this.gridMesh.vao)
    this.gl.drawArrays(this.gl.LINES, 0, this.gridMesh.vertexCount)
    this.gl.bindVertexArray(null)
    this.gl.depthMask(true)
    this.gl.useProgram(this.program)
  }

  private createFallbackTexture(color: [number, number, number, number] = [255, 255, 255, 255]) {
    const texture = this.gl.createTexture()
    if (!texture) {
      return null
    }

    this.gl.bindTexture(this.gl.TEXTURE_2D, texture)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE)
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      1,
      1,
      0,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      new Uint8Array(color),
    )
    this.gl.bindTexture(this.gl.TEXTURE_2D, null)

    return texture
  }

  private ensureSceneRenderTarget() {
    if (
      this.sceneRenderTarget &&
      this.sceneRenderTarget.width === this.viewportWidth &&
      this.sceneRenderTarget.height === this.viewportHeight
    ) {
      return
    }

    this.recreateSceneRenderTarget(this.viewportWidth, this.viewportHeight)
  }

  private ensurePostRenderTargets() {
    if (
      this.postRenderTargets.length === this.postPassRuntimes.length &&
      this.postRenderTargets.every(
        (target) => target.width === this.viewportWidth && target.height === this.viewportHeight,
      )
    ) {
      return
    }

    this.recreatePostRenderTargets(this.viewportWidth, this.viewportHeight, this.postPassRuntimes.length)
  }

  private recreateSceneRenderTarget(width: number, height: number) {
    if (width <= 0 || height <= 0) {
      return
    }

    this.deleteSceneRenderTarget()

    const framebuffer = this.gl.createFramebuffer()
    const colorTexture = this.gl.createTexture()
    const depthRenderbuffer = this.gl.createRenderbuffer()

    if (!framebuffer || !colorTexture || !depthRenderbuffer) {
      if (framebuffer) {
        this.gl.deleteFramebuffer(framebuffer)
      }
      if (colorTexture) {
        this.gl.deleteTexture(colorTexture)
      }
      if (depthRenderbuffer) {
        this.gl.deleteRenderbuffer(depthRenderbuffer)
      }
      throw new Error('scene framebuffer? ???? ?????.')
    }

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, framebuffer)

    this.gl.bindTexture(this.gl.TEXTURE_2D, colorTexture)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE)
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      width,
      height,
      0,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      null,
    )
    this.gl.framebufferTexture2D(
      this.gl.FRAMEBUFFER,
      this.gl.COLOR_ATTACHMENT0,
      this.gl.TEXTURE_2D,
      colorTexture,
      0,
    )

    this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, depthRenderbuffer)
    this.gl.renderbufferStorage(
      this.gl.RENDERBUFFER,
      this.gl.DEPTH_COMPONENT16,
      width,
      height,
    )
    this.gl.framebufferRenderbuffer(
      this.gl.FRAMEBUFFER,
      this.gl.DEPTH_ATTACHMENT,
      this.gl.RENDERBUFFER,
      depthRenderbuffer,
    )

    const status = this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER)
    if (status !== this.gl.FRAMEBUFFER_COMPLETE) {
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null)
      this.gl.bindTexture(this.gl.TEXTURE_2D, null)
      this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, null)
      this.gl.deleteFramebuffer(framebuffer)
      this.gl.deleteTexture(colorTexture)
      this.gl.deleteRenderbuffer(depthRenderbuffer)
      throw new Error(`scene framebuffer? ???? ????. status=${status}`)
    }

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null)
    this.gl.bindTexture(this.gl.TEXTURE_2D, null)
    this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, null)

    this.sceneRenderTarget = {
      framebuffer,
      colorTexture,
      depthRenderbuffer,
      width,
      height,
    }
  }

  private recreatePostRenderTargets(width: number, height: number, count: number) {
    if (width <= 0 || height <= 0) {
      return
    }

    this.deletePostRenderTargets()
    this.postRenderTargets = Array.from({ length: count }, () => this.createPostRenderTarget(width, height))
  }

  private createPostRenderTarget(width: number, height: number): PostRenderTarget {
    const framebuffer = this.gl.createFramebuffer()
    const colorTexture = this.gl.createTexture()

    if (!framebuffer || !colorTexture) {
      if (framebuffer) {
        this.gl.deleteFramebuffer(framebuffer)
      }
      if (colorTexture) {
        this.gl.deleteTexture(colorTexture)
      }
      throw new Error('post framebuffer를 생성하지 못했습니다.')
    }

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, framebuffer)
    this.gl.bindTexture(this.gl.TEXTURE_2D, colorTexture)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE)
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      width,
      height,
      0,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      null,
    )
    this.gl.framebufferTexture2D(
      this.gl.FRAMEBUFFER,
      this.gl.COLOR_ATTACHMENT0,
      this.gl.TEXTURE_2D,
      colorTexture,
      0,
    )

    const status = this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER)
    if (status !== this.gl.FRAMEBUFFER_COMPLETE) {
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null)
      this.gl.bindTexture(this.gl.TEXTURE_2D, null)
      this.gl.deleteFramebuffer(framebuffer)
      this.gl.deleteTexture(colorTexture)
      throw new Error(`post framebuffer가 완전하지 않습니다. status=${status}`)
    }

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null)
    this.gl.bindTexture(this.gl.TEXTURE_2D, null)

    return {
      framebuffer,
      colorTexture,
      width,
      height,
    }
  }

  private deleteSceneRenderTarget() {
    if (!this.sceneRenderTarget) {
      return
    }

    this.gl.deleteFramebuffer(this.sceneRenderTarget.framebuffer)
    this.gl.deleteTexture(this.sceneRenderTarget.colorTexture)
    this.gl.deleteRenderbuffer(this.sceneRenderTarget.depthRenderbuffer)
    this.sceneRenderTarget = null
  }

  private deletePostRenderTargets() {
    this.postRenderTargets.forEach((target) => {
      this.gl.deleteFramebuffer(target.framebuffer)
      this.gl.deleteTexture(target.colorTexture)
    })
    this.postRenderTargets = []
  }

  private bindSceneRenderTarget() {
    if (!this.sceneRenderTarget) {
      return
    }

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.sceneRenderTarget.framebuffer)
    this.gl.viewport(0, 0, this.sceneRenderTarget.width, this.sceneRenderTarget.height)
  }

  private drawPostProcessChain(elapsedSeconds: number) {
    if (!this.sceneRenderTarget) {
      return
    }

    const sceneColorTexture = this.sceneRenderTarget.colorTexture

    const enabledPassIndexes =
      this.postProcessEnabled
        ? this.postPassRuntimes.flatMap((runtime, index) => (runtime.enabled ? [index] : []))
        : []

    if (enabledPassIndexes.length === 0) {
      this.drawCopyToScreen(this.sceneRenderTarget.colorTexture, elapsedSeconds)
      return
    }

    this.ensurePostRenderTargets()

    let previousTexture = this.sceneRenderTarget.colorTexture
    const completedPassTextures: Array<WebGLTexture | null> = Array.from(
      { length: this.postPassRuntimes.length },
      () => null,
    )

    enabledPassIndexes.forEach((runtimeIndex, enabledIndex) => {
      const runtime = this.postPassRuntimes[runtimeIndex]
      const isLastEnabledPass = enabledIndex === enabledPassIndexes.length - 1
      const target = !isLastEnabledPass ? this.postRenderTargets[runtimeIndex] : null
      if (!isLastEnabledPass && !target) {
        return
      }

      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, target?.framebuffer ?? null)
      this.gl.viewport(0, 0, this.viewportWidth, this.viewportHeight)
      this.gl.disable(this.gl.DEPTH_TEST)
      this.gl.disable(this.gl.CULL_FACE)
      this.gl.disable(this.gl.BLEND)
      this.gl.depthMask(false)
      this.gl.clearColor(0.02, 0.04, 0.08, 1)
      this.gl.clear(this.gl.COLOR_BUFFER_BIT)

      this.gl.useProgram(runtime.program)

      if (runtime.uniformLocations.sceneColor) {
        this.gl.activeTexture(this.gl.TEXTURE0)
        this.gl.bindTexture(this.gl.TEXTURE_2D, sceneColorTexture)
        this.gl.uniform1i(runtime.uniformLocations.sceneColor, 0)
      }

      if (runtime.uniformLocations.prevPassColor) {
        this.gl.activeTexture(this.gl.TEXTURE1)
        this.gl.bindTexture(this.gl.TEXTURE_2D, previousTexture)
        this.gl.uniform1i(runtime.uniformLocations.prevPassColor, 1)
      }

      runtime.uniformLocations.passColors.forEach((location, passIndex) => {
        if (!location) {
          return
        }

        const referencedTexture = passIndex < runtimeIndex ? completedPassTextures[passIndex] : null

        this.gl.activeTexture(this.gl.TEXTURE0 + passIndex + 2)
        this.gl.bindTexture(
          this.gl.TEXTURE_2D,
          referencedTexture ?? this.postFallbackTexture ?? null,
        )
        this.gl.uniform1i(location, passIndex + 2)
      })

      if (runtime.uniformLocations.resolution) {
        this.gl.uniform2f(runtime.uniformLocations.resolution, this.viewportWidth, this.viewportHeight)
      }

      if (runtime.uniformLocations.time) {
        this.gl.uniform1f(runtime.uniformLocations.time, elapsedSeconds)
      }

      this.applyPostProcessMaterialUniforms(runtime.id)
      this.drawMesh(this.screenMesh)
      this.gl.bindVertexArray(null)

      if (target) {
        previousTexture = target.colorTexture
        completedPassTextures[runtimeIndex] = target.colorTexture
      }
    })

    this.gl.bindTexture(this.gl.TEXTURE_2D, null)
    this.gl.depthMask(true)
  }

  private drawCopyToScreen(sourceTexture: WebGLTexture, elapsedSeconds: number) {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null)
    this.gl.viewport(0, 0, this.viewportWidth, this.viewportHeight)
    this.gl.disable(this.gl.DEPTH_TEST)
    this.gl.disable(this.gl.CULL_FACE)
    this.gl.disable(this.gl.BLEND)
    this.gl.depthMask(true)
    this.gl.clearColor(0.02, 0.04, 0.08, 1)
    this.gl.clear(this.gl.COLOR_BUFFER_BIT)

    this.gl.useProgram(this.copyPostProcessProgram)

    if (this.copyPostProcessUniformLocations.sceneColor) {
      this.gl.activeTexture(this.gl.TEXTURE0)
      this.gl.bindTexture(this.gl.TEXTURE_2D, sourceTexture)
      this.gl.uniform1i(this.copyPostProcessUniformLocations.sceneColor, 0)
    }

    if (this.copyPostProcessUniformLocations.prevPassColor) {
      this.gl.activeTexture(this.gl.TEXTURE1)
      this.gl.bindTexture(this.gl.TEXTURE_2D, sourceTexture)
      this.gl.uniform1i(this.copyPostProcessUniformLocations.prevPassColor, 1)
    }

    if (this.copyPostProcessUniformLocations.resolution) {
      this.gl.uniform2f(
        this.copyPostProcessUniformLocations.resolution,
        this.viewportWidth,
        this.viewportHeight,
      )
    }

    if (this.copyPostProcessUniformLocations.time) {
      this.gl.uniform1f(this.copyPostProcessUniformLocations.time, elapsedSeconds)
    }

    this.drawMesh(this.screenMesh)
    this.gl.bindVertexArray(null)
  }

  private applyTextureWrapMode(wrapS: TextureWrapMode, wrapT: TextureWrapMode) {
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_WRAP_S,
      this.resolveTextureWrapMode(wrapS),
    )
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_WRAP_T,
      this.resolveTextureWrapMode(wrapT),
    )
  }

  private resolveTextureWrapMode(wrapMode: TextureWrapMode) {
    if (wrapMode === 'clamp') {
      return this.gl.CLAMP_TO_EDGE
    }

    if (wrapMode === 'mirror') {
      return this.gl.MIRRORED_REPEAT
    }

    return this.gl.REPEAT
  }

  private getCameraPosition(target: [number, number, number]): [number, number, number] {
    const distance = Math.max(this.cameraState.distance, 1.6)
    const pitch = this.cameraState.pitch
    const yaw = this.cameraState.yaw
    const radius = distance * Math.cos(pitch)

    return [
      target[0] + Math.sin(yaw) * radius,
      target[1] + Math.sin(pitch) * distance,
      target[2] + Math.cos(yaw) * radius,
    ]
  }

  private createModelTransformMatrix() {
    const translationMatrix = createTranslationMatrix4(
      this.modelTransform.position.x,
      this.modelTransform.position.y,
      this.modelTransform.position.z,
    )
    const rotationMatrix = createEulerRotationMatrix4(this.modelTransform.rotation)

    return multiplyMatrix4(translationMatrix, rotationMatrix)
  }

  private syncCompileSucceededState() {
    const sceneSucceeded = this.diagnostics.program.success
    const postSucceeded =
      this.diagnostics.postPasses?.every((postPass) => postPass.program.success) ??
      this.diagnostics.postProgram?.success ??
      true
    this.compileSucceeded = sceneSucceeded && (!this.postProcessEnabled || postSucceeded)
  }
}
