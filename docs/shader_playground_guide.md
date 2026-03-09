# 셰이더 플레이그라운드 구현 설계 문서

## 1. 문서 목적

이 문서는 **웹 기반 셰이더 플레이그라운드**를 구현하기 위해 필요한 구성요소, 권장 아키텍처, 단계별 개발 범위를 정리한 개발 문서다.
문서의 기준은 다음과 같다.

- 브라우저에서 셰이더 코드를 작성하고 즉시 결과를 확인할 수 있어야 한다.
- 사용자가 **임의의 모델을 업로드**하고 그 모델에 셰이더를 적용해 볼 수 있어야 한다.
- 사용자가 **노이즈, 마스크, LUT, 보조 합성 텍스처** 등 임의의 텍스처를 입력할 수 있어야 한다.
- 사용자가 셰이더 코드 안에서 선언한 입력 변수들을 기반으로 **머티리얼 인스펙터형 UI**를 자동 생성해야 한다.
- WebGPU를 우선 지원하고, WebGPU가 불가능한 환경에서는 WebGL2를 폴백으로 고려한다.
- 구현 판단은 가능한 한 공식 문서의 제약과 동작 방식에 맞춘다.

이 문서가 목표로 하는 제품 이미지는 단순한 “풀스크린 프래그먼트 셰이더 실행기”가 아니라, 다음 성격을 함께 가진 도구다.

- 코드 기반 셰이더 편집기
- 모델 미리보기 뷰어
- 머티리얼 인스펙터
- 리소스 슬롯 연결기
- 셰이더 실험용 플레이그라운드

---

## 2. 핵심 결론 요약

### 2.1 제품 방향

권장 제품 방향은 다음과 같다.

1. **1차 목표는 WebGL2 기반 MVP**
2. **2차 목표로 WebGPU 백엔드 추가**
3. 셰이더 작성 방식은 초기에는 **GLSL 중심**으로 시작
4. 이후 필요 시 WGSL 전용 모드 추가

이유는 다음과 같다.

- WebGPU는 장기적으로 더 좋은 방향이지만, 사용자가 작성한 셰이더 변수 목록을 기반으로 UI를 자동 생성하는 작업은 **WebGL2의 uniform reflection** 쪽이 초기 MVP에 더 유리하다.
- WebGL2는 `getActiveUniform()` 등으로 활성 uniform 정보를 조회할 수 있어서, **머티리얼 인스펙터 자동 생성**이 비교적 단순하다.
- WebGPU는 강력하지만, 바인딩 구조를 애플리케이션이 더 명시적으로 설계해야 하므로 처음부터 완전 자동 인스펙터를 구현하기엔 부담이 더 크다.

### 2.2 모델 포맷 전략

지원 포맷은 다음 순서로 제한하는 것이 좋다.

1. **glTF 2.0 (`.gltf`, `.glb`) 우선 지원**
2. `.obj` 는 선택적 2차 지원
3. 그 외 포맷은 후순위

핵심 이유:

- glTF는 런타임 전달용 3D 포맷으로 웹 런타임과 궁합이 좋다.
- `.glb` 는 단일 파일이라 업로드 UX가 좋다.
- 플레이그라운드는 DCC 툴이 아니므로 “모든 모델 포맷 지원”보다 “일관된 테스트 환경 제공”이 중요하다.

### 2.3 셰이더 변수와 UI 연결 전략

가장 중요한 설계 원칙은 다음이다.

> **사용자가 선언한 변수명을 그대로 UI에 노출하고, 타입을 기반으로 입력 UI를 자동 생성한다.**

즉, `NoiseTex`, `MaskTex` 같은 **예약 이름을 강제하지 않는다.**

예를 들어 사용자가 다음처럼 작성했다면:

```glsl
uniform sampler2D myNoise;
uniform sampler2D dissolveMask;
uniform float edgePower;
uniform vec4 edgeColor;
```

UI는 그대로 다음처럼 생성된다.

- `myNoise` → 텍스처 슬롯
- `dissolveMask` → 텍스처 슬롯
- `edgePower` → 숫자 입력 또는 슬라이더
- `edgeColor` → 컬러 입력 또는 vec4 입력

이 방식이 상용 엔진의 **Material Inspector / Exposed Property** 느낌에 가장 가깝다.

### 2.4 예약 이름은 최소화

예약 이름은 **엔진 내장 입력**에만 제한하는 것이 좋다.

예:

- `uTime`
- `uResolution`
- `uMouse`
- `uFrame`
- `uModel`
- `uView`
- `uProj`
- `uCameraPos`

반면 사용자가 정의하는 텍스처와 파라미터는 자유롭게 이름짓도록 두는 편이 맞다.

---

## 3. 구현 목표 범위

### 3.1 MVP 범위

초기 버전에서는 아래 기능을 완성 목표로 잡는 것이 좋다.

