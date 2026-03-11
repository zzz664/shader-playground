# 셰이더 재생, 텍스처 반복, 블렌드, 모델 기즈모 개발 계획

## 1. 문서 목적

이 문서는 [docs/features/replay_wrap_transform/replay_wrap_transform_research.md](/e:/projects/shader-playground/docs/features/replay_wrap_transform/replay_wrap_transform_research.md)를 바탕으로, 아래 기능을 실제 구현 가능한 단위로 정리한 개발 계획 문서이다.

- `R` 키로 셰이더 재생
- 텍스처 `wrapS`, `wrapT` 설정
- 블렌드 `src`, `dst` 프리셋 설정
- Unity식 모델 이동/회전 기즈모

이 문서의 목표는 다음과 같다.

- 구현 순서를 확정한다.
- 현재 코드 구조에서 수정 범위를 정리한다.
- 저장/불러오기 영향 범위를 명확히 한다.
- 한 번에 너무 큰 범위를 건드리지 않도록 작업 단위를 쪼갠다.

---

## 2. 구현 원칙

이번 범위는 기존 문서 원칙에 맞춰 아래 기준으로 진행한다.

- WebGL2 기반 구조를 유지한다.
- 현재 renderer / viewport / app 상태 구조를 크게 갈아엎지 않는다.
- 한 번에 한 기능축씩 진행한다.
- 저장 스키마가 바뀌는 기능은 직렬화/복원까지 한 작업 단위로 묶는다.
- gizmo는 숫자 입력 보조 UI보다 viewport 직접 조작을 우선한다.
- gizmo 렌더링은 HTML 오버레이보다 WebGL 월드 공간 helper pass를 우선한다.

---

## 3. 범위 정의

## 3.1 이번 계획에 포함하는 기능

- `R` 키로 `uTime` 재생 시작점 리셋
- 텍스처별 `wrapS`, `wrapT` 설정
- 블렌드 `src`, `dst` 프리셋 설정
- 모델 transform 상태
  - `position`
  - `rotation`
- 모델 이동 gizmo
- 모델 회전 gizmo

## 3.2 이번 계획에서 제외하는 기능

- scale gizmo
- 다중 오브젝트 선택
- color picking pass
- WebGPU용 gizmo 구현
- 텍스처 filter, UV transform, sampler object 분리
- 블렌드 equation 전체 수동 설정 UI

---

## 4. 현재 구조 기준 영향 범위

이번 계획에서 주로 수정될 가능성이 높은 파일은 아래와 같다.

- [src/App.tsx](/e:/projects/shader-playground/src/App.tsx)
- [src/features/viewport/ViewportPanel.tsx](/e:/projects/shader-playground/src/features/viewport/ViewportPanel.tsx)
- [src/core/renderer/WebGLQuadRenderer.ts](/e:/projects/shader-playground/src/core/renderer/WebGLQuadRenderer.ts)
- [src/core/renderer/math/matrix4.ts](/e:/projects/shader-playground/src/core/renderer/math/matrix4.ts)
- [src/shared/types/scenePreview.ts](/e:/projects/shader-playground/src/shared/types/scenePreview.ts)
- [src/shared/types/textureAsset.ts](/e:/projects/shader-playground/src/shared/types/textureAsset.ts)
- [src/shared/types/projectSnapshot.ts](/e:/projects/shader-playground/src/shared/types/projectSnapshot.ts)
- [src/shared/utils/loadTextureAsset.ts](/e:/projects/shader-playground/src/shared/utils/loadTextureAsset.ts)
- [src/shared/utils/projectPersistence.ts](/e:/projects/shader-playground/src/shared/utils/projectPersistence.ts)
- [src/features/assets/AssetBrowserPanel.tsx](/e:/projects/shader-playground/src/features/assets/AssetBrowserPanel.tsx)
- [src/App.css](/e:/projects/shader-playground/src/App.css)

---

## 5. 단계별 개발 계획

## Phase 1. 셰이더 재생 기능

### 목표

viewport가 포커스를 가진 상태에서 `R` 키를 누르면 `uTime` 기반 애니메이션을 0부터 다시 시작한다.

### 작업 항목

- renderer에 `restartPlayback()` 메서드 추가
- viewport frame이 focus를 받을 수 있게 조정
- viewport keydown 처리 추가
- `R` 키 입력 시 재생 리셋
- auto repeat 방지
- 에디터 포커스와 충돌하지 않도록 범위 제한

### 수정 대상

