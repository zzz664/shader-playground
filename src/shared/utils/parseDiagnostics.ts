import type { ParsedDiagnosticLine, RenderDiagnostics, ShaderStageDiagnostic } from '../types/renderDiagnostics'

const webglLinePattern = /ERROR:\s*\d+:(\d+):\s*(.*)/i

function parseShaderDiagnostic(diagnostic: ShaderStageDiagnostic): ParsedDiagnosticLine[] {
  if (!diagnostic.log || diagnostic.success) {
    return []
  }

  return diagnostic.log
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(webglLinePattern)

      if (match) {
        return {
          stage: diagnostic.stage,
          line: Number(match[1]),
          column: null,
          message: match[2]?.trim() || line,
        } satisfies ParsedDiagnosticLine
      }

      return {
        stage: diagnostic.stage,
        line: null,
        column: null,
        message: line,
      } satisfies ParsedDiagnosticLine
    })
}

export function parseRenderDiagnostics(diagnostics: RenderDiagnostics): ParsedDiagnosticLine[] {
  const shaderLines = diagnostics.shaders.flatMap(parseShaderDiagnostic)

  if (diagnostics.program.success || !diagnostics.program.log) {
    return shaderLines
  }

  const programLines = diagnostics.program.log
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      stage: 'program',
      line: null,
      column: null,
      message: line,
    }) satisfies ParsedDiagnosticLine)

  return [...shaderLines, ...programLines]
}