- 코드 에디터
- 렌더 뷰포트
- WebGL2 초기화 및 셰이더 컴파일
- 정점/프래그먼트 셰이더 편집
- 컴파일 오류 표시
- 모델 업로드(`.glb` 우선)
- 궤도 카메라(orbit camera)
- 기본 조명
- 활성 uniform 기반 자동 프로퍼티 UI 생성
- 숫자/벡터/불리언/텍스처 입력 지원
- 텍스처 파일 업로드
- 로컬 저장
- 예제 프리셋

### 3.2 2차 확장 범위

- WebGPU 백엔드 추가
- 다중 패스 렌더링
- 렌더 타깃 뷰어
- 히스토리/되돌리기
- 공유 URL 직렬화
- 프로젝트 파일 포맷 정의
- 텍스처 썸네일 및 슬롯 프리뷰
- 환경맵과 큐브맵 지원
- UBO/구조체 단위 프로퍼티 그룹
- 퍼포먼스 HUD

### 3.3 3차 확장 범위

- 셰이더 메타데이터 규약 정교화
- 프로퍼티 그룹/카테고리/표시명/범위/기본값 제어
- 노드 그래프와 유사한 시각적 프로퍼티 패널
- 머티리얼 프리셋 자산화
- 다중 모델 동시 비교
- 커스텀 패스 체인

---

## 4. 제품 개념 정리

### 4.1 이 제품은 무엇인가

이 제품은 완전한 DCC 툴이 아니다.
또한 완전한 노드 기반 셰이더 그래프 편집기도 아니다.

이 제품은 다음 정의에 더 가깝다.

> **코드 기반 셰이더 편집기 + 모델 프리뷰 + 머티리얼 인스펙터 + 리소스 연결 도구**

즉 사용자는 코드를 직접 작성하지만, 그 코드에서 외부 입력으로 노출된 값들은 에디터 UI에서 조작할 수 있어야 한다.

### 4.2 사용자 경험 목표

사용자 경험은 다음 흐름을 지향한다.

1. 예제 셰이더를 연다.
2. 모델을 하나 올린다.
3. 셰이더 컴파일 결과를 본다.
4. 자동 생성된 프로퍼티 패널을 본다.
5. 텍스처 슬롯에 파일을 드래그한다.
6. 슬라이더와 컬러를 조절한다.
7. 결과를 실시간으로 확인한다.
8. 프로젝트를 저장한다.

이 흐름이 자연스럽다면 “상용 엔진의 머티리얼 테스트 감각”에 꽤 근접한다.

---

## 5. 렌더링 백엔드 전략

### 5.1 왜 WebGL2를 MVP 기준으로 두는가

장기적으로는 WebGPU가 더 바람직하지만, MVP 기준으로는 WebGL2가 유리한 이유가 있다.

- GLSL 자료가 풍부하다.
- 기존 셰이더 파일 확장자(`.vert`, `.frag`, `.vsh`, `.fsh`) 사용이 자연스럽다.
- `getActiveUniform()` 를 통해 활성 uniform 정보를 조회할 수 있다.
- 셰이더 변수 기반 자동 UI 생성이 구현하기 쉽다.
- 모델 하나에 커스텀 셰이더를 적용하는 실험은 WebGL2로도 충분하다.

### 5.2 WebGPU의 위치

WebGPU는 다음 조건에서 적합하다.

- 장기적으로 최신 GPU 기능을 더 잘 활용하고 싶을 때
- 고급 렌더링 기능이 필요할 때
- compute 활용까지 고려할 때
- 백엔드 아키텍처를 충분히 분리할 수 있을 때

단, WebGPU는 바인딩 설계가 더 명시적이므로, “코드만 보고 자동 UI를 만든다”는 경험은 WebGL2보다 추가 설계가 더 필요하다.

### 5.3 권장 백엔드 계층 분리

초기부터 아래 계층을 분리하는 것이 좋다.

- `RendererBackend`
- `ShaderCompiler`
- `MaterialPropertyExtractor`
- `ResourceBinder`
- `ViewportController`
- `SceneController`

이렇게 두면 나중에 WebGL2와 WebGPU를 병행해도 상위 UI는 덜 흔들린다.

---

## 6. 공식 문서 기준 핵심 API

### 6.1 캔버스와 컨텍스트

기본 시작점은 `<canvas>` 와 컨텍스트다.

- WebGL2: `canvas.getContext("webgl2")`
- WebGPU: `canvas.getContext("webgpu")`

주의점:

- CSS 크기와 실제 드로잉 버퍼 크기를 분리해야 한다.
- DPR(devicePixelRatio)을 반영해야 한다.
- 리사이즈 시 뷰포트와 렌더 타깃을 함께 갱신해야 한다.

### 6.2 애니메이션 루프

실시간 미리보기를 위해 다음이 필요하다.

- `requestAnimationFrame()`
- 누적 시간
- 델타 타임
- pause / resume
- frame count

### 6.3 크기 변경 감지

분할 UI에서는 `window.resize` 보다 `ResizeObserver` 가 적합하다.

이유:

- 에디터 패널의 스플리터 이동
- 사이드바 토글
- 뷰포트 영역만의 크기 변화