- [src/core/renderer/WebGLQuadRenderer.ts](/e:/projects/shader-playground/src/core/renderer/WebGLQuadRenderer.ts)
- [src/features/viewport/ViewportPanel.tsx](/e:/projects/shader-playground/src/features/viewport/ViewportPanel.tsx)
- [src/App.css](/e:/projects/shader-playground/src/App.css)

### 완료 기준

- viewport에 포커스가 있을 때 `R` 입력 시 애니메이션이 다시 시작된다.
- CodeMirror 편집 중 `r` 입력은 정상적으로 문자 입력된다.

---

## Phase 2. 모델 transform 상태 추가

### 목표

업로드 모델의 위치와 회전을 앱 상태로 관리하고, 실제 `uModel` 계산에 반영한다.

### 작업 항목

- `ModelTransformState` 타입 추가
- `App`에 `modelTransform` 상태 추가
- project snapshot에 `modelTransform` 추가
- 저장/불러오기 복원 연결
- `matrix4` 유틸 보강
  - X 회전
  - Z 회전
  - 행렬 곱
- renderer의 모델 행렬 계산을 `translation + rotation` 기반으로 교체

### 수정 대상

- [src/shared/types/scenePreview.ts](/e:/projects/shader-playground/src/shared/types/scenePreview.ts)
- [src/shared/types/projectSnapshot.ts](/e:/projects/shader-playground/src/shared/types/projectSnapshot.ts)
- [src/shared/utils/projectPersistence.ts](/e:/projects/shader-playground/src/shared/utils/projectPersistence.ts)
- [src/core/renderer/math/matrix4.ts](/e:/projects/shader-playground/src/core/renderer/math/matrix4.ts)
- [src/core/renderer/WebGLQuadRenderer.ts](/e:/projects/shader-playground/src/core/renderer/WebGLQuadRenderer.ts)
- [src/App.tsx](/e:/projects/shader-playground/src/App.tsx)

### 완료 기준

- 업로드 모델의 위치/회전 상태가 실제 렌더 결과에 반영된다.
- 저장 후 불러오면 동일한 transform이 복원된다.

---

## Phase 3. 텍스처 반복 방식

### 목표

텍스처 자산마다 `wrapS`, `wrapT`를 독립적으로 설정하고, GPU 텍스처에 즉시 반영한다.

### 작업 항목

- `TextureWrapMode` 타입 추가
- `TextureAsset`에 `wrapS`, `wrapT` 추가
- 직렬화 타입에 wrap 정보 추가
- 텍스처 생성 시 wrap mode 적용
- wrap mode 변경 시 기존 GPU texture에 `texParameteri()` 재적용
- Asset Browser에 wrap UI 추가

### 수정 대상

- [src/shared/types/textureAsset.ts](/e:/projects/shader-playground/src/shared/types/textureAsset.ts)
- [src/shared/types/projectSnapshot.ts](/e:/projects/shader-playground/src/shared/types/projectSnapshot.ts)
- [src/shared/utils/loadTextureAsset.ts](/e:/projects/shader-playground/src/shared/utils/loadTextureAsset.ts)
- [src/shared/utils/projectPersistence.ts](/e:/projects/shader-playground/src/shared/utils/projectPersistence.ts)
- [src/core/renderer/WebGLQuadRenderer.ts](/e:/projects/shader-playground/src/core/renderer/WebGLQuadRenderer.ts)
- [src/features/assets/AssetBrowserPanel.tsx](/e:/projects/shader-playground/src/features/assets/AssetBrowserPanel.tsx)
- [src/App.tsx](/e:/projects/shader-playground/src/App.tsx)

### 완료 기준

- 텍스처마다 `wrapS`, `wrapT`를 `repeat`, `clamp`, `mirror`로 바꿀 수 있다.
- 변경 즉시 viewport에 반영된다.
- 저장/불러오기 후에도 유지된다.

---

## Phase 4. 블렌드 `src`, `dst` 프리셋 상태

### 목표

블렌드 설정을 단일 `BlendMode`가 아니라, `src`, `dst` 각각의 프리셋으로 확장한다.

### 작업 항목

- `BlendPreset`, `BlendPresetState` 타입 추가
- `App` 상태에서 `src`, `dst` 프리셋 관리
- project snapshot에 blend preset 상태 추가
- renderer에서 프리셋을 factor로 매핑
- viewport UI에 `Src Blend`, `Dst Blend` 추가
- 현재 depth write 정책과의 호환성 검토

### 권장 프리셋 매핑

