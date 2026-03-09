import type { RenderDiagnostics } from '../../shared/types/renderDiagnostics'
import type {
  MaterialPropertyDefinition,
  MaterialPropertyValue,
} from '../../shared/types/materialProperty'
import type { GeometryPreviewId, SceneMode, ViewportCameraState } from '../../shared/types/scenePreview'
import type { TextureAsset } from '../../shared/types/textureAsset'
import { createShaderProgram } from '../shader/compiler/shaderCompiler'
import {
  createDefaultMaterialValue,
  isMaterialValueCompatible,
  reflectActiveUniforms,
} from '../shader/reflection/reflectActiveUniforms'
import {
  defaultFragmentShaderSource,
  defaultVertexShaderSource,
} from '../shader/templates/defaultShaders'
import { createScreenQuadMesh, getPrimitiveMeshData, PRIMITIVE_VERTEX_STRIDE } from './geometry/primitiveMeshes'
import { createWebGL2Context } from './gl/webglContext'
import {
  createIdentityMatrix4,
  createLookAtMatrix4,
  createPerspectiveMatrix4,
  createYRotationMatrix4,
} from './math/matrix4'

interface UploadedMesh {
  vao: WebGLVertexArrayObject
  vertexBuffer: WebGLBuffer
  indexBuffer: WebGLBuffer
  indexCount: number
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

export interface RendererStateSnapshot {
  diagnostics: RenderDiagnostics
  viewportWidth: number
  viewportHeight: number
  compileSucceeded: boolean
  materialProperties: MaterialPropertyDefinition[]
  materialValues: Record<string, MaterialPropertyValue>
  sceneMode: SceneMode
  geometryId: GeometryPreviewId
}

export class WebGLQuadRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly gl: WebGL2RenderingContext
  private program: WebGLProgram
  private readonly resizeObserver: ResizeObserver
  private animationFrameId: number | null = null
  private startTime = 0
  private viewportWidth = 0
  private viewportHeight = 0
  private diagnostics: RenderDiagnostics
  private compileSucceeded = false
  private materialProperties: MaterialPropertyDefinition[] = []
  private materialValues: Record<string, MaterialPropertyValue> = {}
  private materialUniformLocations = new Map<string, WebGLUniformLocation>()
  private textureAssets = new Map<string, WebGLTexture>()
  private fallbackTexture: WebGLTexture | null = null
  private uniformLocations: RendererUniformLocations
  private screenMesh: UploadedMesh
  private geometryMeshes: Record<GeometryPreviewId, UploadedMesh>
  private sceneMode: SceneMode = 'screen'
  private geometryId: GeometryPreviewId = 'cube'
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

    const { program, diagnostics } = createShaderProgram(
      this.gl,
      initialSources.vertexSource ?? defaultVertexShaderSource,
      initialSources.fragmentSource ?? defaultFragmentShaderSource,
    )

    this.diagnostics = diagnostics

    if (!program) {
      throw new Error(diagnostics.program.log)
    }

    this.program = program
    this.compileSucceeded = true
    this.uniformLocations = this.getRendererUniformLocations()
    this.fallbackTexture = this.createFallbackTexture()
    this.screenMesh = this.createMesh(createScreenQuadMesh())
    this.geometryMeshes = {
      plane: this.createMesh(getPrimitiveMeshData('plane')),
      cube: this.createMesh(getPrimitiveMeshData('cube')),
      sphere: this.createMesh(getPrimitiveMeshData('sphere')),
    }
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
    if (this.animationFrameId !== null) {
      return
    }

    this.startTime = performance.now()
    const frame = (now: number) => {
      this.render((now - this.startTime) * 0.001)
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
    this.uniformLocations = this.getRendererUniformLocations()
    this.syncMaterialProperties()
    this.compileSucceeded = true

    return this.getSnapshot()
  }

  updateMaterialValues(nextValues: Record<string, MaterialPropertyValue>) {
    this.materialValues = nextValues
  }

  updateSceneMode(sceneMode: SceneMode) {
    this.sceneMode = sceneMode
  }

  updateGeometry(geometryId: GeometryPreviewId) {
    this.geometryId = geometryId
  }