이런 변화는 창 전체 크기와 무관할 수 있기 때문이다.

### 6.4 파일 입력

웹에서는 사용자가 선택하거나 드롭한 파일만 안전하게 접근할 수 있다.

필요 요소:

- `<input type="file">`
- drag & drop
- `File`
- `Blob`
- `URL.createObjectURL()`
- 필요 시 `FileReader` 또는 `createImageBitmap()`

중요한 제약:

- 웹 앱이 임의의 로컬 경로를 직접 스캔하거나 읽는 UX는 불가능하다.
- 따라서 모든 외부 리소스는 **사용자 제공 파일** 기반으로 설계해야 한다.

### 6.5 WebGL 셰이더 컴파일

WebGL2 기준 핵심 흐름:

1. `createShader()`
2. `shaderSource()`
3. `compileShader()`
4. `getShaderParameter(shader, COMPILE_STATUS)`
5. `getShaderInfoLog()`
6. `createProgram()`
7. `attachShader()`
8. `linkProgram()`
9. `getProgramParameter(program, LINK_STATUS)`
10. `getProgramInfoLog()`

### 6.6 활성 uniform 조회

자동 프로퍼티 UI의 핵심은 다음이다.

- `getProgramParameter(program, ACTIVE_UNIFORMS)`
- `getActiveUniform(program, index)`
- `getUniformLocation(program, name)`

이로부터 얻을 수 있는 정보:

- uniform 이름
- uniform 타입
- uniform 배열 크기

이 정보는 타입 기반 UI 자동 생성을 가능하게 한다.

주의점:

- **활성 uniform만 조회된다.**
- 셰이더 최적화로 제거된 uniform은 UI에 나타나지 않을 수 있다.

### 6.7 WebGPU 초기화

WebGPU 쪽 핵심 흐름:

1. `navigator.gpu` 확인
2. `requestAdapter()`
3. `requestDevice()`
4. `canvas.getContext("webgpu")`
5. `configure()`
6. `createShaderModule()`
7. `createRenderPipeline()`

WebGPU에서는 `getCompilationInfo()` 를 통해 컴파일 메시지를 수집해 에디터와 연결할 수 있다.

---

## 7. 셰이더 파일 포맷 및 확장자 정책

### 7.1 `.vert/.frag` 와 `.vsh/.fsh`

핵심 결론:

> **보통 동일한 GLSL 소스를 담는 관례 차이로 보면 된다.**

즉 파일 확장자 자체가 문법을 바꾸지 않는다.
실제로 중요한 것은 애플리케이션이 그 텍스트를 **vertex shader** 로 컴파일할지, **fragment shader** 로 컴파일할지다.

권장 정책:

- 기본 확장자: `.vert`, `.frag`
- 별칭 허용: `.vsh`, `.fsh`
- 내부에서는 파일 확장자가 아니라 **셰이더 단계(stage)** 로 관리

### 7.2 같은 문법이지만 같은 의미는 아니다

두 파일이 모두 GLSL 계열 텍스트여도, shader stage 가 다르면 사용 가능한 입력/출력과 내장 변수는 달라진다.

예:

- vertex shader: 위치 변환, 정점 속성 처리
- fragment shader: 최종 픽셀 색 계산

즉 확장자 관례는 같아도 역할은 다르다.

### 7.3 WebGL2 문법 기준 권장안

가능하면 초기에는 **GLSL ES 3.00** 기준을 강제하는 것이 좋다.

즉:

- `#version 300 es`
- `in`, `out`
- fragment output 명시

장점:

- WebGL2와 일관성 있음
- 구식 `attribute/varying` 혼용 문제를 줄일 수 있음

---

## 8. 사용자 모델 업로드 설계

### 8.1 모델 업로드는 가능한가

가능하다.
단, “모든 포맷 지원”이 아니라 **지원 범위를 제한한 모델 업로드**가 되어야 한다.

### 8.2 지원 포맷 우선순위

권장 순서:

1. `.glb`
2. `.gltf`
3. `.obj`

이유:

- `.glb` 는 단일 파일 업로드 UX가 가장 좋다.
- `.gltf` 는 외부 의존 파일을 가질 수 있어 에러 처리가 더 필요하다.
- `.obj` 는 단순 메시 테스트에는 좋지만 머티리얼/확장성 면에서 제한적이다.

### 8.3 모델 업로드 정책

권장 정책은 다음과 같다.

- 1차 버전은 **원본 머티리얼 재현보다 메시 시각화 우선**
- 업로드한 모델의 기본 재질은 무시하거나 최소한만 반영
- 플레이그라운드 내부의 테스트용 머티리얼 시스템으로 덮어씌움

즉 목적은 “모델 파일 뷰어”가 아니라 “모델에 셰이더 실험을 하는 도구”여야 한다.

### 8.4 모델 처리 파이프라인

모델 업로드 후 내부 파이프라인 예시는 다음과 같다.

