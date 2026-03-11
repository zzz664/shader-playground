# 셰이더 재생, 텍스처 반복, 블렌드, 모델 기즈모 조사 문서

## 1. 문서 목적

이 문서는 현재 셰이더 플레이그라운드 프로젝트에 아래 4가지 기능을 추가하기 위해 필요한 자료를 조사하고, 현재 코드 구조에 맞는 구현 방향을 정리한 문서이다.

- `R` 키로 셰이더 시간을 다시 시작하는 재생 기능
- 텍스처 반복 방식(`wrapS`, `wrapT`) 제어 기능
- 블렌드 설정(`src`, `dst`) 제어 기능
- Unity식 모델 이동/회전 기즈모 기능

문서의 목적은 구현 전에 다음을 확정하는 것이다.

- 현재 구조에서 어느 파일을 수정해야 하는가
- 어떤 Web API / WebGL API를 사용해야 하는가
- 저장/불러오기까지 포함하려면 데이터 구조를 어떻게 바꿔야 하는가
- 구현 시 충돌 가능성이 있는 UX 문제는 무엇인가

---

## 2. 현재 코드 기준 요약

현재 구조에서 관련된 핵심 파일은 아래와 같다.

- [src/App.tsx](/e:/projects/shader-playground/src/App.tsx)
  - 전역 상태를 관리한다.
  - `sceneMode`, `blendMode`, `resolutionScale`, `cameraState`, `modelAsset`, `materialValues`를 보관한다.
- [src/features/viewport/ViewportPanel.tsx](/e:/projects/shader-playground/src/features/viewport/ViewportPanel.tsx)
  - viewport UI와 마우스 드래그 / 휠 줌을 처리한다.
  - 모델 업로드 UI와 viewport toolbar가 여기에 있다.
- [src/core/renderer/WebGLQuadRenderer.ts](/e:/projects/shader-playground/src/core/renderer/WebGLQuadRenderer.ts)
  - `uTime`, `uResolution`, `uModel`, `uView`, `uProj`, `uCameraPos`를 실제로 공급한다.
  - 텍스처 생성 시 현재 `TEXTURE_WRAP_S/T`를 전역적으로 `REPEAT`로 고정하고 있다.
  - 블렌드는 현재 `opaque`, `alpha`, `additive` 프리셋만 가진다.
  - 업로드 모델은 현재 `createTranslationMatrix4(0, 1, 0)`만 적용한다.
- [src/shared/types/scenePreview.ts](/e:/projects/shader-playground/src/shared/types/scenePreview.ts)
  - viewport 상태 타입을 정의한다.
  - 현재 카메라는 `yaw`, `pitch`, `distance`만 가진다.
  - blend 상태는 현재 단순 `BlendMode` 문자열만 가진다.
- [src/shared/types/textureAsset.ts](/e:/projects/shader-playground/src/shared/types/textureAsset.ts)
  - 텍스처 자산 메타데이터를 가진다.
  - 현재는 wrap mode 정보가 없다.
- [src/shared/types/projectSnapshot.ts](/e:/projects/shader-playground/src/shared/types/projectSnapshot.ts)
  - 저장/불러오기 스키마를 가진다.
  - 현재 viewport 설정은 저장되지만, 텍스처 wrap mode, blend 상세 상태, 모델 transform은 아직 저장되지 않는다.
- [src/core/renderer/math/matrix4.ts](/e:/projects/shader-playground/src/core/renderer/math/matrix4.ts)
  - 현재는 identity, perspective, lookAt, Y 회전, translation만 있다.
  - 모델 transform 제어를 하려면 회전 조합과 행렬 곱이 더 필요하다.

---

## 3. 공식 자료 조사 결과

### 3.1 키 입력 처리

MDN 기준으로 `keydown` 이벤트는 모든 키에 대해 발생하고, 현재 포커스를 가진 요소에서 시작한 뒤 `Document`, `Window`까지 버블링될 수 있다. 또한 `KeyboardEvent.key`는 실제 눌린 키 값을 문자열로 제공한다.

관련 링크:

- https://developer.mozilla.org/en-US/docs/Web/API/Element/keydown_event
- https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key

핵심 정리:

- `keydown`는 현재 포커스된 요소가 이벤트 타깃이 된다.
- 에디터가 포커스를 가진 상태에서는 문자 입력과 단축키 처리를 구분해야 한다.
- 반복 입력 중에는 `KeyboardEvent.repeat`가 `true`가 된다.

### 3.2 애니메이션 시간 재생

MDN 기준으로 `requestAnimationFrame()`은 다음 repaint 전에 콜백을 한 번 호출하며, 매 프레임 시간 진행은 콜백 인자로 들어오는 시간값이나 별도 누적 시간으로 계산해야 한다. 다시 재생시키려면 현재 누적 시간 기준을 초기화하거나, 기준 시각을 다시 잡는 방식이 가장 단순하다.

관련 링크:

- https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame

핵심 정리:

- `requestAnimationFrame()`은 one-shot이다.
- 다음 프레임을 이어가려면 다시 호출해야 한다.
- 재생 시작점 리셋은 누적 시간 또는 시간 오프셋 조정으로 해결 가능하다.

### 3.3 텍스처 반복 방식

MDN 기준으로 `gl.texParameteri()`로 텍스처 파라미터를 설정하며, `TEXTURE_WRAP_S`와 `TEXTURE_WRAP_T`는 각각 `REPEAT`, `CLAMP_TO_EDGE`, `MIRRORED_REPEAT`를 받을 수 있다.

관련 링크:

- https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/texParameter

핵심 정리:

- `wrapS`, `wrapT`는 독립 설정 가능하다.
- `repeat`, `clamp`, `mirror`는 WebGL2에서 직접 매핑 가능하다.

### 3.4 블렌드 설정

MDN 기준으로 블렌드는 `blendFunc()`, `blendFuncSeparate()`, `blendEquation()`, `blendEquationSeparate()`로 제어한다.

관련 링크:

- https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/blendFunc
- https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/blendFuncSeparate
- https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/blendEquation
- https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/blendEquationSeparate

핵심 정리:

- source와 destination 계수는 서로 다른 값으로 설정할 수 있다.
- 현재 요구사항은 모든 factor를 직접 고르는 방식이 아니라, `src`, `dst`에 대해 미리 정의된 프리셋을 각각 선택하는 방식으로 해석하는 것이 맞다.

### 3.5 텍스처 NPOT 주의사항

MDN의 WebGL 텍스처 튜토리얼은 WebGL1 기준으로 non-power-of-two 텍스처에서 mipmap, repeat, mirrored repeat 제약이 있다고 설명한다. 현재 프로젝트는 WebGL2 기준이므로 MVP 구현에서는 제약이 완화되지만, 문서상 호환성 주의 메모는 남기는 편이 좋다.

관련 링크:

- https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Using_textures_in_WebGL

---

## 4. 기능별 설계 판단

## 4.1 `R` 키로 셰이더 재생

### 목표

사용자가 `R` 키를 누르면 `uTime` 기반 애니메이션을 0초부터 다시 시작하도록 한다.

### 현재 문제

렌더러는 내부적으로 `elapsedSeconds`를 누적한다.

즉 현재 구조에서는:

- 셰이더를 다시 컴파일하지 않아도
- 시간 기준만 0으로 되돌리면
- 대부분의 `uTime` 애니메이션을 다시 시작할 수 있다.

### 권장 구현

현재 프로젝트에는 아래 방식이 적절하다.

- `WebGLQuadRenderer`에 `restartPlayback()` 메서드 추가
- 내부에서
  - `elapsedSeconds = 0`
  - `lastFrameTime = performance.now()`
  - 즉시 `render(0)` 호출

### 단축키 UX 주의점

단순 전역 `R`은 에디터 입력과 충돌할 수 있다.

권장 정책:

- viewport 포커스 상태에서만 `R`
- 에디터 포커스 상태에서는 문자 입력 유지

### 구현 포인트

- [src/features/viewport/ViewportPanel.tsx](/e:/projects/shader-playground/src/features/viewport/ViewportPanel.tsx)
  - viewport frame에 `tabIndex`
  - `keydown` 처리
