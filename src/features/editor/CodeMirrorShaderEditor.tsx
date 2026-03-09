import { autocompletion, closeBrackets, startCompletion } from '@codemirror/autocomplete'
import { history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { cppLanguage } from '@codemirror/lang-cpp'
import { bracketMatching, defaultHighlightStyle, HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { lintGutter, setDiagnostics } from '@codemirror/lint'
import { Compartment, EditorState, RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  drawSelection,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
  placeholder,
  ViewPlugin,
  ViewUpdate,
} from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import type { Diagnostic } from '@codemirror/lint'
import type { ParsedDiagnosticLine } from '../../shared/types/renderDiagnostics'
import type { DiagnosticFocusTarget } from './ShaderEditorPanel'
import {
  builtinUniforms,
  commonBuiltins,
  commonKeywords,
  commonTypes,
  commonVariables,
  getStageSnippetSeeds,
  type ShaderEditorStage,
} from './glslEditorShared'

interface CodeMirrorShaderEditorProps {
  activeStage: ShaderEditorStage
  vertexSource: string
  fragmentSource: string
  vertexDiagnostics: ParsedDiagnosticLine[]
  fragmentDiagnostics: ParsedDiagnosticLine[]
  focusTarget: DiagnosticFocusTarget | null
  presetSlot?: ReactNode
  onStageChange: (stage: ShaderEditorStage) => void
  onVertexChange: (nextValue: string) => void
  onFragmentChange: (nextValue: string) => void
}

const languageCompartment = new Compartment()
const placeholderCompartment = new Compartment()
const completionCompartment = new Compartment()
const diagnosticsDecorationCompartment = new Compartment()

const shaderHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#f59e0b' },
  { tag: tags.typeName, color: '#67e8f9' },
  { tag: tags.function(tags.variableName), color: '#c084fc' },
  { tag: tags.number, color: '#fb7185' },
  { tag: tags.lineComment, color: '#64748b' },
  { tag: tags.blockComment, color: '#64748b' },
  { tag: tags.string, color: '#fde68a' },
  { tag: tags.variableName, color: '#e2e8f0' },
])

function createCompletionItems(stage: ShaderEditorStage) {
  const stageSnippets = getStageSnippetSeeds(stage)
  const stageVariables =
    stage === 'vertex'
      ? ['aPosition', 'aNormal', 'aUv']
      : ['vUv', 'vNormal', 'vWorldPosition', 'outColor']

  return [
    ...commonKeywords.map((label) => ({ label, type: 'keyword' as const })),
    ...commonTypes.map((label) => ({ label, type: 'type' as const })),
    ...commonBuiltins.map((label) => ({
      label,
      type: 'function' as const,
      apply: `${label}()`,
    })),
    ...builtinUniforms.map((label) => ({ label, type: 'variable' as const })),
    ...commonVariables.map((label) => ({ label, type: 'variable' as const })),
    ...stageVariables.map((label) => ({ label, type: 'variable' as const })),
    ...stageSnippets.map((snippet) => ({
      label: snippet.label,
      type: 'snippet' as const,
      detail: snippet.detail,
      apply: snippet.insertText,
    })),
  ]
}

function createCompletionExtension(stage: ShaderEditorStage) {
  const completionItems = createCompletionItems(stage)

  return autocompletion({
    override: [
      (context) => {
        const word = context.matchBefore(/\w*/)
        if (!word || (word.from === word.to && !context.explicit)) {
          return null
        }

        return {
          from: word.from,
          options: completionItems,
        }
      },
    ],
  })
}

function createLineDecorationExtension(lines: ParsedDiagnosticLine[]) {
  const diagnosticsByLine = new Map<number, ParsedDiagnosticLine['severity']>()

  lines.forEach((line) => {
    if (line.line !== null) {
      diagnosticsByLine.set(line.line, line.severity)
    }
  })

  return ViewPlugin.fromClass(
    class {
      decorations

      constructor(view: EditorView) {
        this.decorations = this.build(view)
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.build(update.view)
        }
      }

      build(view: EditorView) {
        const builder = new RangeSetBuilder<Decoration>()

        for (const { from, to } of view.visibleRanges) {
          let line = view.state.doc.lineAt(from)

          while (line.from <= to) {
            const severity = diagnosticsByLine.get(line.number)
            if (severity) {
              builder.add(
                line.from,
                line.from,
                Decoration.line({
                  attributes: {
                    class:
                      severity === 'warning'
                        ? 'editor-panel__line-diagnostic editor-panel__line-diagnostic--warning'
                        : 'editor-panel__line-diagnostic editor-panel__line-diagnostic--error',
                  },
                }),
              )
            }

            if (line.to >= to) {
              break
            }

            line = view.state.doc.line(line.number + 1)
          }
        }

        return builder.finish()
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    },
  )
}

