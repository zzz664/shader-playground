# CodeMirror 6 PoC 결과 보고

## 1. 문서 목적

이 문서는 `CodeMirror 6 최소 PoC` 구현 결과와 번들 비교, 기능 회귀 여부를 정리한다.

비교 대상은 다음 두 빌드다.

- 기본 빌드: Monaco 유지
- PoC 빌드: `VITE_EDITOR_ENGINE=codemirror-poc`

---

## 2. 구현 범위 요약

이번 PoC에서 실제 구현한 항목은 다음과 같다.

- fragment shader 단일 편집기
- GLSL 유사 코드 컬러링
- `Ctrl + Space` 자동완성
- fragment compile error marker
- 콘솔 클릭 시 fragment 줄 이동
- 빌드 변수 기반 Monaco / CodeMirror 분기

구현 파일:

- `src/features/editor/CodeMirrorFragmentEditor.tsx`
- `src/features/editor/glslEditorShared.ts`
- `src/features/editor/ShaderEditorPanel.tsx`
- `src/features/editor/configureMonacoGlsl.ts`

---

## 3. 번들 비교

### 3.1 Monaco 기본 빌드

측정 명령:

```powershell
npm run build
```

주요 결과:

- `assets/index-D9aOHQiU.js`: `60.43 kB`
- `assets/MonacoShaderEditor-DRSxmkJ1.js`: `7.92 kB`
- `assets/monaco-DCCsD4ep.js`: `2,561.43 kB`
- gzip 기준 `monaco` 청크: `663.88 kB`

### 3.2 CodeMirror PoC 빌드

측정 명령:

```powershell
$env:VITE_EDITOR_ENGINE='codemirror-poc'; npm run build
```

주요 결과:

- `assets/index-CNe3KXXl.js`: `59.90 kB`
- `assets/CodeMirrorFragmentEditor-B_c-Aokj.js`: `459.36 kB`
- `assets/monaco-B_C2hfr6.js`: `0.04 kB`
- gzip 기준 `CodeMirrorFragmentEditor` 청크: `151.63 kB`

### 3.3 수치 비교

에디터 관련 청크 기준 비교:

- Monaco: `2,561.43 kB`
- CodeMirror PoC: `459.36 kB`
- 차이: 약 `2,102.07 kB` 감소

gzip 기준 비교:

- Monaco: `663.88 kB`
- CodeMirror PoC: `151.63 kB`
- 차이: 약 `512.25 kB` 감소

해석:

- 에디터 엔진만 놓고 보면 CodeMirror 6 PoC가 분명히 가볍다.
- 초기 엔트리 청크 크기 차이는 크지 않지만, 에디터를 실제로 여는 순간의 다운로드 비용은 크게 줄어든다.

---

## 4. 기능 비교

### 4.1 정상 동작 확인

PoC에서 확인된 항목:

- fragment shader 편집 가능
- `Ctrl + Space` 자동완성 동작
- fragment compile error marker 표시
- 콘솔 클릭 시 fragment 줄 이동
- 기존 Monaco 빌드는 그대로 유지

### 4.2 현재 회귀 또는 미지원

PoC에서 아직 없는 항목:

- vertex editor
- Monaco 수준의 정교한 GLSL 토큰화
- marker 클릭 시 라인 이동 UX 세부 동작
- 향후 hover, folding, 고급 편집 기능
- stage 전환을 포함한 완전한 2-pane 대체

---

## 5. Lighthouse 비교

이번 세션에서는 Lighthouse 수치를 자동 측정하지 못했다.

이유:

- 로컬 환경에 Lighthouse CLI가 설치돼 있지 않다.
- 이번 작업 범위에서는 별도 측정 도구를 프로젝트 의존성으로 추가하지 않았다.

따라서 이번 문서의 결론은 **번들 결과와 기능 회귀 기준**으로 내린다.

다만 현재 결과만으로도 다음 추론은 가능하다.

- 에디터 관련 다운로드량이 크게 줄어들었으므로
- Lighthouse의 `Reduce unused JavaScript`, `Minify JavaScript`에는 유리할 가능성이 높다

이 항목은 추정이며, 실제 수치는 별도 측정이 필요하다.

---

## 6. 결론

이번 PoC 결과는 긍정적이다.

핵심 이유:

- Monaco 대비 에디터 청크가 크게 줄었다.
- 현재 프로젝트에 필요한 최소 기능은 fragment 범위에서 재현 가능했다.
- 기존 Monaco 빌드를 유지한 채 비교 가능한 구조를 만들었다.

즉, `CodeMirror 6 전환은 실익이 있다`고 판단할 수 있다.

다만 즉시 전체 교체를 하기보다, 다음 범위까지 단계적으로 확장하는 편이 안전하다.

- vertex editor 추가
- diagnostics / preset / 탭 UX 완성
- GLSL 하이라이팅 품질 보강

---

## 7. 권장 판단

현재 기준 권장 방향은 다음과 같다.

1. CodeMirror 6 전환 계획을 별도 문서로 고정한다.
2. 다음 단계에서 vertex editor까지 CodeMirror로 확장한다.
3. Monaco 전용 코드를 단계적으로 제거한다.
4. 마지막에 Lighthouse를 다시 측정해 최종 판단을 확정한다.
