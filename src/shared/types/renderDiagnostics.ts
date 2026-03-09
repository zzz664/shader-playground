export interface ShaderStageDiagnostic {
  stage: 'vertex' | 'fragment'
  success: boolean
  log: string
}

export interface ProgramDiagnostic {
  success: boolean
  log: string
}

export interface RenderDiagnostics {
  shaders: ShaderStageDiagnostic[]
  program: ProgramDiagnostic
}

export interface ParsedDiagnosticLine {
  stage: 'vertex' | 'fragment' | 'program'
  line: number | null
  column: number | null
  message: string
}