- [src/core/renderer/WebGLQuadRenderer.ts](/e:/projects/shader-playground/src/core/renderer/WebGLQuadRenderer.ts)
  - `restartPlayback()` 추가

### 저장/불러오기 영향

- 없음

---

## 4.2 텍스처 반복 방식 제어

### 목표

사용자가 텍스처마다 UV 반복 방식을 선택할 수 있게 한다.

지원 후보:

- `repeat`
- `clamp`
- `mirror`

그리고 텍스처 반복은 축별로 따로 설정할 수 있다.

- `wrapS`
- `wrapT`

### 현재 문제

현재 렌더러는 업로드 텍스처 생성 시 아래처럼 전역 고정이다.

- `TEXTURE_WRAP_S = REPEAT`
- `TEXTURE_WRAP_T = REPEAT`

즉:

- 흐름 표현에는 유리하지만
- clamp가 필요한 텍스처도 전부 repeat된다.
- `U` 방향만 반복하고 `V` 방향은 clamp하고 싶은 경우를 표현할 수 없다.

### 권장 데이터 구조

[src/shared/types/textureAsset.ts](/e:/projects/shader-playground/src/shared/types/textureAsset.ts)

```ts
export type TextureWrapMode = 'repeat' | 'clamp' | 'mirror'

export interface TextureAsset {
  ...
  wrapS: TextureWrapMode
  wrapT: TextureWrapMode
}
```

[src/shared/types/projectSnapshot.ts](/e:/projects/shader-playground/src/shared/types/projectSnapshot.ts)

```ts
wrapS: TextureWrapMode
wrapT: TextureWrapMode
```

### WebGL 매핑 표

| 앱 상태 | WebGL 상수 |
|---|---|
| `repeat` | `gl.REPEAT` |
| `clamp` | `gl.CLAMP_TO_EDGE` |
| `mirror` | `gl.MIRRORED_REPEAT` |

### UI 권장안

현재 구조에는 **Asset Browser에서 자산 속성으로 수정**하는 편이 맞다.

이유:

- 실제 바뀌는 것은 텍스처 객체의 파라미터다.
- 자산 단위 저장/복원이 단순하다.

### 구현 포인트

- [src/shared/types/textureAsset.ts](/e:/projects/shader-playground/src/shared/types/textureAsset.ts)
  - wrap mode 타입 추가
- [src/shared/types/projectSnapshot.ts](/e:/projects/shader-playground/src/shared/types/projectSnapshot.ts)
  - wrap mode 직렬화 추가
- [src/shared/utils/loadTextureAsset.ts](/e:/projects/shader-playground/src/shared/utils/loadTextureAsset.ts)
  - 기본값 지정
- [src/core/renderer/WebGLQuadRenderer.ts](/e:/projects/shader-playground/src/core/renderer/WebGLQuadRenderer.ts)
  - wrap mode 반영
- [src/features/assets/AssetBrowserPanel.tsx](/e:/projects/shader-playground/src/features/assets/AssetBrowserPanel.tsx)
  - wrap mode select UI 추가

### 저장/불러오기 영향

- 있음
- 텍스처 자산 직렬화에 포함해야 한다.

---

## 4.3 블렌드 설정 제어

### 목표

현재의 단순 프리셋형 블렌드 모드(`opaque`, `alpha`, `additive`)를 유지하되, 적용 방식을 `src`, `dst` 각각 따로 선택할 수 있게 한다.

즉 사용자가 원하는 방향은 아래와 같다.

- `srcBlendPreset`
- `dstBlendPreset`

그리고 각 슬롯에서 선택 가능한 값은 아래 3개다.

- `opaque`
- `alpha`
- `additive`

즉 이 기능은 “WebGL의 모든 blend factor를 직접 고르는 UI”가 아니라, **미리 정의된 3가지 프리셋을 `src`와 `dst`에 각각 배치하는 구조**로 보는 것이 맞다.

### 현재 문제

현재 렌더러는 아래 3개 프리셋만 가진다.

- `opaque`
- `alpha`
- `additive`

즉 사용자는 아래를 개별 제어할 수 없다.

- `src`는 alpha 계열
- `dst`는 additive 계열
- `src`와 `dst`를 서로 다른 프리셋으로 조합

