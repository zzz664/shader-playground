# Post Process 사용자 정의 N-Pass Chain 조사 문서

## 목적

현재 프로젝트의 단일 `Post Process` 구조를, **사용자가 직접 pass를 추가하고 수정할 수 있는 N-pass chain 구조**로 확장하기 위한 기술 근거를 정리한다.

이번 조사 범위는 아래 4가지다.

- WebGL2에서 다중 pass chain을 구성하는 공식 근거
- 사용자 정의 `N-pass` 구조가 기술적으로 가능한 이유
- 현재 프로젝트에 맞는 가장 보수적인 N-pass MVP 구조
- 구현 시 반드시 지켜야 할 framebuffer / state / feedback loop 제약

## 결론 요약

사용자가 원하는 다중 pass는 아래 구조여야 한다.

- pass 개수는 고정이 아니라 `N개`
- 사용자가 pass를 추가 / 삭제 / 재정렬 가능
- 각 pass는 자신의 fragment shader source를 가짐
- 각 pass는 이전 pass의 결과 texture를 입력으로 받음
- 마지막 pass `N`이 최종 출력, 즉 final composite 역할을 수행

즉 구조는 아래처럼 정의하는 것이 맞다.

```text
Scene Pass
  사용자 Vertex Shader
  사용자 Fragment Shader
  -> Scene Color Texture

Post Pass 1
  고정 Fullscreen Vertex Shader
  사용자 Pass 1 Fragment Shader
  입력:
    - uSceneColor
  -> Ping Texture A

Post Pass 2
  고정 Fullscreen Vertex Shader
  사용자 Pass 2 Fragment Shader
  입력:
    - uSceneColor
    - uPrevPassColor
  -> Ping Texture B

Post Pass 3
  고정 Fullscreen Vertex Shader
  사용자 Pass 3 Fragment Shader
  입력:
    - uSceneColor
    - uPrevPassColor
  -> Ping Texture A

...

Post Pass N
  고정 Fullscreen Vertex Shader
  사용자 Pass N Fragment Shader
  입력:
    - uSceneColor
    - uPrevPassColor
  -> Default Framebuffer
```

핵심은:

1. scene 결과를 texture로 먼저 저장해야 한다.
2. post pass는 ping-pong target을 번갈아 쓰며 연결한다.
3. 마지막 pass만 화면으로 출력한다.

## 공식 자료 근거

### 1. framebuffer에 texture를 붙여 offscreen 렌더링을 구성할 수 있다

MDN의 `framebufferTexture2D()` 문서는 texture를 framebuffer attachment로 연결할 수 있다고 설명한다.
이것이 다중 pass chain의 기본 전제다.

출처:
- MDN `framebufferTexture2D()`
  - https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/framebufferTexture2D
- Khronos WebGL 2.0 Specification
  - https://registry.khronos.org/webgl/specs/latest/2.0/

현재 프로젝트 해석:

- scene 결과를 바로 화면에 그리지 않고 `sceneColorTexture`로 받아야 한다.
- 각 post pass는 이전 결과 texture를 읽고, 다음 target texture에 기록한다.

### 2. fragment shader 출력은 현재 bound된 framebuffer의 color attachment로 간다

GLSL ES 명세는 fragment shader의 출력이 현재 API 상태에 따라 framebuffer memory 또는 texture memory를 갱신한다고 설명한다.

출처:
- Khronos GLSL ES Specification
  - https://registry.khronos.org/OpenGL/specs/es/3.2/GLSL_ES_Specification_3.20.html

현재 프로젝트 해석:

- 같은 fragment shader라도 어떤 framebuffer가 bind되어 있느냐에 따라,
  - 중간 target에 쓸 수도 있고
  - 최종 화면에 쓸 수도 있다.
- 따라서 `pass N이 final composite`가 되는 구조는 기술적으로 자연스럽다.

### 3. 같은 texture를 읽으면서 동시에 쓰면 안 된다

Khronos OpenGL Wiki의 `Framebuffer Object` 문서는 framebuffer attachment로 쓰는 image를 같은 pass에서 sampler로 읽는 것이 undefined behavior라고 설명한다.

출처:
- Khronos OpenGL Wiki `Framebuffer Object`
  - https://wikis.khronos.org/opengl/Framebuffer_Object

현재 프로젝트 해석:

