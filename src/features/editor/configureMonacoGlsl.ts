import { loader } from '@monaco-editor/react'
import * as monacoEditor from 'monaco-editor/esm/vs/editor/editor.api.js'
import type * as Monaco from 'monaco-editor'

const shaderLanguageId = 'shader-glsl'

loader.config({ monaco: monacoEditor })

let isLanguageRegistered = false
let isThemeRegistered = false
let isCompletionProviderRegistered = false

type MonacoCompletionSeed = Omit<Monaco.languages.CompletionItem, 'range'>

const commonKeywords = [
  'uniform',
  'in',
  'out',
  'inout',
  'precision',
  'highp',
  'mediump',
  'lowp',
  'const',
  'if',
  'else',
  'for',
  'while',
  'return',
  'struct',
  'layout',
]

const commonTypes = ['void', 'bool', 'int', 'float', 'vec2', 'vec3', 'vec4', 'mat3', 'mat4', 'sampler2D']

const commonBuiltins = [
  'sin',
  'cos',
  'tan',
  'pow',
  'min',
  'max',
  'clamp',
  'mix',
  'step',
  'smoothstep',
  'length',
  'normalize',
  'dot',
  'cross',
  'reflect',
  'texture',
]

const builtinUniforms = ['uTime', 'uResolution', 'uMouse', 'uModel', 'uView', 'uProj', 'uCameraPos', 'uSceneMode']

const commonVariables = ['vUv', 'vNormal', 'vWorldPosition', 'outColor']

function buildCommonSuggestions(monaco: typeof Monaco): MonacoCompletionSeed[] {
  return [
    ...commonKeywords.map((keyword) => ({
      label: keyword,
      kind: monaco.languages.CompletionItemKind.Keyword,
      insertText: keyword,
    })),
    ...commonTypes.map((typeName) => ({
      label: typeName,
      kind: monaco.languages.CompletionItemKind.Class,
      insertText: typeName,
    })),
    ...commonBuiltins.map((functionName) => ({
      label: functionName,
      kind: monaco.languages.CompletionItemKind.Function,
      insertText: `${functionName}($1)`,
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    })),
    ...builtinUniforms.map((uniformName) => ({
      label: uniformName,
      kind: monaco.languages.CompletionItemKind.Variable,
      insertText: uniformName,
    })),
    ...commonVariables.map((variableName) => ({
      label: variableName,
      kind: monaco.languages.CompletionItemKind.Variable,
      insertText: variableName,
    })),
  ]
}

function buildStageSuggestions(
  monaco: typeof Monaco,
  stage: 'vertex' | 'fragment',
): MonacoCompletionSeed[] {
  if (stage === 'vertex') {
    return [
      {
        label: 'vertex-main',
        kind: monaco.languages.CompletionItemKind.Snippet,
        insertText: [
          'void main() {',
          '  vec4 worldPosition = uModel * vec4(aPosition, 1.0);',
          '  vWorldPosition = worldPosition.xyz;',
          '  vNormal = mat3(uModel) * aNormal;',
          '  vUv = aUv;',
          '  gl_Position = uProj * uView * worldPosition;',
          '}',
        ].join('\n'),
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        documentation: '기본 vertex main 템플릿',
      },
      {
        label: 'aPosition',
        kind: monaco.languages.CompletionItemKind.Variable,
        insertText: 'aPosition',
      },
      {
        label: 'aNormal',
        kind: monaco.languages.CompletionItemKind.Variable,
        insertText: 'aNormal',
      },
      {
        label: 'aUv',
        kind: monaco.languages.CompletionItemKind.Variable,
        insertText: 'aUv',
      },
    ]
  }

  return [
    {
      label: 'fragment-main',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: [
        'void main() {',
        '  vec3 normal = normalize(vNormal);',
        '  vec3 lightDir = normalize(vec3(0.4, 0.7, 0.5));',
        '  float lambert = max(dot(normal, lightDir), 0.0);',
        '  vec3 color = vec3(0.14) + lambert * vec3(0.86);',
        '  outColor = vec4(color, 1.0);',
        '}',
      ].join('\n'),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      documentation: '기본 fragment main 템플릿',
    },
    {
      label: 'texture-sample',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: 'texture(${1:detailTex}, ${2:vUv})',
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      documentation: 'sampler2D 샘플링 스니펫',
    },
  ]
}