### 권장 상태 모델

[src/shared/types/scenePreview.ts](/e:/projects/shader-playground/src/shared/types/scenePreview.ts)

```ts
export type BlendPreset = 'opaque' | 'alpha' | 'additive'

export interface BlendPresetState {
  src: BlendPreset
  dst: BlendPreset
}
```

### 권장 프리셋 매핑

같은 이름이라도 `src`와 `dst`에서 실제 factor 해석은 달라질 수 있다.

권장 규약:

| 슬롯 | 프리셋 | WebGL factor |
|---|---|---|
| `src` | `opaque` | `gl.ONE` |
| `src` | `alpha` | `gl.SRC_ALPHA` |
| `src` | `additive` | `gl.ONE` |
| `dst` | `opaque` | `gl.ZERO` |
| `dst` | `alpha` | `gl.ONE_MINUS_SRC_ALPHA` |
| `dst` | `additive` | `gl.ONE` |

예시:

- `src=alpha`, `dst=alpha`
  - 일반 alpha blending
- `src=alpha`, `dst=additive`
  - 밝은 누적 계열
- `src=opaque`, `dst=opaque`
  - 사실상 불투명 출력

### 구현 포인트

- [src/shared/types/scenePreview.ts](/e:/projects/shader-playground/src/shared/types/scenePreview.ts)
  - `BlendPreset`, `BlendPresetState` 추가
- [src/shared/types/projectSnapshot.ts](/e:/projects/shader-playground/src/shared/types/projectSnapshot.ts)
  - `srcBlendPreset`, `dstBlendPreset` 또는 `blendPresetState` 저장
- [src/App.tsx](/e:/projects/shader-playground/src/App.tsx)
  - `src`, `dst` 프리셋 상태 관리
- [src/features/viewport/ViewportPanel.tsx](/e:/projects/shader-playground/src/features/viewport/ViewportPanel.tsx)
  - `Src Blend`, `Dst Blend` UI 추가
- [src/core/renderer/WebGLQuadRenderer.ts](/e:/projects/shader-playground/src/core/renderer/WebGLQuadRenderer.ts)
  - factor 매핑 적용
  - depth write 정책 연동

### 저장/불러오기 영향

- 있음
- 프로젝트 스냅샷에 포함해야 한다.

---

## 4.4 Unity식 모델 이동/회전 기즈모

### 목표

사용자가 업로드한 모델을 viewport 안에서 직접 잡고 이동/회전할 수 있게 한다.

여기서 요구사항은 단순 슬라이더나 숫자 입력이 아니라, **Unity의 transform gizmo와 유사한 조작 방식**이다.

### 요구사항 재정의

#### 이동 기즈모

- 모델을 클릭하면 gizmo가 나타난다.
- `X`, `Y`, `Z` 축 핸들이 보인다.
- 특정 축 핸들을 잡고 드래그하면 해당 축 방향으로만 모델 위치가 바뀐다.

예:

- `X` 축 핸들을 잡으면 `position.x`만 바뀐다.
- `Y` 축 핸들을 잡으면 `position.y`만 바뀐다.

#### 회전 기즈모

- 회전 모드에서는 원형 링 형태의 gizmo가 나타난다.
- `X`, `Y`, `Z` 축에 대응하는 회전 링이 보인다.
- 특정 축 링을 잡고 드래그하면 해당 축 회전만 바뀐다.

예:

- `X` 축 링을 잡고 돌리면 `rotation.x`만 바뀐다.
- `Y` 축 링을 잡고 돌리면 `rotation.y`만 바뀐다.

즉 핵심은 아래 두 가지다.

- **오브젝트를 직접 잡아서 이동/회전한다**
- **선택한 축 하나에만 제한된 변화가 발생한다**

### 현재 문제

현재 업로드 모델은 renderer 내부에서 아래처럼 고정 변환만 쓴다.

- `createTranslationMatrix4(0, 1, 0)`

즉:

- 모델을 자유롭게 옮길 수 없고
- 회전을 직접 제어할 수 없고
- viewport에서 오브젝트 선택 개념도 없고
- gizmo를 그리거나 picking하는 구조도 없다.

### 데이터 모델 권장안