- 같은 pass에서 `source texture == destination texture`가 되면 안 된다.
- 그래서 `ping texture A / ping texture B`를 번갈아 쓰는 ping-pong 구조가 필요하다.
- 즉 N-pass chain의 핵심 구현 포인트는 `A -> B -> A -> B ...` 전환이다.

### 4. WebGL2의 drawBuffers는 여러 color attachment에 동시에 쓸 수 있다

MDN의 `WebGL2RenderingContext.drawBuffers()` 문서는 현재 framebuffer의 여러 color attachment에 fragment color를 기록할 수 있다고 설명한다.

출처:
- MDN `WebGL2RenderingContext.drawBuffers()`
  - https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/drawBuffers
- Khronos WebGL 2.0 Specification
  - https://registry.khronos.org/webgl/specs/latest/2.0/

현재 프로젝트 해석:

- 사용자 정의 N-pass MVP의 필수 요소는 아니다.
- 다만 이후 최적화 단계에서 특정 pass가 여러 출력을 동시에 만들고 싶을 때 검토할 수 있다.
- 초기 구현은 단일 color attachment 기반 chain이 더 단순하다.

### 5. depth/stencil이 필요 없는 post pass는 depth attachment가 필수는 아니다

MDN의 `framebufferRenderbuffer()` 문서와 framebuffer 개념 문서 기준으로, depth attachment는 depth test가 필요한 pass에만 의미가 있다.

출처:
- MDN `framebufferRenderbuffer()`
  - https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/framebufferRenderbuffer
- MDN `WebGLFramebuffer`
  - https://developer.mozilla.org/en-US/docs/Web/API/WebGLFramebuffer

현재 프로젝트 해석:

- scene pass만 depth가 필요하다.
- post pass chain은 fullscreen quad이므로 보통 depth test, depth attachment가 불필요하다.
- 따라서 intermediate pass target은 color texture만 있어도 충분한 경우가 많다.

## 왜 사용자 정의 N-pass chain이어야 하는가

사용자가 수정할 수 없는 고정 pass 여러 개는 “내부 최적화 구조”일 수는 있어도, 일반적인 다중 pass 편집 시스템은 아니다.

사용자 정의 N-pass chain이 되어야 하는 이유:

- 사용자가 원하는 효과를 단계별로 나눠 설계할 수 있다.
- pass 순서를 바꾸면 결과도 달라지므로, 순서 제어 자체가 기능이다.
- 마지막 pass에서만 최종 composite를 수행하는 것이 일반적이다.
- 중간 pass는 마스크, 노이즈, 블러, 왜곡, edge, LUT 입력 등 다양한 용도로 재사용 가능하다.

즉 다중 pass의 핵심은 “많은 효과를 한 번에 계산”이 아니라, **“중간 결과를 저장하고 다음 단계에서 다시 쓰는 체인 구조를 사용자에게 열어주는 것”**이다.

## 현재 프로젝트에 맞는 N-pass MVP 구조

현재 에디터 구조:

- `Vertex`
- `Fragment`
- `Post Process`

이를 사용자 정의 N-pass chain으로 확장하려면 아래 구조가 적절하다.

### Scene 탭

- `Vertex`
- `Fragment`

### Post Chain 탭들

- `Pass 1`
- `Pass 2`
- `Pass 3`
- ...
- `Pass N`

즉 `Post Process` 단일 탭을 유지하는 것이 아니라, post 영역 자체가 pass 목록이 된다.

현재 프로젝트에 맞는 최소 MVP:

- scene shader 2개는 그대로 유지
- post pass는 처음에 1개 기본 생성
- 사용자가 `Pass 추가` 버튼으로 늘릴 수 있음
- 사용자가 pass 순서를 이동할 수 있음
- 사용자가 pass를 삭제할 수 있음
- 마지막 pass는 자동으로 screen output

## 권장 uniform 설계

각 post pass에서 최소로 필요한 입력은 아래와 같다.

- `uniform sampler2D uSceneColor;`
- `uniform sampler2D uPrevPassColor;`
- `uniform vec2 uResolution;`
- `uniform float uTime;`

선택적으로 추가 가능한 입력:

- `uniform int uPassIndex;`
- `uniform sampler2D uPass1Color;`
- `uniform sampler2D uPass2Color;`

하지만 1차 MVP에서는 `uSceneColor`와 `uPrevPassColor`만 제공하는 편이 보수적이다.

이유:

- 구조가 단순하다.
- chain semantics가 명확하다.
- 각 pass는 “scene 원본 + 직전 결과”만 알면 된다.

