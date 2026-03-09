import type { ParsedDiagnosticLine, RenderDiagnostics, ShaderStageDiagnostic } from '../types/renderDiagnostics'

const webglLinePattern = /^(ERROR|WARNING):\s*\d+:(\d+)(?::(\d+))?:\s*(.*)$/i

function parseSeverity(rawLine: string): ParsedDiagnosticLine['severity'] {
  return rawLine.toUpperCase().startsWith('WARNING') ? 'warning' : 'error'
}

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
          severity: parseSeverity(match[1] ?? line),
          line: Number(match[2]),
          column: match[3] ? Number(match[3]) : null,
          message: match[4]?.trim() || line,
        } satisfies ParsedDiagnosticLine
      }

      return {
        stage: diagnostic.stage,
        severity: parseSeverity(line),
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
      severity: parseSeverity(line),
      line: null,
      column: null,
      message: line,
    }) satisfies ParsedDiagnosticLine)

  return [...shaderLines, ...programLines]
}
