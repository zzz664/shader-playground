# Post Process 개발 계획 문서

## 목적

현재 셰이더 플레이그라운드에 `scene pass -> post process pass` 구조를 추가한다.

사용자 입장에서는 아래처럼 보이게 하는 것이 목표다.

- `Vertex` 탭
- `Fragment` 탭
- `Post Process` 탭

렌더 순서는 아래와 같다.

```text
Geometry Pass
  사용자 Vertex Shader
  사용자 Fragment Shader
  -> Offscreen Scene Texture

Post Process Pass
  고정 Fullscreen Vertex Shader
  사용자 Post Process Fragment Shader
  -> Default Framebuffer
```

## 범위

### 포함

- offscreen framebuffer 생성
- scene color texture 생성
- depth renderbuffer 생성
- scene pass와 post process pass 분리
- 에디터 3번째 탭 추가
- post process fragment shader 컴파일 / 적용
- post process 전용 기본 uniform
  - `uSceneColor`
  - `uResolution`
  - `uTime`
- 저장/불러오기 반영

### 제외

- post process 체인 여러 개
- ping-pong blur
- depth texture sampling
- MRT
- bloom / SSAO / DOF 같은 복합 효과
- post process용 별도 vertex shader 탭

## 설계 원칙

### 1. scene pass와 post pass를 분리한다

scene pass는 현재 geometry/model 렌더링 책임을 유지한다.
post pass는 fullscreen quad 샘플링만 담당한다.

### 2. post process는 fragment shader 중심으로 시작한다

현재 단계에서는 `Post Process` 탭을 별도 fragment shader 탭으로 두고,
post pass vertex shader는 엔진 고정값으로 둔다.

### 3. framebuffer feedback loop를 피한다

scene color texture는 scene pass의 출력 attachment이자,
post pass의 sampler 입력이다.
같은 패스에서 읽고 쓰지 않는다.

### 4. 현재 인스펙터 구조를 최대한 재사용한다

scene pass uniform과 post pass uniform reflection을 별도로 수행하고,
UI에서는 `Scene`, `Post Process` 그룹으로 노출하는 방향을 우선한다.

## 현재 코드 기준 주요 수정 지점

### 렌더러

- `src/core/renderer/WebGLQuadRenderer.ts`
  - offscreen framebuffer 생성
  - scene color texture 생성
  - depth renderbuffer 생성
  - scene pass / post pass 분기
  - resize 시 target 재생성
  - post shader compile/link 추가

### 셰이더 템플릿

- `src/core/shader/templates/defaultShaders.ts`
  - 기본 post process fragment shader 추가
  - 고정 fullscreen post vertex shader 추가

### 에디터

- `src/features/editor/ShaderEditorPanel.tsx`
  - `Post Process` 탭 추가
- `src/features/editor/CodeMirrorShaderEditor.tsx`
  - 3번째 stage 표시
  - diagnostics stage 확장

### 앱 상태

- `src/App.tsx`
  - `postProcessSource` 상태 추가
  - post compile 요청/결과 반영
  - 저장/불러오기 상태 확장

### 저장 구조

- `src/shared/types/projectSnapshot.ts`
  - post process source 추가
  - post process material values 추가 여부 검토

## 단계별 계획

## Phase 1. 렌더 타깃 기반 구조 도입

### 목표

scene pass 결과를 기본 framebuffer가 아니라 offscreen framebuffer에 먼저 그리도록 바꾼다.

### 작업

- scene framebuffer 생성
- color texture attachment 생성
- depth renderbuffer attachment 생성
- framebuffer completeness 검사
- resize 시 offscreen target 재생성

### 완료 기준

- 현재 scene 렌더 결과가 offscreen texture에 정상 기록된다.
- 화면은 아직 post pass 없이 비어 있거나 임시 복사 단계여도 된다.

## Phase 2. post pass 기본 렌더 경로 추가

### 목표

offscreen scene texture를 읽어서 fullscreen quad로 화면에 출력한다.

### 작업

