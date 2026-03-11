import type { MaterialPropertyDefinition, MaterialPropertyValue } from '../../shared/types/materialProperty'
import type { ModelAsset, ModelBounds } from '../../shared/types/modelAsset'
import type { RenderDiagnostics } from '../../shared/types/renderDiagnostics'
import {
  defaultBlendPresetState,
  defaultModelTransformState,
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
import { defaultFragmentShaderSource, defaultVertexShaderSource } from '../shader/templates/defaultShaders'
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
  private materialProperties: MaterialPropertyDefinition[] = []
  private materialValues: Record<string, MaterialPropertyValue> = {}
  private materialUniformLocations = new Map<string, WebGLUniformLocation>()
  private textureAssets = new Map<string, WebGLTexture>()
  private fallbackTexture: WebGLTexture | null = null
  private uniformLocations: RendererUniformLocations
  private readonly helperProgram: WebGLProgram
  private readonly helperUniformLocations: HelperProgramUniformLocations
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
    } = {},
  ) {
    this.canvas = canvas
    this.gl = createWebGL2Context(canvas)
    this.vertexSource = initialSources.vertexSource ?? defaultVertexShaderSource
    this.fragmentSource = initialSources.fragmentSource ?? defaultFragmentShaderSource

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
    this.fallbackTexture = this.createFallbackTexture()
    this.screenMesh = this.createMesh(createScreenQuadMesh())
    this.geometryMeshes = {
      plane: this.createMesh(getPrimitiveMeshData('plane')),
      cube: this.createMesh(getPrimitiveMeshData('cube')),
      sphere: this.createMesh(getPrimitiveMeshData('sphere')),
    }
    this.gridMesh = this.createHelperLineMesh(this.createWorldGridVertices())
    this.syncMaterialProperties()

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
      resolutionScale: this.resolutionScale,
    }
  }

  compileSources(vertexSource: string, fragmentSource: string): RendererStateSnapshot {
    const { program, diagnostics } = createShaderProgram(this.gl, vertexSource, fragmentSource)
    this.diagnostics = diagnostics

    if (!program) {
      this.compileSucceeded = false
      return this.getSnapshot()
    }

    this.gl.deleteProgram(this.program)
    this.program = program
    this.vertexSource = vertexSource
    this.fragmentSource = fragmentSource
    this.uniformLocations = this.getRendererUniformLocations()
    this.syncMaterialProperties()
    this.compileSucceeded = true

    return this.getSnapshot()
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
    this.deleteMesh(this.screenMesh)
    Object.values(this.geometryMeshes).forEach((mesh) => {
      this.deleteMesh(mesh)
    })
    this.deleteHelperLineMesh(this.gridMesh)
    if (this.uploadedModelMesh) {
      this.deleteMesh(this.uploadedModelMesh)
    }
    this.gl.deleteProgram(this.helperProgram)
    this.gl.deleteProgram(this.program)
  }

  private render(elapsedSeconds: number) {
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

    this.gl.clearColor(0.02, 0.04, 0.08, 1)
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT)
    this.gl.useProgram(this.program)
    this.applyBlendMode()

    if (this.sceneMode === 'screen') {
      this.gl.disable(this.gl.DEPTH_TEST)
      this.gl.disable(this.gl.CULL_FACE)
    } else {
      this.gl.enable(this.gl.DEPTH_TEST)
      this.gl.enable(this.gl.CULL_FACE)
      this.gl.cullFace(this.gl.BACK)
    }

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
      this.applyBlendMode()
      this.gl.enable(this.gl.DEPTH_TEST)
      this.gl.enable(this.gl.CULL_FACE)
      this.gl.cullFace(this.gl.BACK)
    }

    // Helper pass가 다른 program과 상태를 사용하므로 메인 draw 직전에 sampler를 다시 맞춘다.
    this.gl.useProgram(this.program)
    this.applyMaterialUniforms()

    if (this.sceneMode === 'model' && this.uploadedModelMesh) {
      this.gl.useProgram(this.program)
      this.drawMesh(this.uploadedModelMesh)
      this.gl.bindVertexArray(null)
      return
    }

    const mesh = this.sceneMode === 'screen' ? this.screenMesh : this.geometryMeshes[this.geometryId]
    this.drawMesh(mesh)
    this.gl.bindVertexArray(null)
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
    const reflectedProperties = reflectActiveUniforms(this.gl, this.program, {
      vertexSource: this.vertexSource,
      fragmentSource: this.fragmentSource,
    }).filter((property) => !property.builtin)
    const nextUniformLocations = new Map<string, WebGLUniformLocation>()
    const nextValues: Record<string, MaterialPropertyValue> = {}

    reflectedProperties.forEach((property) => {
      const location = this.gl.getUniformLocation(this.program, property.name)
      if (location !== null) {
        nextUniformLocations.set(property.name, location)
      }

      const currentValue = this.materialValues[property.name]
      nextValues[property.name] = isMaterialValueCompatible(property, currentValue)
        ? currentValue
        : createDefaultMaterialValue(property)
    })

    this.materialProperties = reflectedProperties
    this.materialUniformLocations = nextUniformLocations
    this.materialValues = nextValues
  }

  private applyMaterialUniforms() {
    let textureUnit = 0

    this.materialProperties.forEach((property) => {
      const location = this.materialUniformLocations.get(property.name)
      const value = this.materialValues[property.name]

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

  private createFallbackTexture() {
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
      new Uint8Array([255, 255, 255, 255]),
    )
    this.gl.bindTexture(this.gl.TEXTURE_2D, null)

    return texture
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
}
