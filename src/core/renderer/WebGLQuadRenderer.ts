import { createShaderProgram } from '../shader/compiler/shaderCompiler'
import {
  defaultFragmentShaderSource,
  defaultVertexShaderSource,
} from '../shader/templates/defaultShaders'
import { createWebGL2Context } from './gl/webglContext'
import type { RenderDiagnostics } from '../../shared/types/renderDiagnostics'

export interface RendererStateSnapshot {
  diagnostics: RenderDiagnostics
  viewportWidth: number
  viewportHeight: number
}

export class WebGLQuadRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly gl: WebGL2RenderingContext
  private readonly program: WebGLProgram
  private readonly vao: WebGLVertexArrayObject
  private readonly positionBuffer: WebGLBuffer
  private readonly resolutionLocation: WebGLUniformLocation | null
  private readonly timeLocation: WebGLUniformLocation | null
  private readonly resizeObserver: ResizeObserver
  private animationFrameId: number | null = null
  private startTime = 0
  private viewportWidth = 0
  private viewportHeight = 0
  private readonly diagnostics: RenderDiagnostics

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.gl = createWebGL2Context(canvas)

    const { program, diagnostics } = createShaderProgram(
      this.gl,
      defaultVertexShaderSource,
      defaultFragmentShaderSource,
    )

    this.diagnostics = diagnostics

    if (!program) {
      throw new Error(diagnostics.program.log)
    }

    this.program = program

    const vao = this.gl.createVertexArray()
    const positionBuffer = this.gl.createBuffer()

    if (!vao || !positionBuffer) {
      throw new Error('fullscreen quad 초기 버퍼를 생성하지 못했습니다.')
    }

    this.vao = vao
    this.positionBuffer = positionBuffer
    this.timeLocation = this.gl.getUniformLocation(this.program, 'uTime')
    this.resolutionLocation = this.gl.getUniformLocation(this.program, 'uResolution')

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
    }
  }

  dispose() {
    this.stop()
    this.resizeObserver.disconnect()
    this.gl.deleteBuffer(this.positionBuffer)
    this.gl.deleteVertexArray(this.vao)
    this.gl.deleteProgram(this.program)
  }
}
