export type ParsedDiagnosticSeverity = 'error' | 'warning'
export type DiagnosticStage = 'vertex' | 'fragment' | 'post'

export interface ShaderStageDiagnostic {
  stage: DiagnosticStage
  success: boolean
  log: string
}

export interface ProgramDiagnostic {
  success: boolean
  log: string
}

export interface PostPassDiagnostic {
  passId: string
  passName: string
  shaders: ShaderStageDiagnostic[]
  program: ProgramDiagnostic
}

export interface RenderDiagnostics {
  shaders: ShaderStageDiagnostic[]
  program: ProgramDiagnostic
  postProgram?: ProgramDiagnostic
  postPasses?: PostPassDiagnostic[]
}

export interface ParsedDiagnosticLine {
  stage: DiagnosticStage | 'program'
  severity: ParsedDiagnosticSeverity
  passId?: string
  passName?: string
  line: number | null
  column: number | null
  message: string
}
