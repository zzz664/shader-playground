export function createWebGL2Context(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const context = canvas.getContext('webgl2', {
    alpha: false,
    antialias: true,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
  })

  if (!context) {
    throw new Error('이 브라우저 또는 환경에서는 WebGL2를 사용할 수 없습니다.')
  }

  return context
}