[src/shared/types/scenePreview.ts](/e:/projects/shader-playground/src/shared/types/scenePreview.ts)

```ts
export interface ModelTransformState {
  position: [number, number, number]
  rotation: [number, number, number]
}

export type TransformGizmoMode = 'translate' | 'rotate'
export type TransformAxis = 'x' | 'y' | 'z'
```

`App` 상태 예시:

```ts
const [modelTransform, setModelTransform] = useState<ModelTransformState>({
  position: [0, 1, 0],
  rotation: [0, 0, 0],
})

const [gizmoMode, setGizmoMode] = useState<TransformGizmoMode>('translate')
```

런타임 상호작용 상태는 viewport 내부 ref/state가 적절하다.

예:

- 현재 active axis
- 드래그 시작점
- hover 상태

이 값들은 저장 대상이 아니다.

### 행렬 계산 권장안

[src/core/renderer/math/matrix4.ts](/e:/projects/shader-playground/src/core/renderer/math/matrix4.ts)에 아래 함수가 추가로 필요하다.

- `createXRotationMatrix4`
- `createZRotationMatrix4`
- `multiplyMatrix4`
- 필요 시 `createScaleMatrix4`
- `transformPointMatrix4`
- `invertMatrix4`

모델 행렬 조합 권장 순서:

```txt
T * Rz * Ry * Rx
```

중요한 점은 **하나의 일관된 순서를 정하고 문서화하는 것**이다.

### gizmo 계산에 필요한 추가 수학

기즈모는 단순히 모델 행렬만 계산하면 끝나지 않는다.

필요 계산:

- 화면 좌표 -> ray
- ray와 보조 평면의 교차점 계산
- 선택 축 방향으로의 투영
- 회전 링 기준 각도 계산

### 이동 gizmo 권장 동작

가장 작은 범위의 이동 gizmo는 아래처럼 설계하는 것이 적절하다.

1. 축별 선분과 핸들을 월드 공간에 그림
2. 마우스 down 시 가장 가까운 축 핸들을 선택
3. 선택된 축에 수직인 보조 평면을 만든다
4. 마우스 ray와 보조 평면의 교차점을 구한다
5. 교차점 벡터를 선택 축 방향으로 투영한다
6. 그 투영 길이만큼 `position`을 갱신한다

### 회전 gizmo 권장 동작

회전 gizmo는 아래 방식이 가장 현실적이다.

1. 축별 회전 링을 월드 공간에 그림
2. 마우스 down 시 링을 선택
3. 선택 축에 수직인 회전 평면을 기준으로 마우스 ray를 투영한다
4. 시작 벡터와 현재 벡터 사이 각도를 구한다
5. 그 각도 차이를 해당 축 회전에 더한다

### picking 구현 방식 후보

#### 방법 A. CPU 기반 근사 판정

- 축 선분 / 링을 화면에 투영
- 화면상 거리 계산으로 선택 판정

장점:

- 초기 구현이 가장 작다.
- 별도 offscreen picking pass가 필요 없다.

단점:

- 링 hit test의 정확도가 다소 떨어질 수 있다.

#### 방법 B. color picking pass

- gizmo를 별도 offscreen framebuffer에 고유 색으로 그림
- 마우스 픽셀을 읽어 축/링 선택

장점:

- 선택 판정이 명확하다.

단점:

- render path가 커진다.
- 현재 범위에서는 과하다.

### 권장안

현재 프로젝트에는 **방법 A. CPU 기반 근사 판정**이 적절하다.

### gizmo 렌더링 위치

#### 방법 A. HTML/SVG 오버레이

- 구현은 빠르다.
- 하지만 실제 월드 공간과 깊이 관계가 약하다.

#### 방법 B. WebGL 월드 공간 helper pass

- 실제 `uView`, `uProj`를 따라 자연스럽게 보인다.
- 카메라 회전 시 공간감이 자연스럽다.
- 그리드와 같은 helper pass 구조로 통합할 수 있다.

### 권장안

transform gizmo는 **WebGL 월드 공간 helper pass**로 그리는 것이 맞다.

이유:

- 이미 현재 프로젝트는 월드 그리드를 WebGL로 그린다.
- gizmo도 같은 계층에 두면 공간 일관성이 좋다.

