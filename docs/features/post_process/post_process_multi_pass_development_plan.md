# Post Process 사용자 정의 N-Pass Chain 개발 계획 문서

## 목적

현재 단일 `Post Process` 구조를, **사용자가 직접 pass를 추가 / 삭제 / 재정렬 / 편집할 수 있는 N-pass chain 구조**로 확장한다.

목표는 아래 구조를 지원하는 것이다.

```text
Scene Pass
  사용자 Vertex Shader
  사용자 Fragment Shader
  -> Scene Texture

Pass 1
  고정 Fullscreen Vertex Shader
  사용자 Pass 1 Fragment Shader
  -> Ping Texture A

Pass 2
  고정 Fullscreen Vertex Shader
  사용자 Pass 2 Fragment Shader
  -> Ping Texture B

...

Pass N
  고정 Fullscreen Vertex Shader
  사용자 Pass N Fragment Shader
  -> Default Framebuffer
```

즉 마지막 pass `N`이 final composite 역할을 수행한다.

## 범위

### 포함

- 사용자 정의 post pass 목록 구조
- pass 추가 / 삭제 / 재정렬 / 이름 변경
- pass별 shader source
- ping-pong A/B target 기반 N-pass 렌더 루프
- pass별 diagnostics / inspector / 저장 복원

### 제외

- pass별 vertex shader 편집
- MRT 기반 최적화
- 고급 pass dependency graph
- branching graph editor

## 설계 원칙

### 1. post pass는 리스트 구조여야 한다

고정 `Post Process` 단일 source가 아니라 아래 구조가 필요하다.

```ts
interface PostProcessPass {
  id: string
  name: string
  enabled: boolean
  source: string
}
```

```ts
interface PostProcessChainState {
  enabled: boolean
  passes: PostProcessPass[]
}
```

### 2. 각 pass는 fragment shader만 사용자 편집 대상으로 둔다

각 pass는 fullscreen post pass이므로 vertex shader는 고정한다.
이렇게 해야 에디터, reflection, diagnostics 복잡도를 줄일 수 있다.

### 3. 마지막 pass만 screen output을 담당한다

중간 pass는 모두 offscreen ping-pong target으로 렌더링하고, 마지막 pass만 기본 framebuffer에 출력한다.

### 4. source / destination target은 렌더러가 내부에서 관리한다

사용자가 target을 직접 지정하게 하면 feedback loop 실수 가능성이 커진다.
따라서 렌더러가 pass index를 기준으로 A/B ping-pong을 자동 선택한다.

## 현재 코드 기준 주요 수정 지점

### 앱 상태

- `src/App.tsx`
  - `postProcessSource` 단일 문자열 제거
  - `postProcessChainState` 추가

### 에디터

- `src/features/editor/ShaderEditorPanel.tsx`
- `src/features/editor/CodeMirrorShaderEditor.tsx`
  - pass 목록 탭 구조
  - pass 추가 / 삭제 / 순서 이동 UI

### 렌더러

- `src/core/renderer/WebGLQuadRenderer.ts`
  - post program 단일 구조 제거
  - pass별 program 관리
  - ping-pong A/B target
  - N-pass 렌더 루프

### 셰이더 템플릿

- `src/core/shader/templates/defaultShaders.ts`
  - 기본 pass fragment 템플릿
  - 고정 fullscreen vertex shader

### 진단 / 인스펙터 / 저장

- `src/shared/types/renderDiagnostics.ts`
- `src/shared/utils/parseDiagnostics.ts`
- `src/shared/types/materialProperty.ts`
- `src/features/inspector/MaterialInspectorPanel.tsx`
- `src/shared/types/projectSnapshot.ts`
- `src/shared/utils/projectPersistence.ts`

## 단계별 계획

## Phase 1. Pass Chain 상태 정의

### 목표

post pass를 단일 source가 아니라 리스트 구조로 전환한다.

### 작업

- `PostProcessPass` 타입 정의
- `PostProcessChainState` 정의
- 기본 pass 1개 생성
- 기존 `postProcessSource`를 새 구조로 치환

### 완료 기준

- 앱이 pass 목록 상태를 가진다.

## Phase 2. 에디터를 Pass 목록 기반으로 전환

### 목표

사용자가 pass를 직접 관리할 수 있는 편집 UI를 만든다.

### 작업

- `Pass 추가`
- `Pass 삭제`
- `Pass 이름 변경`
- `Pass 순서 이동`
- 선택된 pass source 편집

### 완료 기준

- 사용자가 임의 개수의 pass를 만들고 수정할 수 있다.

## Phase 3. 렌더러의 N-pass 루프 구현

### 목표

scene 이후 N개의 post pass를 순서대로 실행하는 구조를 구현한다.

### 작업

- ping-pong target A/B 생성
- pass index 기반 source/destination 전환
- 마지막 pass는 screen output
- 모든 pass disabled일 때 scene copy 유지

### 완료 기준

- pass 개수와 순서에 따라 결과가 달라진다.

## Phase 4. Diagnostics / Inspector 확장

### 목표

각 pass를 독립적인 편집 단위로 다룰 수 있게 한다.

### 작업

- pass별 compile/link diagnostics
- pass별 marker / console line
- pass별 uniform reflection
- inspector를 pass 단위로 분리

### 완료 기준

- 특정 pass의 오류와 uniform을 독립적으로 확인할 수 있다.

## Phase 5. 저장 / 복원 확장

### 목표

pass chain 전체를 프로젝트 상태에 포함한다.

### 작업

- pass 목록 저장
- 순서 / 이름 / source / enabled 상태 저장
- JSON export/import
- 구버전 snapshot 호환 처리

### 완료 기준

- pass chain 전체가 저장/복원된다.

## Phase 6. 안정화

### 목표

N-pass 구조에서 생기기 쉬운 상태 꼬임과 렌더 타깃 수명주기 문제를 정리한다.

### 작업

- pass별 WebGL state 정리
- target dispose 정리
- resize / recompilation 점검
- pass 개수 변경 직후 안정화

### 완료 기준

- pass 추가/삭제/재정렬 후에도 렌더 결과가 안정적이다.

## 데이터 구조 제안

```ts
interface PostProcessPass {
  id: string
  name: string
  enabled: boolean
  source: string
}

interface PostProcessChainState {
  enabled: boolean
  passes: PostProcessPass[]
}
```

프로젝트 저장 구조 예:

```ts
interface ProjectSnapshot {
  ...
  postProcessEnabled: boolean
  postProcessPasses: PostProcessPass[]
}
```

## 리스크

### 1. pass 수 증가에 따른 진단 / 상태 복잡도 증가

대응:

- 모든 pass에 고유 id를 부여
- diagnostics와 material values도 id 기준으로 분리

### 2. feedback loop

대응:

- 사용자가 source/destination을 직접 선택하지 못하게 하고, 렌더러가 A/B target을 내부에서 자동 선택

### 3. pass 재정렬 후 참조 혼동

대응:

- `uPrevPassColor`는 항상 “직전 활성 pass 결과”만 의미하도록 고정
- 추가 입력 노출은 후속 단계에서 검토

## 최종 권장 결론

현재 프로젝트에서는 아래 순서가 가장 적절하다.

1. pass chain 상태 정의
2. 에디터를 pass 목록 구조로 전환
3. ping-pong A/B 기반 N-pass 루프 구현
4. pass별 diagnostics / inspector 확장
5. 저장 / 복원
6. 안정화

즉 다중 pass는 `사용자 정의 pass 체인`으로 설계해야 하며, 마지막 pass가 final composite를 담당하는 구조를 전제로 개발하는 것이 맞다.
