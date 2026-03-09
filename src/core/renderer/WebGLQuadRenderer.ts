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
import { createWebGL2Context } from './gl/webglContext'
import type { RenderDiagnostics } from '../../shared/types/renderDiagnostics'
import type {
  MaterialPropertyDefinition,
  MaterialPropertyValue,
} from '../../shared/types/materialProperty'

export interface RendererStateSnapshot {
  diagnostics: RenderDiagnostics
  viewportWidth: number
  viewportHeight: number
  compileSucceeded: boolean
  materialProperties: MaterialPropertyDefinition[]
  materialValues: Record<string, MaterialPropertyValue>
}

export class WebGLQuadRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly gl: WebGL2RenderingContext
  private program: WebGLProgram
  private readonly vao: WebGLVertexArrayObject
  private readonly positionBuffer: WebGLBuffer
  private resolutionLocation: WebGLUniformLocation | null
  private timeLocation: WebGLUniformLocation | null
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

    const vao = this.gl.createVertexArray()
    const positionBuffer = this.gl.createBuffer()

    if (!vao || !positionBuffer) {
      throw new Error('fullscreen quad 초기 버퍼를 생성하지 못했습니다.')
    }

    this.vao = vao
    this.positionBuffer = positionBuffer
    this.timeLocation = this.gl.getUniformLocation(this.program, 'uTime')
    this.resolutionLocation = this.gl.getUniformLocation(this.program, 'uResolution')
    this.syncMaterialProperties()

    this.configureQuad()
    this.resizeObserver = new ResizeObserver(() => {
      this.resize()
    })
    this.resizeObserver.observe(this.canvas)
    this.resize()
  }

  private configureQuad() {
    const vertices = new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      -1, 1,
      1, -1,
      1, 1,
    ])

    this.gl.bindVertexArray(this.vao)
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer)
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW)
    this.gl.enableVertexAttribArray(0)
    this.gl.vertexAttribPointer(0, 2, this.gl.FLOAT, false, 0, 0)
    this.gl.bindVertexArray(null)
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null)
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

  private render(elapsedSeconds: number) {
    this.gl.clearColor(0.02, 0.04, 0.08, 1)
    this.gl.clear(this.gl.COLOR_BUFFER_BIT)
    this.gl.useProgram(this.program)

    if (this.timeLocation) {
      this.gl.uniform1f(this.timeLocation, elapsedSeconds)
    }

    if (this.resolutionLocation) {
      this.gl.uniform2f(this.resolutionLocation, this.viewportWidth, this.viewportHeight)
    }

    this.applyMaterialUniforms()

    this.gl.bindVertexArray(this.vao)
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6)
    this.gl.bindVertexArray(null)
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
    this.timeLocation = this.gl.getUniformLocation(this.program, 'uTime')
    this.resolutionLocation = this.gl.getUniformLocation(this.program, 'uResolution')
    this.syncMaterialProperties()
    this.compileSucceeded = true

    return this.getSnapshot()
  }

  updateMaterialValues(nextValues: Record<string, MaterialPropertyValue>) {
    this.materialValues = nextValues
  }

  private syncMaterialProperties() {
    const reflectedProperties = reflectActiveUniforms(this.gl, this.program).filter((property) => !property.builtin)
    const nextUniformLocations = new Map<string, WebGLUniformLocation>()
    const nextValues: Record<string, MaterialPropertyValue> = {}

    reflectedProperties.forEach((property) => {
      const location = this.gl.getUniformLocation(this.program, property.name)
      if (location) {
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
    this.materialProperties.forEach((property) => {
      const location = this.materialUniformLocations.get(property.name)
      const value = this.materialValues[property.name]

      if (!location || value === undefined) {
        return
      }

      if (property.componentCount === 1) {
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

  dispose() {
    this.stop()
    this.resizeObserver.disconnect()
    this.gl.deleteBuffer(this.positionBuffer)
    this.gl.deleteVertexArray(this.vao)
    this.gl.deleteProgram(this.program)
  }
}