export function configureMonacoGlsl(monaco: typeof Monaco) {
  if (!isLanguageRegistered) {
    monaco.languages.register({ id: shaderLanguageId })
    monaco.languages.setMonarchTokensProvider(shaderLanguageId, {
      defaultToken: '',
      tokenPostfix: '.glsl',
      keywords: commonKeywords,
      typeKeywords: commonTypes,
      builtinFunctions: commonBuiltins,
      builtinUniforms,
      tokenizer: {
        root: [
          [
            /[a-zA-Z_]\w*(?=\s*\()/,
            {
              cases: {
                '@builtinFunctions': 'predefined',
                '@default': 'function',
              },
            },
          ],
          [
            /[a-zA-Z_]\w*/,
            {
              cases: {
                '@keywords': 'keyword',
                '@typeKeywords': 'type',
                '@builtinUniforms': 'constant',
                '@default': 'identifier',
              },
            },
          ],
          { include: '@whitespace' },
          [/[{}()[\]]/, '@brackets'],
          [/[-+*/%=&|!<>?:]+/, 'operator'],
          [/\d*\.\d+([eE][-+]?\d+)?/, 'number.float'],
          [/\d+/, 'number'],
          [/[;,.]/, 'delimiter'],
          [/"([^"\\]|\\.)*$/, 'string.invalid'],
          [/"/, { token: 'string.quote', bracket: '@open', next: '@string' }],
        ],
        whitespace: [
          [/[ \t\r\n]+/, 'white'],
          [/\/\*/, 'comment', '@comment'],
          [/\/\/.*$/, 'comment'],
        ],
        comment: [
          [/[^/*]+/, 'comment'],
          [/\*\//, 'comment', '@pop'],
          [/[/*]/, 'comment'],
        ],
        string: [
          [/[^\\"]+/, 'string'],
          [/\\./, 'string.escape'],
          [/"/, { token: 'string.quote', bracket: '@close', next: '@pop' }],
        ],
      },
    })
    monaco.languages.setLanguageConfiguration(shaderLanguageId, {
      comments: {
        lineComment: '//',
        blockComment: ['/*', '*/'],
      },
      brackets: [
        ['{', '}'],
        ['[', ']'],
        ['(', ')'],
      ],
      autoClosingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
      ],
    })
    isLanguageRegistered = true
  }

  if (!isThemeRegistered) {
    monaco.editor.defineTheme('shader-playground', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: 'f59e0b' },
        { token: 'type', foreground: '67e8f9' },
        { token: 'predefined', foreground: 'c084fc' },
        { token: 'constant', foreground: '34d399' },
        { token: 'number', foreground: 'fb7185' },
        { token: 'comment', foreground: '64748b' },
        { token: 'string', foreground: 'fde68a' },
        { token: 'identifier', foreground: 'e2e8f0' },
      ],
      colors: {
        'editor.background': '#020617',
        'editorLineNumber.foreground': '#64748b',
        'editorLineNumber.activeForeground': '#e2e8f0',
        'editorCursor.foreground': '#f8fafc',
        'editor.selectionBackground': '#155e75',
      },
    })
    isThemeRegistered = true
  }

  if (!isCompletionProviderRegistered) {
    monaco.languages.registerCompletionItemProvider(shaderLanguageId, {
      triggerCharacters: ['.', 'u', 'v'],
      provideCompletionItems(model, position) {
        const word = model.getWordUntilPosition(position)
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        }
        const stage = model.uri.path.endsWith('.vert.glsl') ? 'vertex' : 'fragment'
        const suggestions = [...buildCommonSuggestions(monaco), ...buildStageSuggestions(monaco, stage)].map(
          (suggestion) => ({
            ...suggestion,
            range,
          }),
        )

        return { suggestions }
      },
    })
    isCompletionProviderRegistered = true
  }

  return {
    languageId: shaderLanguageId,
    theme: 'shader-playground',
  }
}
