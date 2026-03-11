# Post Process 패스 조사 문서

## 목적

현재 프로젝트에 `vertex -> fragment -> post process` 순서의 렌더 파이프라인을 추가하기 위한 기술 근거를 정리한다.

이번 조사 범위는 아래 3가지다.

- WebGL2에서 검증된 post process 패스 구성 방식
- 현재 프로젝트 에디터에 `3번째 탭`을 추가할 때의 안전한 구조
- 구현 시 반드시 지켜야 할 제약과 주의사항

## 결론 요약

현재 프로젝트에서 가장 안전한 1차 구조는 아래와 같다.

1. 사용자가 작성한 `vertex shader`와 `fragment shader`로 먼저 장면을 오프스크린 `Framebuffer`에 렌더링한다.
2. 그 결과 색상 텍스처를 입력으로 받아, fullscreen quad를 다시 그리면서 `post process fragment shader`를 실행한다.
3. 최종 결과는 기본 framebuffer, 즉 화면으로 출력한다.

즉 구조는 아래와 같다.

```text
Geometry Pass
  사용자 Vertex Shader
  사용자 Fragment Shader
  -> Offscreen Color Texture

Post Process Pass
  고정 Fullscreen Vertex Shader
  사용자 Post Process Fragment Shader
  -> Default Framebuffer
```

현재 단계에서는 `post process` 탭을 **fragment 성격의 후처리 셰이더 탭**으로 설계하는 것이 가장 보수적이다.
이유는 fullscreen post pass에서 별도 사용자 vertex 조작까지 열어버리면 에디터, reflection, 오류 처리, 텍스처 입력 규칙이 한 번에 복잡해지기 때문이다.

## 공식 자료 근거

### 1. WebGL framebuffer는 렌더 타깃을 기본 화면 외부로 바꾸는 용도다

MDN의 `framebufferTexture2D()` 문서는 텍스처를 `WebGLFramebuffer`에 부착할 수 있다고 설명한다.
이 방식이 바로 scene color를 텍스처로 받은 뒤 후처리 패스에서 다시 샘플링하는 기본 구조다.

출처:
- MDN `framebufferTexture2D()`
  - https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/framebufferTexture2D
- Khronos WebGL 2.0 Specification
  - https://registry.khronos.org/webgl/specs/latest/2.0/

핵심 해석:

- 장면 1차 렌더 결과를 화면이 아니라 색상 텍스처로 보낼 수 있다.
- 그 텍스처를 다음 패스의 sampler 입력으로 사용할 수 있다.

### 2. WebGL2에서는 render-to-texture에 필요한 framebuffer 기능이 기본 제공된다

Khronos WebGL 2.0 스펙은 `DRAW_FRAMEBUFFER`, `READ_FRAMEBUFFER`, attachment 규칙, NPOT 텍스처 관련 제약 완화를 명시한다.

출처:
- Khronos WebGL 2.0 Specification
  - https://registry.khronos.org/webgl/specs/latest/2.0/

핵심 해석:

- WebGL2에서는 post process용 color texture를 NPOT 크기로 운용하기가 WebGL1보다 훨씬 단순하다.
- 즉 현재 프로젝트의 viewport 크기 그대로 offscreen color texture를 만드는 방식이 적합하다.

### 3. fragment shader의 출력은 framebuffer로 간다

OpenGL ES Shading Language 문서는 fragment processor의 결과가 framebuffer memory 또는 texture memory를 갱신한다고 설명한다.
즉 1차 fragment shader가 곧바로 화면으로 가는 것이 아니라, 현재 바인딩된 framebuffer가 어디냐에 따라 출력 위치가 달라진다.

출처:
- Khronos GLSL ES Specification
  - https://registry.khronos.org/OpenGL/specs/es/3.2/GLSL_ES_Specification_3.20.html

핵심 해석:

- 1차 pass에서 offscreen framebuffer를 바인딩하면 fragment 결과는 색상 텍스처에 기록된다.
- 2차 pass에서 기본 framebuffer를 바인딩하면 post process 결과가 최종 화면에 기록된다.

### 4. 같은 텍스처를 동시에 읽고 쓰면 안 된다

Khronos OpenGL Wiki의 framebuffer 문서는, framebuffer에 붙은 이미지를 동시에 sampler로 읽으면 undefined behavior라고 명시한다.

출처:
- Khronos OpenGL Wiki `Framebuffer Object`
  - https://wikis.khronos.org/opengl/Framebuffer_Object

핵심 해석:

- post process에서 가장 중요한 제약은 `현재 쓰고 있는 텍스처를 동시에 샘플링하지 않는 것`이다.
- 따라서 scene color texture를 출력 attachment로 붙인 상태에서 그 scene color texture를 같은 pass에서 읽으면 안 된다.
- 현재 프로젝트에서는 `Scene FBO -> Default Framebuffer` 2패스 구조로 시작하면 이 문제를 피하기 쉽다.

### 5. depth/stencil은 texture가 아니라 renderbuffer로 두는 것이 안전한 경우가 많다

MDN `framebufferRenderbuffer()` 문서와 Khronos Renderbuffer 설명은 renderbuffer가 framebuffer attachment로 사용된다고 설명한다.

출처:
- MDN `framebufferRenderbuffer()`
  - https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/framebufferRenderbuffer
- Khronos OpenGL Wiki `Renderbuffer Object`
  - https://www.khronos.org/opengl/wiki/Renderbuffer_Object

핵심 해석:

- 1차 장면 렌더에서 depth test가 필요하면 depth attachment가 필요하다.
- depth 값을 후처리에서 읽지 않을 계획이면, color는 texture, depth는 renderbuffer로 두는 구성이 가장 단순하다.

## 현재 프로젝트에 적합한 설계

## 1. 패스 구조

현재 프로젝트 기준 1차 설계는 아래가 적절하다.

### Pass 1. Scene Pass

- 입력:
  - 사용자 vertex shader
  - 사용자 fragment shader
  - geometry / FBX 모델 / 텍스처 / uniform
- 출력:
  - `sceneColorTexture`
  - 필요시 `depthRenderbuffer`

### Pass 2. Post Process Pass

- 입력:
  - `sceneColorTexture`
  - viewport 해상도
  - 시간
- 셰이더:
  - 고정 fullscreen vertex shader
  - 사용자 post process fragment shader
- 출력:
  - 기본 framebuffer

이 구조는 현재 프로젝트의 fullscreen quad 렌더 경험과 가장 자연스럽게 이어진다.

## 2. 에디터 3번째 탭 구조

현재 에디터는 `vertex`, `fragment` 두 탭이다.
여기에 `post process` 탭을 추가할 때는 아래 구조가 가장 안전하다.

### 권장 구조

- `Vertex`
- `Fragment`
- `Post Process`

여기서 `Post Process`는 **후처리 fragment shader 탭**으로 본다.

즉 내부적으로는 아래처럼 운용한다.

```text
Vertex 탭      -> Geometry Pass vertex shader
Fragment 탭    -> Geometry Pass fragment shader
Post Process 탭 -> Post Pass fragment shader
```

그리고 post pass의 vertex shader는 내부 고정값으로 둔다.

예시:

```glsl
#version 300 es
precision highp float;

layout(location = 0) in vec2 aPosition;
out vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
```

이렇게 해야 하는 이유:

- 후처리의 핵심은 화면 전체 샘플링이지, 기하 구조 변형이 아니다.
- editor/compile/diagnostics 구조를 최소 변경으로 확장할 수 있다.
- 이후 필요하면 `고급 모드`로 post vertex를 따로 열 수 있다.

## 3. post process 탭에 기본 제공할 입력

후처리 shader에는 아래 내장 입력을 제공하는 것이 적절하다.