- 고정 fullscreen post vertex shader 추가
- 기본 post fragment shader 추가
- post process program 생성
- `uSceneColor`, `uResolution`, `uTime` 주입

### 완료 기준

- post process를 비활성화하지 않아도 현재 화면과 동일한 결과가 보인다.

## Phase 3. 에디터 3번째 탭 추가

### 목표

사용자가 post process fragment shader를 편집할 수 있게 한다.

### 작업

- `Vertex / Fragment / Post Process` 3탭 구조
- CodeMirror stage 확장
- 자동완성, 하이라이트, diagnostics stage 분리

### 완료 기준

- Post Process 탭에서 코드를 수정하고 컴파일할 수 있다.

## Phase 4. post process 컴파일/진단/오류 출력

### 목표

scene shader와 post shader의 진단을 분리해서 표시한다.

### 작업

- post shader compile/link 결과 추가
- 콘솔 라인에 `post` stage 추가
- 에디터 marker 연동

### 완료 기준

- post shader 오류가 별도 위치와 stage 정보로 표시된다.

## Phase 5. post uniform reflection / inspector

### 목표

post process shader의 사용자 uniform도 인스펙터로 제어할 수 있게 한다.

### 작업

- post shader active uniform reflection
- 엔진 예약 uniform 제외
- `Scene`, `Post Process` 그룹 분리

### 완료 기준

- post process shader uniform이 인스펙터에 노출된다.

## Phase 6. 저장/불러오기 반영

### 목표

post process 설정과 셰이더 코드를 프로젝트 저장 구조에 포함한다.

### 작업

- project snapshot 스키마 확장
- local save/load 반영
- JSON export/import 반영

### 완료 기준

- post process 탭 코드와 상태가 저장/복원된다.

## Phase 7. 안정화

### 목표

scene/post pass 상태 충돌을 줄이고 렌더러 구조를 정리한다.

### 작업

- pass별 WebGL state 복원 정리
- framebuffer 리소스 dispose 정리
- post process on/off 전환 안정화

### 완료 기준

- resize, recompilation, asset change 상황에서도 post pass가 안정적으로 유지된다.

## 데이터 구조 제안

```ts
interface PostProcessState {
  enabled: boolean
  source: string
  materialValues: Record<string, MaterialPropertyValue>
}
```

저장 구조에는 아래가 필요하다.

```ts
interface ProjectSnapshot {
  ...
  postProcessSource: string
  postProcessEnabled: boolean
  postProcessMaterialValues?: Record<string, MaterialPropertyValue>
}
```

## 리스크

### 1. scene pass / post pass 상태 오염

- blend
- depth test
- cull face
- viewport 크기

대응:

- 각 pass 진입 직전에 필요한 WebGL 상태를 명시적으로 다시 세팅

### 2. resize 시 framebuffer 불완전 상태

대응:

- color texture / depth renderbuffer를 함께 재생성
- `checkFramebufferStatus()` 결과 확인

### 3. diagnostics 복잡도 증가

대응:

- stage를 `vertex / fragment / post / program`으로 명시적 확장

### 4. reflection 충돌

대응:

- scene pass와 post pass reflection을 분리
- 인스펙터 그룹도 분리

## 권장 구현 순서

1. Phase 1 `sceneFramebuffer`
2. Phase 2 `post pass 기본 출력`
3. Phase 3 `에디터 3번째 탭`
4. Phase 4 `진단/오류 분리`
5. Phase 5 `post inspector`
6. Phase 6 `저장/불러오기`
7. Phase 7 `안정화`

## 완료 판단 기준

아래가 충족되면 1차 완료로 본다.

- scene pass 결과가 offscreen texture를 거쳐 최종 화면에 보인다.
- Post Process 탭에서 코드를 수정하고 바로 결과를 볼 수 있다.
- `uSceneColor` 기반 후처리 효과가 동작한다.
- post shader 오류가 별도 stage로 표시된다.
- 저장/불러오기 시 post process 상태가 복원된다.