### UI 권장안

UI는 두 층으로 나누는 것이 적절하다.

#### 1. viewport 내부 gizmo

- 모델 선택 시 gizmo 표시
- `translate` 모드 축 핸들
- `rotate` 모드 축 링
- hover 강조
- active axis 강조

#### 2. viewport controls 보조 UI

- `Move / Rotate` 모드 토글
- `Reset Transform`
- 필요 시 현재 값 표시

즉 숫자 입력은 보조 수단일 수는 있어도, 주된 구현 목표는 아니다.

### 구현 포인트

- [src/shared/types/scenePreview.ts](/e:/projects/shader-playground/src/shared/types/scenePreview.ts)
  - `ModelTransformState`, `TransformGizmoMode`, `TransformAxis` 추가
- [src/shared/types/projectSnapshot.ts](/e:/projects/shader-playground/src/shared/types/projectSnapshot.ts)
  - `modelTransform` 추가
- [src/App.tsx](/e:/projects/shader-playground/src/App.tsx)
  - 상태 추가
  - 저장/불러오기 연결
- [src/features/viewport/ViewportPanel.tsx](/e:/projects/shader-playground/src/features/viewport/ViewportPanel.tsx)
  - 모델 선택
  - gizmo 모드 토글
  - pointer drag 상태 처리
- [src/core/renderer/math/matrix4.ts](/e:/projects/shader-playground/src/core/renderer/math/matrix4.ts)
  - 회전/곱셈/역행렬/점 변환 보조 함수 추가
- [src/core/renderer/WebGLQuadRenderer.ts](/e:/projects/shader-playground/src/core/renderer/WebGLQuadRenderer.ts)
  - `uModel` 계산을 `translation + rotation` 기반으로 교체
  - gizmo helper pass 추가

### 단계별 구현 권장안

#### 1단계. 모델 transform 상태 + `uModel` 반영

- position / rotation 상태 추가
- renderer에서 실제 모델 행렬 반영

#### 2단계. 이동 gizmo

- 축 3개 표시
- 축 선택
- 축 제한 드래그 이동

#### 3단계. 회전 gizmo

- 회전 링 표시
- 링 선택
- 축 제한 회전

#### 4단계. hover / highlight / reset polish

- hover 강조
- active axis 강조
- 선택 UX 정리

### 저장/불러오기 영향

- 있음
- `modelTransform`을 프로젝트 스냅샷에 포함해야 한다.

---

## 5. 권장 구현 순서

현재 코드 규모를 기준으로는 아래 순서가 가장 작고 안전하다.

### 1단계. `R` 재생 기능

- renderer `restartPlayback()`
- viewport focus / keydown 처리

### 2단계. 모델 transform 상태 반영

- position / rotation 상태 추가
- model matrix 조합 추가
- project snapshot 저장/복원 연결

### 3단계. 이동 gizmo

- gizmo helper pass
- 축 선택
- 축 제한 이동

### 4단계. 회전 gizmo

- 회전 링 helper pass
- 링 선택
- 축 제한 회전

### 5단계. 텍스처 wrap mode 제어

- texture asset 타입 확장
- asset browser UI
- renderer `texParameteri()` 재적용
- project persistence 연결

### 6단계. 블렌드 `src/dst` 프리셋 설정

- blend preset 타입 추가
- viewport UI 추가
- renderer factor 매핑 적용
- 프로젝트 저장/복원 연결

---

## 6. 권장 완료 기준

## 6.1 `R` 재생

- viewport가 포커스를 가진 상태에서 `R` 입력 시 `uTime` 기반 애니메이션이 0부터 다시 시작한다.
- 에디터에 포커스가 있을 때 `r` 문자 입력은 막지 않는다.

## 6.2 텍스처 반복

- 텍스처마다 `wrapS`, `wrapT`를 독립적으로 `repeat`, `clamp`, `mirror`로 바꿀 수 있다.
- 저장 후 불러와도 wrap mode가 유지된다.

## 6.3 블렌드 `src/dst` 설정

