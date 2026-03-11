import type {
  ParsedDiagnosticLine,
  PostPassDiagnostic,
  RenderDiagnostics,
  ShaderStageDiagnostic,
} from '../types/renderDiagnostics'

const webglLinePattern = /^(ERROR|WARNING):\s*\d+:(\d+)(?::(\d+))?:\s*(.*)$/i

function parseSeverity(rawLine: string): ParsedDiagnosticLine['severity'] {
  return rawLine.toUpperCase().startsWith('WARNING') ? 'warning' : 'error'
}

function parseShaderDiagnostic(
  diagnostic: ShaderStageDiagnostic,
  postPass?: PostPassDiagnostic,
): ParsedDiagnosticLine[] {
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
          passId: postPass?.passId,
          passName: postPass?.passName,
          line: Number(match[2]),
          column: match[3] ? Number(match[3]) : null,
          message: match[4]?.trim() || line,
        } satisfies ParsedDiagnosticLine
      }

      return {
        stage: diagnostic.stage,
        severity: parseSeverity(line),
        passId: postPass?.passId,
        passName: postPass?.passName,
        line: null,
        column: null,
        message: line,
      } satisfies ParsedDiagnosticLine
    })
}

export function parseRenderDiagnostics(diagnostics: RenderDiagnostics): ParsedDiagnosticLine[] {
  const shaderLines = diagnostics.shaders.flatMap((diagnostic) => parseShaderDiagnostic(diagnostic))
  const programLines: ParsedDiagnosticLine[] = []

  if (!diagnostics.program.success && diagnostics.program.log) {
    programLines.push(
      ...diagnostics.program.log
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => ({
          stage: 'program',
          severity: parseSeverity(line),
          line: null,
          column: null,
          message: line,
        }) satisfies ParsedDiagnosticLine),
    )
  }

  const postProgramLines: ParsedDiagnosticLine[] =
    !diagnostics.postPasses?.length &&
    !diagnostics.postProgram?.success &&
    diagnostics.postProgram?.log
      ? diagnostics.postProgram.log
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => ({
            stage: 'post',
            severity: parseSeverity(line),
            line: null,
            column: null,
            message: line,
          }) satisfies ParsedDiagnosticLine)
      : []

  const postPassLines =
    diagnostics.postPasses?.flatMap((postPass) => {
      const shaderLines = postPass.shaders.flatMap((diagnostic) =>
        parseShaderDiagnostic(diagnostic, postPass),
      )
      const programLines =
        !postPass.program.success && postPass.program.log
          ? postPass.program.log
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line) => ({
                stage: 'post',
                severity: parseSeverity(line),
                passId: postPass.passId,
                passName: postPass.passName,
                line: null,
                column: null,
                message: line,
              }) satisfies ParsedDiagnosticLine)
          : []

      return [...shaderLines, ...programLines]
    }) ?? []

  return [...shaderLines, ...programLines, ...postProgramLines, ...postPassLines]
}
