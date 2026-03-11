# CodeMirror 6 전환 계획

## 1. 문서 목적

이 문서는 `CodeMirror 6 PoC 결과`를 바탕으로, 현재 Monaco 기반 에디터를 CodeMirror 6으로 단계적으로 교체하기 위한 실행 계획을 정리한다.

전환 목표는 다음과 같다.

- 에디터 관련 번들 크기 감소
- 초기 및 지연 로드 성능 개선
- 현재 프로젝트에 필요한 편집 UX 유지

---

## 2. 전환 판단 근거

PoC 결과 기준:

- Monaco 에디터 청크: 약 `2,561.43 kB`
- CodeMirror fragment PoC 청크: 약 `459.36 kB`

즉 에디터 관련 청크만 비교해도 약 `2.1MB` 감소 효과가 있었다.

또한 fragment 범위에서 다음 기능이 재현됐다.

- 코드 편집
- 자동완성
- diagnostics marker
- 콘솔 클릭 이동

따라서 전환 실익은 충분하다고 본다.

---

## 3. 전환 원칙

### 3.1 단계적 전환

Monaco를 한 번에 제거하지 않는다.

다음 순서로 진행한다.

1. CodeMirror를 vertex / fragment 전체 편집기로 확장
2. diagnostics, preset, focus 이동 UX를 안정화
3. Monaco 경로를 제거

### 3.2 기능 회귀 금지

다음 기능은 Monaco 제거 전에 반드시 재현돼야 한다.

- vertex / fragment 탭 편집
- `Ctrl + Space` 자동완성
- compile error marker
- 콘솔 클릭 이동
- preset 적용

### 3.3 GLSL 품질 보강

초기 PoC는 `GLSL 유사 컬러링` 수준이다.

실전 전환 전에는 다음을 보강해야 한다.

- GLSL 키워드 / 타입 / 함수 강조 정확도
- stage별 스니펫 자동완성 확장
- 내장 uniform 제안 품질 개선

---

## 4. 단계별 작업

## Phase 1. CodeMirror 범위 확장

### 목표

현재 fragment 단일 PoC를 실제 편집기 수준으로 확장한다.

### 작업 항목

- vertex editor 추가
- fragment / vertex 탭 전환 지원
- stage별 diagnostics marker 분리
- 콘솔 클릭 시 stage 자동 전환
- preset 적용 흐름 재검증

### 완료 기준

- 현재 Monaco 편집 흐름을 CodeMirror에서도 동일하게 재현 가능

---

## Phase 2. GLSL 지원 품질 보강

### 목표

PoC 수준의 문법 강조와 자동완성을 실제 사용 가능한 수준으로 끌어올린다.

### 작업 항목

- GLSL 전용 하이라이팅 규칙 보강
- snippet 정리
- 자동완성 후보 그룹화
- 문법 강조 색상 정리

### 완료 기준

- 셰이더 편집 UX가 Monaco 대비 명확히 열화되지 않음

---

## Phase 3. Monaco 제거 준비

### 목표

Monaco 관련 의존성과 코드 경로를 제거할 준비를 한다.

### 작업 항목

- Monaco 전용 wrapper 제거 계획 확정
- `configureMonacoGlsl.ts` 역할을 CodeMirror 설정으로 이전
- 번들 비교 재측정
- Lighthouse 재측정

### 완료 기준

- CodeMirror 단일 경로로 운영 가능하다고 판단됨

---

## Phase 4. Monaco 제거

### 목표

Monaco 의존성을 프로젝트에서 제거한다.

### 작업 항목

- `@monaco-editor/react` 제거
- `monaco-editor` 제거
- Monaco 관련 코드 삭제
- README / 성능 문서 갱신

### 완료 기준

- 프로덕션 빌드에 Monaco 청크가 남지 않음

---

## 5. 예상 수정 파일

다음 파일들이 전환의 핵심 대상이다.

- `src/features/editor/ShaderEditorPanel.tsx`
- `src/features/editor/CodeMirrorFragmentEditor.tsx`
- `src/features/editor/glslEditorShared.ts`
- `src/features/editor/configureMonacoGlsl.ts`
- `src/features/console/ShaderConsolePanel.tsx`
- `src/App.tsx`
- `src/App.css`
- `package.json`

---

## 6. 리스크

### 6.1 GLSL 지원 품질 저하

CodeMirror는 Monaco보다 기본 기능이 가벼운 대신, GLSL 지원 품질을 직접 다듬어야 한다.

### 6.2 diagnostics UX 회귀

marker 표시와 줄 이동은 구현 가능하지만, Monaco 수준의 세밀한 UX는 추가 작업이 필요하다.

### 6.3 일정 확장

에디터 전환은 성능 최적화이면서도 기능 작업이므로, 다른 WBS 항목을 잠시 밀어낼 수 있다.

---

## 7. 권장 다음 작업

가장 적절한 다음 작은 작업은 다음 순서다.

1. CodeMirror vertex editor 추가
2. fragment / vertex 탭 통합
3. diagnostics와 콘솔 이동 UX 정리
4. Lighthouse 재측정

---

## 8. 결론

PoC 결과 기준으로 CodeMirror 6 전환은 충분히 진행할 가치가 있다.

다만 지금 시점에서 바로 Monaco를 제거하기보다, **CodeMirror를 현재 편집 흐름 전체로 확장한 뒤 최종 교체**하는 단계적 접근이 가장 안전하다.