- `uniform sampler2D uSceneColor;`
- `uniform vec2 uResolution;`
- `uniform float uTime;`

선택적으로 나중에 추가 가능한 입력:

- `uniform sampler2D uSceneDepth;`
- `uniform vec2 uInvResolution;`

1차 범위에서는 `uSceneColor`, `uResolution`, `uTime`이면 충분하다.

## 4. reflection / inspector와의 관계

post process 탭도 결국 GLSL uniform을 쓰므로, 현재 인스펙터 시스템을 그대로 재사용할 수 있다.
다만 구분이 필요하다.

### 구분 원칙

- scene pass 전용 uniform
- post pass 전용 uniform
- 엔진 예약 uniform

가장 안전한 1차 구조는 아래다.

- scene pass uniform reflection은 현재 방식 유지
- post pass uniform reflection을 별도로 수행
- 인스펙터는 `Scene`, `Post Process` 두 그룹으로 나눠 표시

즉 uniform namespace를 섞지 말아야 한다.

## 5. framebuffer 자원 구조

현재 프로젝트에서 필요한 최소 자원은 아래다.

- `sceneFramebuffer`
- `sceneColorTexture`
- `sceneDepthRenderbuffer`

resize 시에는 아래가 필요하다.

1. 기존 color texture 해제
2. 기존 depth renderbuffer 해제
3. viewport 크기에 맞춰 재생성
4. framebuffer completeness 재검사

여기서 반드시 `checkFramebufferStatus()`를 통해 framebuffer 완전성을 확인해야 한다.

근거:
- WebGL / MDN framebuffer 관련 문서
- Khronos WebGL spec의 framebuffer completeness 규칙

## 6. 렌더 순서

렌더 순서는 아래가 맞다.

### 장면 렌더 단계

1. `bindFramebuffer(sceneFramebuffer)`
2. viewport를 offscreen 크기로 설정
3. color/depth clear
4. 사용자 vertex/fragment shader로 모델 또는 quad 렌더

### 후처리 렌더 단계

1. `bindFramebuffer(null)`
2. viewport를 화면 크기로 설정
3. fullscreen quad 렌더
4. post process shader에서 `uSceneColor` 샘플링

## 7. 구현 시 주의사항

### 7.1 feedback loop 금지

같은 텍스처를 현재 framebuffer attachment로 쓰면서 동시에 sampler로 읽으면 안 된다.

안전한 규칙:

- scene pass에서는 `sceneColorTexture`에 쓴다
- post pass에서는 `sceneColorTexture`를 읽고, 화면에 쓴다

### 7.2 depth 처리

scene pass에는 depth test가 필요하다.
post process pass는 일반적으로 fullscreen quad만 그리므로 depth test가 필요 없다.

권장:

- scene pass: `DEPTH_TEST` on
- post pass: `DEPTH_TEST` off

### 7.3 blend 상태 분리

scene pass에서 쓰는 blend 상태와 post pass에서 쓰는 blend 상태는 분리해야 한다.
post pass에서는 대부분 불투명 fullscreen quad이므로, 기본은 아래가 적합하다.

- `BLEND` off
- `depthMask(false)` 또는 depth 자체 비활성화

### 7.4 resize 대응

viewport 크기가 바뀌면 scene color texture와 depth renderbuffer를 다시 만들어야 한다.
현재 프로젝트는 resize가 이미 있으므로, renderer 내부에 offscreen target 재생성 단계를 추가하면 된다.

### 7.5 프로젝트 저장/불러오기

JSON 저장에는 아래가 추가돼야 한다.

- post process shader source
- post pass material values
- post pass 사용 여부

반면 framebuffer나 GPU texture 객체 자체는 저장 대상이 아니다.
이들은 복원 시 다시 생성해야 한다.

## 현재 프로젝트 기준 권장 MVP 범위

가장 작은 범위의 MVP는 아래다.

### 포함