1. 파일 선택
2. 포맷 판별
3. 파서 호출
4. 메시 추출
5. 버텍스 속성 정규화
6. 내부 `MeshAsset` 생성
7. bounding box 계산
8. 카메라 자동 프레이밍
9. 테스트 머티리얼 적용
10. 뷰포트 렌더링

### 8.5 내부 메시 표준화가 중요

외부 포맷이 다르더라도 내부 런타임에서는 다음 형태로 표준화하는 것이 좋다.

```ts
interface MeshAsset {
  positions: Float32Array;
  normals?: Float32Array;
  tangents?: Float32Array;
  uvs0?: Float32Array;
  uvs1?: Float32Array;
  colors?: Float32Array;
  indices?: Uint16Array | Uint32Array;
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
}
```

이 표준화가 되어야 셰이더 바인딩 구조와 렌더러를 단순화할 수 있다.

### 8.6 필수 버텍스 속성 정책

최소 정책:

- `position`: 필수
- `normal`: 권장
- `uv`: 권장

`normal` 이 없으면 라이팅 결과가 나빠질 수 있다.
`uv` 가 없으면 텍스처 샘플링 기반 셰이더의 실험 폭이 줄어든다.

### 8.7 모델이 여러 메쉬를 가진 경우

정책을 정해야 한다.

권장안:

- 업로드한 모든 primitive 를 하나의 모델 인스턴스로 유지
- 각 서브메쉬에 동일 머티리얼 적용 가능
- 필요 시 서브메쉬별 토글 제공

### 8.8 자동 프레이밍

업로드 직후 모델이 너무 크거나 작아 보이는 문제를 막기 위해,
AABB 기반 자동 프레이밍을 넣는 것이 좋다.

필요 요소:

- bounds 계산
- 모델 중심 계산
- 카메라 거리 계산
- near/far plane 재조정

---

## 9. 화면 모드 구분

### 9.1 Screen Mode

풀스크린 쿼드/삼각형 기반 셰이더 미리보기 모드.

용도:

- 포스트 프로세스
- 노이즈 실험
- UV 기반 2D 효과
- Shadertoy 유사 워크플로우

### 9.2 Model Mode

업로드된 모델에 셰이더를 적용하는 모드.

용도:

- 디졸브
- 림라이트
- 프레넬
- 흐름 맵
- 마스크 기반 합성
- 표면 셰이더 실험

### 9.3 모드 분리 필요성

Screen Mode 와 Model Mode 는 필요 uniform, 버텍스 입력, 카메라, 라이팅이 다르다.
따라서 내부 구조도 분리하는 것이 좋다.

---

## 10. 머티리얼 인스펙터 설계

### 10.1 가장 중요한 설계 원칙

> **사용자가 셰이더에서 선언한 입력을 그대로 노출하되, UI의 종류는 이름이 아니라 타입으로 결정한다.**

즉 다음은 잘못된 접근이다.

- `NoiseTex` 라는 이름이어야만 텍스처 슬롯을 만든다.
- `Color` 가 들어가야만 색상 UI를 만든다.

이런 방식은 초반엔 쉬워 보여도 금방 한계에 부딪힌다.

### 10.2 올바른 방향

다음 방식이 권장된다.

- `sampler2D` → 텍스처 슬롯
- `float` → 숫자 입력 또는 슬라이더
- `vec2` → 2개 숫자 입력
- `vec3` / `vec4` → 벡터 입력 또는 색상 입력 후보
- `bool` → 체크박스
- `int` → 정수 입력

즉 **이름은 식별자**, **타입은 UI 분류 기준**이다.

### 10.3 예시

사용자 코드:

```glsl
uniform sampler2D myNoise;
uniform sampler2D dissolveMask;
uniform float edgePower;
uniform vec4 edgeColor;
uniform bool useFresnel;
```

자동 생성 UI:

- `myNoise` → texture input
- `dissolveMask` → texture input
- `edgePower` → number / slider
- `edgeColor` → vec4 또는 color input
- `useFresnel` → checkbox

### 10.4 이것이 왜 상용 엔진 느낌에 가까운가

상용 엔진의 머티리얼 시스템은 보통 다음 개념을 가진다.

- 셰이더 코드 또는 그래프 내부의 입력 정의
- 외부에 노출된 프로퍼티 목록
- 머티리얼 인스턴스가 그 프로퍼티에 값/텍스처를 연결

당신이 만들려는 구조도 사실상 이것과 같다.
단지 노드 그래프 대신 코드 기반으로 출발할 뿐이다.

---

## 11. Exposed Property System 설계

### 11.1 개념 정의

플레이그라운드는 셰이더 소스와 별도로 **노출 프로퍼티 모델**을 내부에 가져야 한다.

예시:

```ts
interface ExposedProperty {
  name: string;
  displayName?: string;
  bindingKind: 'uniform' | 'texture' | 'builtin';
  valueType:
    | 'float'
    | 'int'
    | 'bool'
    | 'vec2'
    | 'vec3'
    | 'vec4'
    | 'texture2D'
    | 'textureCube';
  uiKind:
    | 'number'
    | 'slider'
    | 'checkbox'
    | 'vector'
    | 'color'
    | 'texture';
  defaultValue?: unknown;
  runtimeValue?: unknown;
  hidden?: boolean;
  group?: string;
  meta?: Record<string, unknown>;
}
```

