import { useEffect, useRef } from 'react'
import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'
import type { editor } from 'monaco-editor'
import type { ParsedDiagnosticLine } from '../../shared/types/renderDiagnostics'
import { configureMonacoGlsl } from './configureMonacoGlsl'

export interface DiagnosticFocusTarget {
  stage: 'vertex' | 'fragment'
  line: number
  column?: number | null
  token: number
}

interface ShaderEditorPanelProps {
  title: string
  stage: 'vertex' | 'fragment'
  value: string
  diagnostics: ParsedDiagnosticLine[]
  focusTarget: DiagnosticFocusTarget | null
  onChange: (nextValue: string) => void
}

export function ShaderEditorPanel({
  title,
  stage,
  value,
  diagnostics,
  focusTarget,
  onChange,
}: ShaderEditorPanelProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof Monaco | null>(null)

  const handleBeforeMount: BeforeMount = (monaco) => {
    configureMonacoGlsl(monaco)
  }

  const handleMount: OnMount = (editorInstance, monaco) => {
    const { theme } = configureMonacoGlsl(monaco)
    monaco.editor.setTheme(theme)
    editorRef.current = editorInstance
    monacoRef.current = monaco

    editorInstance.onMouseDown((event) => {
      const lineNumber = event.target.position?.lineNumber
      if (!lineNumber) {
        return
      }

      const markers = monaco.editor
        .getModelMarkers({ resource: editorInstance.getModel()?.uri })
        .filter((marker: editor.IMarker) => marker.startLineNumber === lineNumber)

      if (markers.length === 0) {
        return
      }

      const targetMarker = markers[0]
      editorInstance.revealLineInCenter(targetMarker.startLineNumber)
      editorInstance.setPosition({
        lineNumber: targetMarker.startLineNumber,
        column: targetMarker.startColumn,
      })
      editorInstance.focus()
    })

    editorInstance.focus()
  }

  useEffect(() => {
    const editorInstance = editorRef.current
    const monacoInstance = monacoRef.current
    const model = editorInstance?.getModel()

    if (!editorInstance || !monacoInstance || !model) {
      return
    }

    const markers = diagnostics
      .filter((line) => line.line !== null)
      .map((line) => {
        const startLineNumber = Math.min(line.line ?? 1, model.getLineCount())
        const maxColumn = model.getLineMaxColumn(startLineNumber)
        const startColumn = Math.min(line.column ?? 1, maxColumn)
        const endColumn = Math.max(startColumn + 1, maxColumn)

        return {
          severity:
            line.severity === 'warning'
              ? monacoInstance.MarkerSeverity.Warning
              : monacoInstance.MarkerSeverity.Error,
          message: line.message,
          source: 'shader-compiler',
          startLineNumber,
          startColumn,
          endLineNumber: startLineNumber,
          endColumn,
        }
      })

    monacoInstance.editor.setModelMarkers(model, `shader-${stage}`, markers)
  }, [diagnostics, stage])

  useEffect(() => {
    const editorInstance = editorRef.current

    if (!editorInstance || !focusTarget || focusTarget.stage !== stage) {
      return
    }

    const lineNumber = focusTarget.line
    const column = focusTarget.column ?? 1
    editorInstance.revealLineInCenter(lineNumber)
    editorInstance.setPosition({ lineNumber, column })
    editorInstance.setSelection({
      startLineNumber: lineNumber,
      startColumn: column,
      endLineNumber: lineNumber,
      endColumn: column,
    })
    editorInstance.focus()
  }, [focusTarget, stage])

  const path = stage === 'vertex' ? 'file:///vertex.vert.glsl' : 'file:///fragment.frag.glsl'

  return (
    <section className="editor-panel">
      <div className="editor-panel__header">
        <div>
          <p className="panel__eyebrow">Editor</p>
          <h2>{title}</h2>
        </div>
        <span className="editor-panel__stage">{stage}</span>
      </div>

      <div className="editor-panel__editor">
        <Editor
          beforeMount={handleBeforeMount}
          height="320px"
          language="shader-glsl"
          onChange={(nextValue) => {
            onChange(nextValue ?? '')
          }}
          onMount={handleMount}
          options={{
            automaticLayout: true,
            fontFamily: 'JetBrains Mono, Consolas, monospace',
            fontLigatures: true,
            fontSize: 13,
            glyphMargin: true,
            lineNumbersMinChars: 3,
            minimap: { enabled: false },
            padding: { top: 14, bottom: 14 },
            quickSuggestions: {
              comments: false,
              other: true,
              strings: false,
            },
            renderValidationDecorations: 'on',
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            snippetSuggestions: 'top',
            suggestOnTriggerCharacters: true,
            tabSize: 2,
            wordBasedSuggestions: 'currentDocument',
          }}
          path={path}
          theme="shader-playground"
          value={value}
        />
      </div>

      <p className="editor-panel__hint">`Ctrl + Space`로 GLSL 자동완성을 열 수 있습니다.</p>
    </section>
  )
}