| 슬롯 | 프리셋 | WebGL factor |
|---|---|---|
| `src` | `opaque` | `gl.ONE` |
| `src` | `alpha` | `gl.SRC_ALPHA` |
| `src` | `additive` | `gl.ONE` |
| `dst` | `opaque` | `gl.ZERO` |
| `dst` | `alpha` | `gl.ONE_MINUS_SRC_ALPHA` |
| `dst` | `additive` | `gl.ONE` |

### 수정 대상

- [src/shared/types/scenePreview.ts](/e:/projects/shader-playground/src/shared/types/scenePreview.ts)
- [src/shared/types/projectSnapshot.ts](/e:/projects/shader-playground/src/shared/types/projectSnapshot.ts)
- [src/shared/utils/projectPersistence.ts](/e:/projects/shader-playground/src/shared/utils/projectPersistence.ts)
- [src/core/renderer/WebGLQuadRenderer.ts](/e:/projects/shader-playground/src/core/renderer/WebGLQuadRenderer.ts)
- [src/features/viewport/ViewportPanel.tsx](/e:/projects/shader-playground/src/features/viewport/ViewportPanel.tsx)
- [src/App.tsx](/e:/projects/shader-playground/src/App.tsx)

### 완료 기준

- `src`, `dst` 각각에서 `opaque`, `alpha`, `additive`를 고를 수 있다.
- 선택 조합이 실제 렌더에 반영된다.
- 저장/불러오기 후에도 유지된다.

---

## Phase 5. 이동 gizmo

### 목표

viewport에서 모델을 클릭해 이동 gizmo를 표시하고, 축을 잡아 축 제한 이동이 가능하게 한다.

### 작업 항목

- `TransformGizmoMode`, `TransformAxis` 타입 추가
- gizmo 모드 상태 추가
- 모델 선택 정책 추가
- 이동 gizmo helper pass 작성
- 축별 핸들 렌더링
- CPU 기반 근사 선택 판정
- 축 제한 드래그 이동
- hover / active axis 시각 강조

### 구현 방식

- gizmo 렌더링: WebGL 월드 공간 helper pass
- picking: CPU 기반 근사 판정

### 수정 대상

- [src/shared/types/scenePreview.ts](/e:/projects/shader-playground/src/shared/types/scenePreview.ts)
- [src/features/viewport/ViewportPanel.tsx](/e:/projects/shader-playground/src/features/viewport/ViewportPanel.tsx)
- [src/core/renderer/math/matrix4.ts](/e:/projects/shader-playground/src/core/renderer/math/matrix4.ts)
- [src/core/renderer/WebGLQuadRenderer.ts](/e:/projects/shader-playground/src/core/renderer/WebGLQuadRenderer.ts)
- [src/App.tsx](/e:/projects/shader-playground/src/App.tsx)
- [src/App.css](/e:/projects/shader-playground/src/App.css)

### 완료 기준

- 모델 선택 시 이동 gizmo가 보인다.
- `X`, `Y`, `Z` 축 중 하나를 잡고 드래그하면 해당 축만 이동한다.
- active axis가 명확히 강조된다.

---

## Phase 6. 회전 gizmo

### 목표

viewport에서 축별 회전 링을 잡고 해당 축 회전만 바꿀 수 있게 한다.

### 작업 항목

- 회전 링 helper pass 작성
- 축별 링 렌더링
- 링 선택 판정
- 회전 평면 기준 각도 계산
- 축 제한 회전 반영
- hover / active axis 시각 강조

### 구현 방식

- gizmo 렌더링: WebGL 월드 공간 helper pass
- picking: CPU 기반 근사 판정

### 수정 대상

- [src/features/viewport/ViewportPanel.tsx](/e:/projects/shader-playground/src/features/viewport/ViewportPanel.tsx)
- [src/core/renderer/math/matrix4.ts](/e:/projects/shader-playground/src/core/renderer/math/matrix4.ts)
- [src/core/renderer/WebGLQuadRenderer.ts](/e:/projects/shader-playground/src/core/renderer/WebGLQuadRenderer.ts)
- [src/App.tsx](/e:/projects/shader-playground/src/App.tsx)
- [src/App.css](/e:/projects/shader-playground/src/App.css)

### 완료 기준

- 회전 모드에서 축 링 gizmo가 보인다.
- `X`, `Y`, `Z` 링 중 하나를 잡고 드래그하면 해당 축만 회전한다.

---

## 6. 상태 구조 계획

## 6.1 Scene Preview 타입 확장

권장 추가 타입:

```ts
export type BlendPreset = 'opaque' | 'alpha' | 'additive'

export interface BlendPresetState {
  src: BlendPreset
  dst: BlendPreset
}

export interface ModelTransformState {
  position: [number, number, number]
  rotation: [number, number, number]
}

export type TransformGizmoMode = 'translate' | 'rotate'
export type TransformAxis = 'x' | 'y' | 'z'
```