### 11.2 생성 절차

1. 셰이더 컴파일/링크
2. 활성 uniform 목록 수집
3. 이름/타입 분석
4. 엔진 내장 변수 제외
5. 타입 기반 기본 UI 생성
6. 메타데이터로 표시 방식 보정
7. 프로퍼티 패널 렌더링

### 11.3 이름을 그대로 써야 하는 이유

사용자가 작성한 이름을 그대로 노출하는 것이 중요한 이유:

- 셰이더 코드와 UI 사이의 대응이 직관적이다.
- 디버깅이 쉽다.
- 상용 엔진의 “노출 프로퍼티” 감각과 맞다.
- 이름 강제 규칙이 적어 자유도가 높다.

### 11.4 표시명은 별도로 둘 수 있다

변수 이름은 내부 바인딩용으로 두고, UI 표시명은 별도로 둘 수 있다.

예:

- 내부 이름: `abc`
- UI 표시명: `Noise Texture`

즉 다음 둘을 분리하는 것이 좋다.

- internal name
- display name

---

## 12. Reflection 기반 자동 UI 생성

### 12.1 WebGL2에서 가능한 방식

WebGL2에서는 프로그램 링크 후 활성 uniform을 조회할 수 있다.
이 방식은 자동 UI 생성의 기반이 된다.

흐름:

1. 프로그램 링크 성공
2. `ACTIVE_UNIFORMS` 개수 조회
3. `getActiveUniform()` 반복 호출
4. 타입 테이블로 UI 종류 결정
5. location 캐시
6. UI 생성
7. UI 변경 시 `uniform*()` 호출

### 12.2 장점

- 셰이더 소스 파서를 강하게 만들 필요가 없다.
- 실제로 GPU 프로그램에 살아남은 입력만 다룰 수 있다.
- generic material inspector 구현에 적합하다.

### 12.3 한계

- **사용되지 않는 uniform은 최적화로 제거될 수 있다.**
- 이름, 타입, 크기만으로는 슬라이더 범위나 색상 여부를 완벽히 알 수 없다.

즉 reflection만으로는 “기본 UI”는 만들 수 있지만, “좋은 UX”를 위해선 추가 메타데이터가 필요하다.

---

## 13. 메타데이터 규약 설계

### 13.1 왜 필요한가

예를 들어 다음 선언만으로는 부족하다.

```glsl
uniform float edgePower;
```

이 정보만으로는 아래를 알 수 없다.

- 슬라이더인지 숫자 입력인지
- 범위가 0~1인지 0~10인지
- 스텝은 0.01인지 1인지
- 표시명이 무엇인지
- 어느 그룹에 들어가는지

### 13.2 권장 방식 1: 주석 기반 규약

예:

```glsl
uniform float edgePower;      // @ui slider @min 0 @max 5 @step 0.01 @label Edge Power
uniform vec4 edgeColor;       // @ui color @label Edge Color
uniform sampler2D myNoise;    // @ui texture @label Noise Texture
uniform bool useFresnel;      // @ui checkbox @label Use Fresnel
```

장점:

- 코드 한 곳에서 읽을 수 있다.
- 셰이더와 UI 정의가 가까이 있다.

단점:

- 파서가 필요하다.
- 주석 형식을 잘못 쓰면 UX가 흔들릴 수 있다.

### 13.3 권장 방식 2: 별도 JSON 메타데이터

예:

```json
{
  "edgePower": {
    "ui": "slider",
    "min": 0,
    "max": 5,
    "step": 0.01,
    "label": "Edge Power"
  },
  "edgeColor": {
    "ui": "color",
    "label": "Edge Color"
  },
  "myNoise": {
    "ui": "texture",
    "label": "Noise Texture"
  }
}
```

장점:

- 엄격하고 구조적이다.
- 파싱 안정성이 높다.
- 저장/내보내기에 유리하다.

단점:

- 코드와 분리되어 관리 포인트가 늘어난다.

### 13.4 권장 결론

가장 현실적인 조합은 다음이다.

- **1차 MVP**: reflection 기반 기본 UI 자동 생성
- **2차**: 주석 기반 메타데이터 또는 JSON 메타데이터 추가

---

## 14. 텍스처 슬롯 설계

### 14.1 텍스처 슬롯은 이름이 아니라 타입으로 생성

`sampler2D` 를 발견하면 텍스처 슬롯을 만든다.
이때 변수 이름은 그대로 쓴다.

즉 다음 둘 다 동일하게 지원해야 한다.

```glsl
uniform sampler2D myNoise;
uniform sampler2D dissolveMask;
```

```glsl
uniform sampler2D texA;
uniform sampler2D texB;
```

둘 다 문제없이 UI가 생성되어야 한다.

### 14.2 텍스처 슬롯이 가져야 할 UI 요소

권장 UI:

