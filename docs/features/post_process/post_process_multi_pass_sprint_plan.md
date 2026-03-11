# Post Process 사용자 정의 N-Pass Chain 스프린트 계획

## 목적

사용자가 직접 pass를 추가하고 수정할 수 있는 N-pass chain 구조를 스프린트 단위로 나누어 안전하게 구현한다.

## 스프린트 구성 원칙

- 먼저 pass chain 상태를 정의한다.
- 그 다음 에디터를 pass 목록 구조로 바꾼다.
- 이후 렌더러 N-pass 루프를 붙인다.
- 마지막에 diagnostics, inspector, 저장, 안정화를 확장한다.

## Sprint A. Pass Chain 상태 정의

### 범위

- `PostProcessPass`
- `PostProcessChainState`
- 기본 pass 1개 생성
- 단일 `postProcessSource` 제거

### 포함 WBS

- `1.1` ~ `1.4`

### 수정 예상 파일

- `src/App.tsx`
- `src/shared/types/projectSnapshot.ts`

### 완료 기준

- post process 상태가 단일 source가 아니라 pass 목록 구조가 된다.

### 리스크

- 기존 저장 구조와의 호환성

## Sprint B. 에디터 Pass 목록 구조

### 범위

- pass 목록 UI
- 추가 / 삭제 / 이름 변경 / 순서 이동
- 선택된 pass source 편집

### 포함 WBS

- `2.1` ~ `2.6`

### 수정 예상 파일

- `src/features/editor/ShaderEditorPanel.tsx`
- `src/features/editor/CodeMirrorShaderEditor.tsx`
- `src/App.tsx`

### 완료 기준

- 사용자가 pass를 직접 생성하고 수정할 수 있다.

### 리스크

- 탭 / 목록 UI 복잡도 증가

## Sprint C. 렌더러 N-Pass 루프

### 범위

- ping-pong target A/B
- pass별 program 관리
- pass 순차 렌더 루프
- 마지막 pass screen output
- bypass 경로

### 포함 WBS

- `3.1` ~ `3.7`

### 수정 예상 파일

- `src/core/renderer/WebGLQuadRenderer.ts`
- `src/core/shader/templates/defaultShaders.ts`

### 완료 기준

- pass 수와 순서에 따라 렌더 결과가 달라진다.

### 리스크

- feedback loop
- target 전환 실수

## Sprint D. Pass 입력 Uniform

### 범위

- `uSceneColor`
- `uPrevPassColor`
- `uResolution`
- `uTime`

### 포함 WBS

- `4.1` ~ `4.3`

### 수정 예상 파일

- `src/core/renderer/WebGLQuadRenderer.ts`
- `src/core/shader/templates/defaultShaders.ts`

### 완료 기준

- 각 pass가 원본 scene과 직전 pass 결과를 사용할 수 있다.

### 리스크

- uniform 의미가 사용자에게 모호할 수 있음

## Sprint E. Diagnostics / Inspector

### 범위

- pass별 diagnostics
- pass별 marker
- pass별 console
- pass별 uniform reflection
- pass별 inspector

### 포함 WBS

- `5.1` ~ `5.5`

### 수정 예상 파일

- `src/shared/types/renderDiagnostics.ts`
- `src/shared/utils/parseDiagnostics.ts`
- `src/shared/types/materialProperty.ts`
- `src/features/console/ShaderConsolePanel.tsx`
- `src/features/inspector/MaterialInspectorPanel.tsx`
- `src/App.tsx`

### 완료 기준

- pass별 오류와 uniform을 독립적으로 다룰 수 있다.

### 리스크

- pass 수 증가에 따라 UI 복잡도 증가

## Sprint F. 저장 / 복원

### 범위

- snapshot 확장
- local save/load
- JSON export/import

### 포함 WBS

- `6.1` ~ `6.3`

### 수정 예상 파일

- `src/shared/types/projectSnapshot.ts`
- `src/shared/utils/projectPersistence.ts`
- `src/App.tsx`

### 완료 기준

- pass chain 전체가 저장/복원된다.

### 리스크

- 구버전 스냅샷과의 호환성

## Sprint G. 안정화

### 범위

- pass별 state 정리
- ping-pong lifecycle 정리
- pass 추가/삭제/재정렬 직후 안정화
- recompilation 안정화

### 포함 WBS

- `7.1` ~ `7.4`

### 수정 예상 파일

- `src/core/renderer/WebGLQuadRenderer.ts`
- `src/App.tsx`

### 완료 기준

- 구조 변경과 재컴파일 이후에도 chain이 안정적으로 동작한다.

### 리스크

- 검정 화면
- 상태 복원 누락

## 권장 진행 순서

1. Sprint A
2. Sprint B
3. Sprint C
4. Sprint D
5. Sprint E
6. Sprint F
7. Sprint G

## 현재 권장 세션 시작점

가장 먼저 시작할 세션은 `Sprint A`다.

이유:

- pass chain 자체가 정의되지 않으면 에디터, 렌더러, 저장 구조를 올바르게 나눌 수 없다.
- 다중 pass의 핵심은 특정 효과가 아니라 “사용자 정의 pass 목록 구조”이기 때문이다.