function toCodeMirrorDiagnostics(lines: ParsedDiagnosticLine[], state: EditorState): Diagnostic[] {
  return lines
    .filter((line) => line.line !== null)
    .map((line) => {
      const lineNumber = Math.min(line.line ?? 1, state.doc.lines)
      const lineInfo = state.doc.line(lineNumber)
      const from = Math.min(lineInfo.from + Math.max((line.column ?? 1) - 1, 0), lineInfo.to)
      const to = Math.min(Math.max(from + 1, lineInfo.from + 1), Math.max(lineInfo.to, from + 1))

      return {
        from,
        to,
        severity: line.severity,
        message: line.message,
      } satisfies Diagnostic
    })
}

function getStagePlaceholder(stage: ShaderEditorStage) {
  return stage === 'vertex' ? 'vertex shader를 입력하세요.' : 'fragment shader를 입력하세요.'
}

function getStageDiagnostics(
  stage: ShaderEditorStage,
  vertexDiagnostics: ParsedDiagnosticLine[],
  fragmentDiagnostics: ParsedDiagnosticLine[],
) {
  return stage === 'vertex' ? vertexDiagnostics : fragmentDiagnostics
}

function getStageSource(stage: ShaderEditorStage, vertexSource: string, fragmentSource: string) {
  return stage === 'vertex' ? vertexSource : fragmentSource
}