- 슬롯 이름
- 현재 이미지 썸네일
- 파일 업로드 버튼
- 드래그 앤 드롭 영역
- 제거 버튼
- sRGB / linear 토글(후순위)
- wrap/filter 옵션(후순위)

### 14.3 텍스처 용도는 사용자가 정한다

플레이그라운드는 `sampler2D` 가 노이즈용인지 마스크용인지 합성용인지 강제하지 않는 편이 좋다.

의미는 **사용자와 셰이더 코드가 결정**한다.
UI는 단지 “이 텍스처 입력에 무엇을 연결할 것인가”를 제공하면 된다.

### 14.4 그래도 텍스처 타입 추론은 보조적으로 가능하다

이름이 `color`, `albedo`, `baseColor` 를 포함하면 컬러 텍스처 후보,
`mask`, `noise`, `lut`, `flow` 를 포함하면 특정 용도를 추정할 수 있다.

하지만 이건 어디까지나 **보조 힌트**여야 하고,
핵심 로직이 되면 안 된다.

---

## 15. 숫자/벡터/색상 입력 설계

### 15.1 기본 타입 매핑

권장 기본 매핑:

- `float` → number
- `int` → integer input
- `bool` → checkbox
- `vec2` → 2축 숫자 입력
- `vec3` → 3축 숫자 입력
- `vec4` → 4축 숫자 입력
- `sampler2D` → texture slot

### 15.2 vec3/vec4를 color로 취급할지 여부

reflection만으로는 `vec3`, `vec4` 가 일반 벡터인지 색상인지 확정할 수 없다.
따라서 아래 정책이 필요하다.

권장안:

- 기본은 vector UI
- 메타데이터가 있으면 color UI로 승격
- 또는 사용자가 UI에서 수동 전환 가능

### 15.3 slider와 number의 구분

`float` 는 기본적으로 number input 으로 두되,
메타데이터가 있으면 slider 로 승격하는 편이 좋다.

---

## 16. 엔진 내장 입력과 사용자 입력의 분리

### 16.1 왜 분리해야 하는가

머티리얼 인스펙터가 모든 uniform을 그대로 보여주면,
사용자가 건드리면 안 되는 엔진 내부 값도 같이 노출된다.

예:

- `uTime`
- `uResolution`
- `uMouse`
- `uModel`
- `uView`
- `uProj`

이 값들은 엔진이 자동 공급해야 한다.

### 16.2 권장 내장 uniform 목록

예시:

- `uTime`
- `uDeltaTime`
- `uFrame`
- `uResolution`
- `uMouse`
- `uModel`
- `uView`
- `uProj`
- `uModelViewProj`
- `uCameraPos`

### 16.3 충돌 방지 정책

권장 정책:

- 내장 uniform 이름은 예약
- 사용자 정의 변수와 충돌 시 경고
- UI에는 기본적으로 숨김
- 디버그 모드에서만 표시 가능

---

## 17. Material Instance 개념 도입

### 17.1 왜 필요한가

셰이더 코드와 실제 연결 값은 분리하는 것이 좋다.

즉 다음 개념을 나누어야 한다.

- Shader Source
- Exposed Property Definition
- Material Instance Value

### 17.2 구조 예시

```ts
interface MaterialInstance {
  shaderId: string;
  values: Record<string, unknown>;
  textureBindings: Record<string, string | null>;
}
```

이 구조가 있어야 다음이 쉬워진다.

- 프리셋 저장
- 같은 셰이더에 여러 값 세트 적용
- 모델별 값 비교
- 예제 머티리얼 배포

---

## 18. 프로젝트 저장 포맷 설계

### 18.1 저장해야 하는 것

최소 저장 항목:

- vertex shader source
- fragment shader source
- 메타데이터
- 선택된 렌더 모드(screen/model)
- 모델 참조 정보
- 프로퍼티 값
- 텍스처 바인딩 정보
- 카메라 상태(선택)

### 18.2 권장 프로젝트 구조 예시

```json
{
  "version": 1,
  "backend": "webgl2",
  "mode": "model",
  "vertexShader": "...",
  "fragmentShader": "...",
  "propertyMeta": {
    "edgePower": { "ui": "slider", "min": 0, "max": 5, "step": 0.01 },
    "edgeColor": { "ui": "color" }
  },
  "materialValues": {
    "edgePower": 1.25,
    "edgeColor": [1, 0.5, 0.2, 1],
    "useFresnel": true
  },
  "textureBindings": {
    "myNoise": "asset://textures/noise_01.png",
    "dissolveMask": "asset://textures/mask_01.png"
  }
}
```

### 18.3 저장소 전략

- 간단한 자동저장: `localStorage`
- 프로젝트/자산 관리: `IndexedDB`

텍스처나 모델 바이너리까지 저장하려면 `IndexedDB` 쪽이 더 적합하다.

---

## 19. UI 레이아웃 권장안

### 19.1 기본 3패널 구조

권장 레이아웃:

- 좌측: 코드 에디터
- 중앙: 뷰포트
- 우측: 머티리얼 인스펙터 / 리소스 패널