  updateCameraState(cameraState: ViewportCameraState) {
    this.cameraState = cameraState
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
        return
      }

      const texture = this.gl.createTexture()
      if (!texture) {
        return
      }

      this.gl.bindTexture(this.gl.TEXTURE_2D, texture)
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR)
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR)
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.REPEAT)
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.REPEAT)
      this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, 1)
      this.gl.texImage2D(
        this.gl.TEXTURE_2D,
        0,
        this.gl.RGBA,
        this.gl.RGBA,
        this.gl.UNSIGNED_BYTE,
        asset.bitmap,
      )
      this.gl.bindTexture(this.gl.TEXTURE_2D, null)
      this.textureAssets.set(asset.id, texture)
    })
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
    this.gl.deleteProgram(this.program)
  }

  private render(elapsedSeconds: number) {
    const aspect = this.viewportWidth / Math.max(this.viewportHeight, 1)
    const cameraPosition = this.getCameraPosition()
    const viewMatrix = createLookAtMatrix4(cameraPosition, [0, 0, 0], [0, 1, 0])
    const projectionMatrix = createPerspectiveMatrix4(Math.PI / 3, Math.max(aspect, 0.0001), 0.1, 100)
    const modelMatrix =
      this.sceneMode === 'model' ? createYRotationMatrix4(elapsedSeconds * 0.35) : createIdentityMatrix4()

    this.gl.clearColor(0.02, 0.04, 0.08, 1)
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT)
    this.gl.useProgram(this.program)

    if (this.sceneMode === 'screen') {
      this.gl.disable(this.gl.DEPTH_TEST)
    } else {
      this.gl.enable(this.gl.DEPTH_TEST)
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

    this.applyMaterialUniforms()

    const mesh = this.sceneMode === 'screen' ? this.screenMesh : this.geometryMeshes[this.geometryId]
    this.gl.bindVertexArray(mesh.vao)
    this.gl.drawElements(this.gl.TRIANGLES, mesh.indexCount, this.gl.UNSIGNED_SHORT, 0)
    this.gl.bindVertexArray(null)
  }

  private resize() {
    const dpr = window.devicePixelRatio || 1
    const nextWidth = Math.max(1, Math.floor(this.canvas.clientWidth * dpr))
    const nextHeight = Math.max(1, Math.floor(this.canvas.clientHeight * dpr))

    if (this.canvas.width !== nextWidth || this.canvas.height !== nextHeight) {
      this.canvas.width = nextWidth
      this.canvas.height = nextHeight
    }

    this.viewportWidth = nextWidth
    this.viewportHeight = nextHeight
    this.gl.viewport(0, 0, nextWidth, nextHeight)
  }

  private syncMaterialProperties() {
    const reflectedProperties = reflectActiveUniforms(this.gl, this.program).filter((property) => !property.builtin)
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
      time: this.gl.getUniformLocation(this.program, 'uTime'),
      resolution: this.gl.getUniformLocation(this.program, 'uResolution'),
      sceneMode: this.gl.getUniformLocation(this.program, 'uSceneMode'),
      model: this.gl.getUniformLocation(this.program, 'uModel'),
      view: this.gl.getUniformLocation(this.program, 'uView'),
      projection: this.gl.getUniformLocation(this.program, 'uProj'),
      cameraPosition: this.gl.getUniformLocation(this.program, 'uCameraPos'),
    }
  }

  private createMesh(meshData: { vertices: Float32Array; indices: Uint16Array }): UploadedMesh {
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
    }
  }

  private deleteMesh(mesh: UploadedMesh) {
    this.gl.deleteBuffer(mesh.vertexBuffer)
    this.gl.deleteBuffer(mesh.indexBuffer)
    this.gl.deleteVertexArray(mesh.vao)
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

  private getCameraPosition(): [number, number, number] {
    const distance = Math.max(this.cameraState.distance, 1.6)
    const pitch = this.cameraState.pitch
    const yaw = this.cameraState.yaw
    const radius = distance * Math.cos(pitch)

    return [
      Math.sin(yaw) * radius,
      Math.sin(pitch) * distance,
      Math.cos(yaw) * radius,
    ]
  }
}