export default function CodeMirrorShaderEditor({
  activeStage,
  vertexSource,
  fragmentSource,
  vertexDiagnostics,
  fragmentDiagnostics,
  focusTarget,
  presetSlot,
  onStageChange,
  onVertexChange,
  onFragmentChange,
}: CodeMirrorShaderEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const editorViewRef = useRef<EditorView | null>(null)
  const lastValueRef = useRef(getStageSource(activeStage, vertexSource, fragmentSource))
  const currentStageRef = useRef<ShaderEditorStage>(activeStage)
  const currentDiagnosticsRef = useRef<ParsedDiagnosticLine[]>([])
  const suppressChangeRef = useRef(false)
  const onVertexChangeRef = useRef(onVertexChange)
  const onFragmentChangeRef = useRef(onFragmentChange)
  const initialStageRef = useRef(activeStage)

  const currentSource = getStageSource(activeStage, vertexSource, fragmentSource)
  const currentDiagnostics = useMemo(
    () => getStageDiagnostics(activeStage, vertexDiagnostics, fragmentDiagnostics),
    [activeStage, fragmentDiagnostics, vertexDiagnostics],
  )
  const currentDiagnosticCount = currentDiagnostics.length
  const initialSourceRef = useRef(currentSource)
  const initialDiagnosticsRef = useRef(currentDiagnostics)

  useEffect(() => {
    currentStageRef.current = activeStage
  }, [activeStage])

  useEffect(() => {
    currentDiagnosticsRef.current = currentDiagnostics
  }, [currentDiagnostics])

  useEffect(() => {
    onVertexChangeRef.current = onVertexChange
  }, [onVertexChange])

  useEffect(() => {
    onFragmentChangeRef.current = onFragmentChange
  }, [onFragmentChange])

  useEffect(() => {
    const container = containerRef.current
    if (!container || editorViewRef.current) {
      return
    }

    const view = new EditorView({
      state: EditorState.create({
        doc: initialSourceRef.current,
        extensions: [
          lineNumbers(),
          history(),
          drawSelection(),
          highlightActiveLine(),
          bracketMatching(),
          closeBrackets(),
          languageCompartment.of(cppLanguage),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          syntaxHighlighting(shaderHighlightStyle),
          placeholderCompartment.of(placeholder(getStagePlaceholder(initialStageRef.current))),
          completionCompartment.of(createCompletionExtension(initialStageRef.current)),
          lintGutter(),
          diagnosticsDecorationCompartment.of(
            createLineDecorationExtension(initialDiagnosticsRef.current),
          ),
          keymap.of([
            ...historyKeymap,
            indentWithTab,
            {
              key: 'Ctrl-Space',
              run: startCompletion,
            },
          ]),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || suppressChangeRef.current) {
              return
            }

            const nextValue = update.state.doc.toString()
            lastValueRef.current = nextValue

            if (currentStageRef.current === 'vertex') {
              onVertexChangeRef.current(nextValue)
              return
            }

            onFragmentChangeRef.current(nextValue)
          }),
          EditorView.domEventHandlers({
            mousedown: (_event, viewInstance) => {
              const position = viewInstance.posAtCoords({ x: _event.clientX, y: _event.clientY })
              if (position === null) {
                return false
              }

              const clickedLine = viewInstance.state.doc.lineAt(position).number
              const matchedDiagnostic = currentDiagnosticsRef.current.find((line) => line.line === clickedLine)

              if (!matchedDiagnostic) {
                return false
              }

              const columnOffset = Math.max((matchedDiagnostic.column ?? 1) - 1, 0)
              const lineInfo = viewInstance.state.doc.line(clickedLine)
              const anchor = Math.min(lineInfo.from + columnOffset, lineInfo.to)

              viewInstance.dispatch({
                selection: { anchor },
                effects: EditorView.scrollIntoView(anchor, { y: 'center' }),
              })
              return false
            },
          }),
          EditorView.theme({
            '&': {
              minHeight: '320px',
              color: '#e2e8f0',
              backgroundColor: '#020617',
            },
            '.cm-content': {
              minHeight: '320px',
              padding: '14px 0',
              fontFamily: 'JetBrains Mono, Consolas, monospace',
              fontSize: '13px',
            },
            '.cm-scroller': {
              overflow: 'auto',
              fontFamily: 'JetBrains Mono, Consolas, monospace',
            },
            '.cm-gutters': {
              backgroundColor: '#020617',
              color: '#64748b',
              border: '0',
            },
            '.cm-activeLineGutter': {
              color: '#e2e8f0',
            },
            '.cm-cursor': {
              borderLeftColor: '#f8fafc',
            },
            '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
              backgroundColor: '#155e75',
            },
            '.cm-tooltip-autocomplete': {
              border: '1px solid rgba(148, 163, 184, 0.24)',
              backgroundColor: '#0f172a',
            },
            '.cm-diagnostic': {
              fontFamily: 'Pretendard, sans-serif',
            },
          }),
        ],
      }),
      parent: container,
    })

    editorViewRef.current = view
    view.dispatch(
      setDiagnostics(view.state, toCodeMirrorDiagnostics(initialDiagnosticsRef.current, view.state)),
    )

    return () => {
      view.destroy()
      editorViewRef.current = null
    }
  }, [])

  useEffect(() => {
    const view = editorViewRef.current
    if (!view) {
      return
    }

    view.dispatch({
      effects: [
        placeholderCompartment.reconfigure(placeholder(getStagePlaceholder(activeStage))),
        completionCompartment.reconfigure(createCompletionExtension(activeStage)),
      ],
    })
  }, [activeStage])

  useEffect(() => {
    const view = editorViewRef.current
    if (!view) {
      return
    }

    view.dispatch({
      effects: [
        diagnosticsDecorationCompartment.reconfigure(createLineDecorationExtension(currentDiagnostics)),
      ],
    })

    view.dispatch(setDiagnostics(view.state, toCodeMirrorDiagnostics(currentDiagnostics, view.state)))
  }, [currentDiagnostics])

  useEffect(() => {
    const view = editorViewRef.current
    if (!view) {
      return
    }

    const currentDocument = view.state.doc.toString()
    if (currentSource !== currentDocument) {
      const currentSelection = view.state.selection.main
      suppressChangeRef.current = true
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: currentSource,
        },
        selection: {
          anchor: Math.min(currentSelection.anchor, currentSource.length),
          head: Math.min(currentSelection.head, currentSource.length),
        },
      })
      lastValueRef.current = currentSource
      suppressChangeRef.current = false
    }
  }, [currentSource])

  useEffect(() => {
    const view = editorViewRef.current
    if (!view || !focusTarget || focusTarget.stage !== activeStage) {
      return
    }

    const lineNumber = Math.min(focusTarget.line, view.state.doc.lines)
    const line = view.state.doc.line(lineNumber)
    const columnOffset = Math.max((focusTarget.column ?? 1) - 1, 0)
    const anchor = Math.min(line.from + columnOffset, line.to)

    view.dispatch({
      selection: { anchor },
      effects: EditorView.scrollIntoView(anchor, { y: 'center' }),
    })
    view.focus()
  }, [activeStage, focusTarget])

  return (
    <section className="editor-panel">
      <div className="editor-panel__header">
        <p className="panel__eyebrow">Editor</p>
        <span className="editor-panel__stage">{activeStage}</span>
      </div>

      <div className="editor-panel__tabs-row">
        <div className="editor-panel__tabs">
          <button
            type="button"
            className={`editor-panel__tab ${activeStage === 'vertex' ? 'editor-panel__tab--active' : ''}`}
            onClick={() => onStageChange('vertex')}
          >
            vertexShader
          </button>
          <button
            type="button"
            className={`editor-panel__tab ${activeStage === 'fragment' ? 'editor-panel__tab--active' : ''}`}
            onClick={() => onStageChange('fragment')}
          >
            fragmentShader
          </button>
        </div>

        {presetSlot ? <div className="editor-panel__preset-slot">{presetSlot}</div> : null}
      </div>

      <div className="editor-panel__summary">
        <span className={`status-chip ${currentDiagnosticCount > 0 ? 'status-chip--error' : 'status-chip--ready'}`}>
          {currentDiagnosticCount > 0 ? `진단 ${currentDiagnosticCount}건` : '진단 없음'}
        </span>
        <p>오류가 있는 줄은 gutter와 배경으로 표시되며, 콘솔 클릭 시 해당 위치로 바로 이동합니다.</p>
      </div>

      <div ref={containerRef} className="editor-panel__editor editor-panel__editor--codemirror" />

      <p className="editor-panel__hint">`Ctrl + Space`로 GLSL 자동완성을 열 수 있습니다.</p>
    </section>
  )
}