### 19.2 우측 패널 구성

우측 패널은 아래 섹션으로 나누는 것이 좋다.

1. Scene
2. Model
3. Material Properties
4. Texture Slots
5. Debug / Logs

### 19.3 프로퍼티 패널 UX

권장 UX:

- 이름 그대로 노출
- 타입 아이콘 표시
- 기본값 재설정 버튼
- 변경된 값 강조
- 텍스처 슬롯 썸네일
- 그룹 접기/펼치기

---

## 20. 셰이더 작성 UX 설계

### 20.1 코드와 UI의 연결감이 중요

사용자가 코드를 바꿨을 때 UI도 즉시 바뀌어야 한다.

예:

- uniform 추가 → UI에 항목 생성
- uniform 삭제 → UI에서 항목 제거
- 타입 변경 → UI 형태 변경

### 20.2 재컴파일 타이밍

권장 정책:

- debounce 적용 자동 컴파일
- 수동 Compile 버튼 제공
- 링크 성공 시에만 프로퍼티 재생성

### 20.3 기존 값 유지 정책

uniform 이름이 동일하고 타입도 호환된다면,
재컴파일 후에도 기존 UI 값을 최대한 유지하는 편이 좋다.

예:

- `edgePower` 가 계속 float 이면 값 유지
- `edgeColor` 가 vec4 에서 sampler2D 로 바뀌면 값 폐기

---

## 21. 모델용 렌더링 파이프라인 요구사항

### 21.1 카메라

필수 요소:

- perspective camera
- orbit control
- pan/zoom
- reset view

### 21.2 조명

초기 권장안:

- directional light 1개
- ambient term 1개
- 필요 시 environment lighting 후순위

### 21.3 변환 행렬

모델 모드에서는 최소 다음이 필요하다.

- model matrix
- view matrix
- projection matrix
- normal matrix

### 21.4 테스트용 기본 지오메트리 제공

사용자가 모델을 업로드하지 않아도 테스트할 수 있도록 기본 지오메트리를 제공하는 것이 좋다.

예:

- sphere
- cube
- plane
- torus

---

## 22. 보조 리소스 입력 설계

### 22.1 사용자가 넣고 싶어하는 리소스 종류

예시:

- 노이즈 텍스처
- 마스크 텍스처
- 그라디언트 램프
- flow map
- LUT
- emissive pattern
- dissolve pattern

이것들은 시스템이 미리 타입을 강제할 필요 없이,
모두 “텍스처 입력”의 범주로 다루면 된다.

### 22.2 다중 텍스처 바인딩

여러 개의 `sampler2D` 가 있을 수 있으므로,
텍스처 유닛 할당 테이블을 내부에서 관리해야 한다.

예:

- `myNoise` → unit 0
- `dissolveMask` → unit 1
- `edgeRamp` → unit 2

### 22.3 텍스처 미연결 상태 처리

텍스처가 연결되지 않은 슬롯이 있을 때의 정책도 필요하다.

권장안:

- 기본 1x1 더미 텍스처 바인딩
- 경고 아이콘 표시
- 샘플링은 가능하지만 의미 있는 결과는 아님

이 방식이 런타임 오류를 줄인다.

---

## 23. 구현 단계 제안

### 23.1 1단계

- WebGL2 컨텍스트
- 기본 전체화면 렌더링
- vertex / fragment 에디터
- 컴파일/링크 로그
- 기본 내장 uniform

### 23.2 2단계

- 모델 업로드(`.glb`)
- 카메라
- 기본 조명
- 메시 렌더링
- 공통 테스트 머티리얼 적용

### 23.3 3단계

- `getActiveUniform()` 기반 자동 프로퍼티 UI
- float/int/bool/vec/sampler2D 지원
- 값 변경과 uniform 반영

### 23.4 4단계

- 텍스처 파일 업로드
- 텍스처 슬롯 UI
- 썸네일 표시
- 다중 텍스처 연결

### 23.5 5단계

- 메타데이터 규약
- display name
- slider 범위
- color UI
- 그룹화

### 23.6 6단계

- 프로젝트 저장
- preset
- localStorage / IndexedDB
- import / export

### 23.7 7단계

- WebGPU 백엔드 추가
- WGSL 모드 추가
- 백엔드 추상화 강화

---

## 24. 권장 내부 모듈 구조

```text
src/
  app/
    App.ts
    Layout.ts
  editor/
    ShaderEditor.ts
    CompileController.ts
  renderer/
    RendererBackend.ts
    WebGL2Renderer.ts
    WebGPURenderer.ts
    ShaderProgram.ts
    MaterialBinder.ts
  scene/
    Scene.ts
    Camera.ts
    OrbitController.ts
    LightRig.ts
    MeshAsset.ts
    ModelLoader.ts
  material/
    ExposedProperty.ts
    PropertyExtractor.ts
    PropertyMeta.ts
    MaterialInstance.ts
    BuiltinUniforms.ts
  assets/
    TextureAsset.ts
    TextureLoader.ts
    ProjectStore.ts
  ui/
    ViewportPanel.ts
    PropertyPanel.ts
    TextureSlotView.ts
    LogPanel.ts
  utils/
    math.ts
    file.ts
    debounce.ts
```