## 6.2 TextureAsset 타입 확장

```ts
export type TextureWrapMode = 'repeat' | 'clamp' | 'mirror'
```

```ts
export interface TextureAsset {
  ...
  wrapS: TextureWrapMode
  wrapT: TextureWrapMode
}
```

## 6.3 ProjectSnapshot 확장

```ts
export interface ProjectSnapshot {
  ...
  blendPresetState: BlendPresetState
  modelTransform: ModelTransformState
}
```

```ts
export interface SerializedTextureAsset {
  ...
  wrapS: TextureWrapMode
  wrapT: TextureWrapMode
}
```

---

## 7. 저장/불러오기 반영 계획

이번 범위에서 저장 스키마에 들어가야 하는 값은 아래와 같다.

- texture asset
  - `wrapS`
  - `wrapT`
- viewport
  - `blendPresetState`
  - `modelTransform`

저장 스키마에 넣지 않는 값:

- 현재 gizmo hover 상태
- active axis
- 드래그 시작 마우스 좌표
- 현재 gizmo가 보이는지 여부

이 값들은 런타임 상호작용 상태이므로 세션 저장 대상이 아니다.

---

## 8. 리스크와 대응

## 8.1 `R` 단축키와 에디터 충돌

문제:

- 전역 `R` 단축키는 에디터 입력과 충돌할 수 있다.

대응:

- viewport focus 상태에서만 처리

## 8.2 블렌드와 depth write 정책

문제:

- `src`, `dst` 프리셋을 열면 기존 depth write 정책과 충돌할 수 있다.

대응:

- 초기에는 기존 프리셋별 depth 정책을 유지
- 필요 시 후속으로 `depthWrite` 노출 검토

## 8.3 gizmo picking 정확도

문제:

- CPU 기반 근사 선택은 링 hit test 정확도가 떨어질 수 있다.

대응:

- 1차는 근사 판정으로 구현
- 정밀도가 부족하면 후속으로 color picking pass 검토

## 8.4 gizmo와 카메라 조작 충돌

문제:

- orbit camera 드래그와 gizmo 드래그가 같은 pointer 이벤트를 쓸 수 있다.

대응:

- gizmo hit 시 orbit 입력 비활성화
- 빈 공간 드래그만 orbit으로 처리

## 8.5 transform과 framing 정책 충돌

문제:

- 모델을 이동한 뒤 reset camera 시 어떤 기준으로 다시 framing할지 정책이 필요하다.

대응:

- `Reset Camera`는 현재 transform 상태 기준
- `Reset Transform`은 transform만 초기화

---

## 9. 권장 작업 순서

실제 구현은 아래 순서가 적절하다.

1. `R` 재생
2. 모델 transform 상태 + `uModel`
3. 텍스처 wrap
4. 블렌드 `src/dst`
5. 이동 gizmo
6. 회전 gizmo

이 순서를 권장하는 이유:

- 작은 변경부터 적용 가능하다.
- 저장 스키마 변경은 중간 단계에서 정리할 수 있다.
- gizmo는 난이도가 높으므로 renderer와 상태 구조가 먼저 안정된 뒤 들어가는 편이 안전하다.

---

## 10. 완료 정의

다음 조건을 만족하면 이번 개발 계획 범위가 완료된 것으로 본다.

- viewport에서 `R`로 셰이더 재생을 다시 시작할 수 있다.
- 텍스처마다 `wrapS`, `wrapT`를 바꿀 수 있다.
- 블렌드 `src`, `dst` 프리셋을 각각 선택할 수 있다.
- 업로드 모델의 transform이 상태와 저장 포맷에 반영된다.
- 이동 gizmo로 축 제한 위치 조절이 가능하다.
- 회전 gizmo로 축 제한 회전 조절이 가능하다.

---

## 11. 최종 권장 방향

이번 범위는 단순 옵션 몇 개를 추가하는 작업이 아니라, viewport를 “실시간 셰이더 테스트 공간”에서 “직접 조작 가능한 프리뷰 공간”으로 확장하는 작업이다.

따라서 우선순위는 아래처럼 보는 것이 맞다.

1. 재생 / 상태 / 저장 같은 기초 제어
2. 텍스처와 블렌드 같은 렌더 설정
3. viewport 직접 조작 gizmo

특히 gizmo는 이번 범위에서 가장 복잡한 기능이므로, **이동 gizmo와 회전 gizmo를 분리해서 순차적으로 구현하는 것**이 가장 안전하다.