## 렌더 타깃 구조 권장안

### scene target

- `sceneRenderTarget`

### post chain용 ping-pong target

- `postRenderTargetA`
- `postRenderTargetB`

이 두 개면 N-pass를 모두 처리할 수 있다.

예:

- pass 1: scene -> A
- pass 2: A -> B
- pass 3: B -> A
- pass 4: A -> B
- ...
- final pass: 마지막 결과 -> screen

즉 pass 개수가 `N`이어도 render target은 scene + ping-pong A/B만으로 충분하다.

## 현재 코드 기준 수정 대상

### 렌더러

- `src/core/renderer/WebGLQuadRenderer.ts`
  - post pass 목록 상태
  - post pass별 program 관리
  - ping-pong target A/B 관리
  - pass 순서 렌더 루프 추가

### 셰이더 템플릿

- `src/core/shader/templates/defaultShaders.ts`
  - 기본 post pass fragment shader 템플릿
  - 고정 fullscreen vertex shader

### 에디터

- `src/features/editor/ShaderEditorPanel.tsx`
- `src/features/editor/CodeMirrorShaderEditor.tsx`
  - pass 목록 기반 탭 구조
  - pass 추가 / 삭제 / 선택

### 상태 / 저장

- `src/App.tsx`
- `src/shared/types/projectSnapshot.ts`
- `src/shared/utils/projectPersistence.ts`
  - pass 목록 저장 / 복원

### 인스펙터 / 진단

- `src/shared/types/materialProperty.ts`
- `src/shared/types/renderDiagnostics.ts`
- `src/shared/utils/parseDiagnostics.ts`
- `src/features/inspector/MaterialInspectorPanel.tsx`
- `src/features/console/ShaderConsolePanel.tsx`

## 단계별 구현 권장안

### Phase 1. Post Pass Chain 상태 정의

- `PostProcessPass` 타입 정의
- `PostProcessChainState` 정의
- 기본 pass 1개 생성

### Phase 2. 에디터를 pass 목록 구조로 전환

- `Pass 추가`
- `Pass 삭제`
- `Pass 이름 변경`
- `Pass 순서 이동`

### Phase 3. 렌더러의 N-pass 루프 구현

- scene -> ping-pong -> screen
- 마지막 pass만 기본 framebuffer 출력

### Phase 4. 진단 / 인스펙터 확장

- pass별 compile/link diagnostics
- pass별 uniform reflection

### Phase 5. 저장 / 복원

- pass 목록 전체 직렬화
- 순서 / 이름 / source / enabled 상태 복원

## 리스크

### 1. pass 수가 늘수록 관리 복잡도 증가

대응:

- 1차는 `scene + post passes`만 허용
- 각 pass는 fragment shader만 사용자 편집

### 2. feedback loop 실수

대응:

- 렌더러가 source/destination target을 내부에서 강제로 분리

### 3. diagnostics / inspector가 pass 수만큼 복잡해짐

대응:

- pass별 id를 두고, 진단과 property를 그 id 기준으로 분리

## 현재 프로젝트에 대한 최종 권장 결론

현재 프로젝트에서는 아래 방향이 가장 적절하다.

1. 다중 pass는 사용자 정의 `N-pass chain`으로 설계한다.
2. post 탭은 하나가 아니라 pass 목록 구조로 바뀌어야 한다.
3. 각 pass는 fragment shader만 사용자 편집 대상으로 두고, fullscreen vertex는 고정한다.
4. 마지막 pass가 final composite를 수행하도록 한다.
5. 렌더러는 scene + ping-pong A/B 구조로 N-pass를 실행한다.

## 참고 자료

- MDN `framebufferTexture2D()`
  - https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/framebufferTexture2D
- MDN `framebufferRenderbuffer()`
  - https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/framebufferRenderbuffer
- MDN `WebGLFramebuffer`
  - https://developer.mozilla.org/en-US/docs/Web/API/WebGLFramebuffer
- MDN `WebGL2RenderingContext.drawBuffers()`
  - https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/drawBuffers
- Khronos WebGL 2.0 Specification
  - https://registry.khronos.org/webgl/specs/latest/2.0/
- Khronos GLSL ES Specification
  - https://registry.khronos.org/OpenGL/specs/es/3.2/GLSL_ES_Specification_3.20.html
- Khronos OpenGL Wiki `Framebuffer Object`
  - https://wikis.khronos.org/opengl/Framebuffer_Object