- `src`, `dst` 프리셋을 각각 `opaque`, `alpha`, `additive` 중에서 선택할 수 있다.
- 저장 후 불러와도 `src`, `dst` 프리셋이 유지된다.
- renderer에 실제 factor 매핑이 반영된다.

## 6.4 모델 transform

- 모델 위치와 회전을 바꿀 수 있다.
- viewport에서 즉시 반영된다.
- 저장 후 불러와도 같은 배치가 복원된다.

## 6.5 이동 gizmo

- 모델 선택 시 이동 축 gizmo가 나타난다.
- `X`, `Y`, `Z` 축 중 하나를 잡고 드래그하면 해당 축 위치만 변한다.

## 6.6 회전 gizmo

- 회전 모드에서 축 링 gizmo가 나타난다.
- `X`, `Y`, `Z` 축 링 중 하나를 잡고 드래그하면 해당 축 회전만 변한다.

---

## 7. 구현 시 주의사항

### 7.1 `R` 단축키와 에디터 충돌

전역 `window.keydown`에서 무조건 `R`을 잡으면 CodeMirror에 `r`을 입력할 수 없어진다.

따라서 최소한 viewport focus 조건은 필요하다.

### 7.2 텍스처 wrap mode와 저장 포맷

wrap mode를 UI만 바꾸고 저장 포맷을 안 바꾸면 새로고침, 로컬 저장/불러오기, JSON export/import 이후 값이 사라진다.

### 7.3 블렌드 `src/dst` 설정과 depth 정책

블렌드를 `src`, `dst` 프리셋 조합으로 열면 `depthMask(false)` 정책도 같이 검토해야 한다.

권장안:

- 현재처럼 프리셋별 depth 정책 유지

### 7.4 모델 transform과 카메라 framing 관계

권장안:

- `Reset Camera`는 현재 transform 상태의 모델을 기준으로 다시 맞춤
- `Reset Transform`은 모델 transform만 기본값으로 되돌림

### 7.5 gizmo와 모델 선택 정책

현재 프로젝트에는 다중 오브젝트 선택 구조가 없다.

따라서 1차 정책은 아래처럼 두는 것이 적절하다.

- 업로드 모델이 하나일 때만 gizmo 표시
- 현재 활성 모델 하나만 조작 가능
- 빈 공간 클릭 시 gizmo 비활성화 가능

---

## 8. 이번 조사 기준 권장 결론

현재 프로젝트에 가장 자연스럽게 들어가는 방향은 아래와 같다.

1. `R` 재생은 **viewport 포커스 상태 한정 단축키 + renderer 시간 초기화 메서드**로 구현한다.
2. 텍스처 반복 방식은 **TextureAsset의 자산 속성**으로 저장하고, Asset Browser에서 `wrapS`, `wrapT`를 수정하게 한다.
3. 블렌드는 **`src`, `dst` 각각 `opaque / alpha / additive` 프리셋을 고르는 구조**로 확장하고, 내부적으로는 WebGL factor 조합으로 매핑한다.
4. 모델 위치/회전은 **viewport 상태**로 관리하고, `uModel` 계산을 translation + rotation 조합으로 바꾼다.
5. transform 조작 방식은 숫자 입력보다 **Unity식 이동/회전 gizmo**를 우선한다.
6. gizmo는 오버레이보다 **WebGL 월드 공간 helper pass**로 그리는 것이 현재 구조와 맞다.
7. 텍스처 wrap mode, blend preset 상태, 모델 transform은 모두 **프로젝트 저장/불러오기 스키마**에 포함시킨다.

---

## 9. 참고 자료

- MDN `keydown` 이벤트
  - https://developer.mozilla.org/en-US/docs/Web/API/Element/keydown_event
- MDN `KeyboardEvent.key`
  - https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key
- MDN `requestAnimationFrame()`
  - https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
- MDN `texParameter[fi]()`
  - https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/texParameter
- MDN `blendFunc()`
  - https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/blendFunc
- MDN `blendFuncSeparate()`
  - https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/blendFuncSeparate
- MDN `blendEquation()`
  - https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/blendEquation
- MDN `blendEquationSeparate()`
  - https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/blendEquationSeparate
- MDN `Using textures in WebGL`
  - https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Using_textures_in_WebGL

