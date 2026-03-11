import type {
  DiagnosticStage,
  RenderDiagnostics,
  ShaderStageDiagnostic,
} from '../../../shared/types/renderDiagnostics'

interface CompiledShaderResult {
  shader: WebGLShader | null
  diagnostic: ShaderStageDiagnostic
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
  stage: DiagnosticStage,
): CompiledShaderResult {
  const shader = gl.createShader(type)

  if (!shader) {
    return {
      shader: null,
      diagnostic: {
        stage,
        success: false,
        log: '셰이더 객체를 생성하지 못했습니다.',
      },
    }
  }

  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS)
  const log = gl.getShaderInfoLog(shader)?.trim() ?? ''

  if (!success) {
    gl.deleteShader(shader)

    return {
      shader: null,
      diagnostic: {
        stage,
        success: false,
        log: log || '컴파일에 실패했지만 드라이버 로그가 비어 있습니다.',
      },
    }
  }

  return {
    shader,
    diagnostic: {
      stage,
      success: true,
      log: log || '컴파일 성공',
    },
  }
}

export function createShaderProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
  stageOverrides: {
    vertex?: DiagnosticStage
    fragment?: DiagnosticStage
  } = {},
): { program: WebGLProgram | null; diagnostics: RenderDiagnostics } {
  const vertex = compileShader(
    gl,
    gl.VERTEX_SHADER,
    vertexSource,
    stageOverrides.vertex ?? 'vertex',
  )
  const fragment = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    fragmentSource,
    stageOverrides.fragment ?? 'fragment',
  )

  if (!vertex.shader || !fragment.shader) {
    return {
      program: null,
      diagnostics: {
        shaders: [vertex.diagnostic, fragment.diagnostic],
        program: {
          success: false,
          log: '셰이더 컴파일 실패로 프로그램 링크를 진행하지 않았습니다.',
        },
      },
    }
  }

  const program = gl.createProgram()
  if (!program) {
    gl.deleteShader(vertex.shader)
    gl.deleteShader(fragment.shader)

    return {
      program: null,
      diagnostics: {
        shaders: [vertex.diagnostic, fragment.diagnostic],
        program: {
          success: false,
          log: '프로그램 객체를 생성하지 못했습니다.',
        },
      },
    }
  }

  gl.attachShader(program, vertex.shader)
  gl.attachShader(program, fragment.shader)
  gl.linkProgram(program)

  const success = gl.getProgramParameter(program, gl.LINK_STATUS)
  const log = gl.getProgramInfoLog(program)?.trim() ?? ''

  gl.detachShader(program, vertex.shader)
  gl.detachShader(program, fragment.shader)
  gl.deleteShader(vertex.shader)
  gl.deleteShader(fragment.shader)

  if (!success) {
    gl.deleteProgram(program)

    return {
      program: null,
      diagnostics: {
        shaders: [vertex.diagnostic, fragment.diagnostic],
        program: {
          success: false,
          log: log || '링크에 실패했지만 드라이버 로그가 비어 있습니다.',
        },
      },
    }
  }

  return {
    program,
    diagnostics: {
      shaders: [vertex.diagnostic, fragment.diagnostic],
      program: {
        success: true,
        log: log || '링크 성공',
      },
    },
  }
}