---

## 25. 위험 요소와 주의점

### 25.1 reflection만 믿으면 발생하는 문제

- 사용되지 않는 uniform이 보이지 않을 수 있음
- vec4가 color인지 일반 vector인지 모름
- float의 적절한 범위를 모름

따라서 reflection은 **출발점**이고,
완성도 있는 UX를 위해서는 메타데이터 계층이 필요하다.

### 25.2 모델 포맷 범위가 커지면 급격히 복잡해진다

- 스킨
- 애니메이션
- morph target
- 재질 확장
- 외부 파일 의존성

이런 요소는 MVP에서 과감히 제한하는 편이 좋다.

### 25.3 WebGPU를 너무 빨리 일반화하면 일정이 늘어난다

WebGPU는 훌륭하지만,
MVP에서 가장 중요한 것은 “바로 셰이더를 써보고 값과 텍스처를 연결해 볼 수 있는 경험”이다.

---

## 26. 최종 권장 결론

이 프로젝트의 핵심 설계 결론은 다음과 같다.

1. **MVP는 WebGL2 중심으로 시작한다.**
2. **모델 업로드는 glTF/glb 우선으로 제한한다.**
3. **사용자가 선언한 변수명을 그대로 UI에 노출한다.**
4. **UI 종류는 이름이 아니라 타입 기반으로 자동 생성한다.**
5. **`NoiseTex`, `MaskTex` 같은 예약 이름 강제는 하지 않는다.**
6. **엔진 내장 uniform만 예약 이름으로 관리한다.**
7. **reflection 기반 자동 UI 위에 메타데이터 규약을 얹는다.**
8. **제품 방향은 코드 기반 셰이더 편집기 + 모델 프리뷰 + 머티리얼 인스펙터다.**

가장 중요한 한 줄 요약은 아래와 같다.

> **사용자가 작성한 셰이더의 입력 변수를 추출해 머티리얼 프로퍼티로 승격하고, 값과 텍스처를 연결하는 구조로 설계해야 상용 엔진의 셰이더 인스펙터에 가까운 경험을 만들 수 있다.**

---

## 27. 공식 문서 및 참고 링크

아래 링크들은 문서 작성 시 기준으로 삼은 공식 문서 또는 1차 출처다.

### 웹 플랫폼 / API

- MDN Web Docs — WebGPU API  
  https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API
- MDN Web Docs — GPU  
  https://developer.mozilla.org/en-US/docs/Web/API/GPU
- MDN Web Docs — GPUDevice.createRenderPipeline()  
  https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/createRenderPipeline
- MDN Web Docs — WebGL2RenderingContext  
  https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext
- MDN Web Docs — WebGLRenderingContext.getActiveUniform()  
  https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/getActiveUniform
- MDN Web Docs — WebGL2RenderingContext.getActiveUniforms()  
  https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/getActiveUniforms
- MDN Web Docs — WebGLActiveInfo  
  https://developer.mozilla.org/en-US/docs/Web/API/WebGLActiveInfo
- MDN Web Docs — WebGLRenderingContext.getUniform()  
  https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/getUniform
- MDN Web Docs — `<input type="file">`  
  https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/file
- MDN Web Docs — 웹 어플리케이션에서 파일 사용하기  
  https://developer.mozilla.org/ko/docs/Web/API/File_API/Using_files_from_web_applications

### 3D 포맷

- Khronos Registry — glTF 2.0 Specification  
  https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
- Khronos — glTF Runtime 3D Asset Delivery  
  https://www.khronos.org/gltf/

---

## 28. 부록: 구현 정책 체크리스트

### 28.1 반드시 유지할 정책

- [ ] 사용자가 선언한 변수명을 UI에 그대로 사용한다.
- [ ] 텍스처 슬롯은 `sampler2D` 타입 기반으로 생성한다.
- [ ] 엔진 내장 uniform은 사용자 입력과 분리한다.
- [ ] 모델 업로드 지원 포맷을 제한한다.
- [ ] reflection만으로 부족한 UX는 메타데이터로 보강한다.
- [ ] 셰이더 재컴파일 후 프로퍼티 값을 가능한 유지한다.

### 28.2 MVP에서 하지 않아도 되는 것

- [ ] 모든 모델 포맷 지원
- [ ] 완전한 노드 그래프 에디터
- [ ] 원본 DCC 재질 완벽 재현
- [ ] 고급 PBR 전체 지원
- [ ] 멀티패스 에디터 완성

### 28.3 이 문서 기준의 MVP 한 줄 정의

> **WebGL2 기반으로 glTF 모델을 올리고, 사용자가 작성한 GLSL 셰이더의 uniform을 자동으로 UI에 노출하여 값과 텍스처를 연결해 볼 수 있는 셰이더 플레이그라운드**