- editor 3번째 탭 `Post Process`
- post process fragment shader 편집
- scene framebuffer 1개
- color texture 1개
- depth renderbuffer 1개
- fullscreen quad post pass
- 내장 uniform
  - `uSceneColor`
  - `uResolution`
  - `uTime`

### 제외

- 다중 post chain
- ping-pong blur
- depth texture sampling
- MRT
- bloom / SSAO / DOF 같은 복합 효과

이렇게 해야 현재 구조를 과도하게 흔들지 않는다.

## 권장 기본 셰이더 예시

post process 기본 예시는 아래 수준이 적절하다.

```glsl
#version 300 es
precision highp float;

in vec2 vUv;

uniform sampler2D uSceneColor;
uniform float uTime;

out vec4 outColor;

void main() {
  vec2 uv = vUv;
  uv.x += sin(uv.y * 12.0 + uTime * 2.0) * 0.01;
  vec4 color = texture(uSceneColor, uv);
  outColor = color;
}
```

이 예시는 후처리가 실제로 `sceneColorTexture`를 읽는지 바로 검증할 수 있다.

## 현재 코드베이스에 필요한 수정 지점

예상 수정 지점은 아래다.

- `src/features/editor/ShaderEditorPanel.tsx`
  - 3번째 탭 추가
- `src/App.tsx`
  - post shader source 상태 추가
  - post diagnostics / post material values 분리
  - 저장 스키마 확장
- `src/core/renderer/WebGLQuadRenderer.ts`
  - offscreen framebuffer 생성
  - scene pass / post pass 분리
  - resize 시 target 재생성
- `src/core/shader/templates/defaultShaders.ts`
  - 기본 post process shader 템플릿 추가
- `src/shared/types/projectSnapshot.ts`
  - post shader source 저장 구조 추가
- `src/shared/types/materialProperty.ts`
  - scene/post property 그룹 분리 필요 여부 검토

## 단계별 권장 구현 순서

1. `sceneFramebuffer + sceneColorTexture + depthRenderbuffer` 추가
2. 기존 scene 렌더를 offscreen으로 이동
3. 고정 fullscreen vertex + 기본 post fragment pass 추가
4. 에디터에 `Post Process` 탭 추가
5. post shader compile / diagnostics 경로 추가
6. post pass uniform reflection / inspector 분리
7. 저장/불러오기 반영

## 현재 판단

현재 프로젝트에서는 `3번째 탭 = post process fragment shader` 구조가 가장 적절하다.

이유:

- WebGL2 FBO 기반 render-to-texture는 공식 스펙과 MDN 문서로 충분히 검증된다.
- 현재 fullscreen quad 렌더 구조를 재사용할 수 있다.
- 에디터, 컴파일, 인스펙터, 저장 시스템을 가장 작은 범위로 확장할 수 있다.

반대로 지금 단계에서 아래를 같이 넣는 것은 과하다.

- post process용 사용자 vertex shader 별도 탭
- 다중 체인 post processing
- MRT / G-buffer
- depth texture 기반 고급 효과

## 참고 자료

- MDN `framebufferTexture2D()`
  - https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/framebufferTexture2D
- MDN `framebufferRenderbuffer()`
  - https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/framebufferRenderbuffer
- MDN `WEBGL_draw_buffers`
  - https://developer.mozilla.org/en-US/docs/Web/API/WEBGL_draw_buffers
- Khronos WebGL 2.0 Specification
  - https://registry.khronos.org/webgl/specs/latest/2.0/
- Khronos WebGL 1.0 Specification
  - https://registry.khronos.org/webgl/specs/latest/1.0/
- Khronos GLSL ES Specification
  - https://registry.khronos.org/OpenGL/specs/es/3.2/GLSL_ES_Specification_3.20.html
- Khronos OpenGL Wiki `Framebuffer Object`
  - https://wikis.khronos.org/opengl/Framebuffer_Object
- Khronos OpenGL Wiki `Renderbuffer Object`
  - https://www.khronos.org/opengl/wiki/Renderbuffer_Object
