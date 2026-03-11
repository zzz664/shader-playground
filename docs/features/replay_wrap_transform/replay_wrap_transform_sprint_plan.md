# 셰이더 재생, 텍스처 반복, 블렌드, 모델 기즈모 스프린트 계획

## 1. 문서 목적

이 문서는 아래 문서를 바탕으로, 추가 기능 구현 범위를 실제 스프린트 단위로 나눈 계획 문서이다.

- [docs/features/replay_wrap_transform/replay_wrap_transform_research.md](/e:/projects/shader-playground/docs/features/replay_wrap_transform/replay_wrap_transform_research.md)
- [docs/features/replay_wrap_transform/replay_wrap_transform_development_plan.md](/e:/projects/shader-playground/docs/features/replay_wrap_transform/replay_wrap_transform_development_plan.md)
- [docs/features/replay_wrap_transform/replay_wrap_transform_wbs.md](/e:/projects/shader-playground/docs/features/replay_wrap_transform/replay_wrap_transform_wbs.md)

대상 기능은 아래와 같다.

- `R` 키로 셰이더 재생
- 텍스처 `wrapS`, `wrapT`
- 블렌드 `src`, `dst` 프리셋
- 모델 transform 상태
- 이동 gizmo
- 회전 gizmo

이 문서의 목표는 다음과 같다.

- 작업 순서를 스프린트 단위로 고정한다.
- 각 스프린트 범위를 작게 유지한다.
- 세션 작업 시 바로 적용할 수 있는 기준 문서로 사용한다.

---

## 2. 스프린트 구성 원칙

- 한 스프린트는 가능한 한 하나의 기능축만 다룬다.
- 저장 포맷이 바뀌는 경우, 같은 스프린트 안에서 저장/복원까지 같이 끝낸다.
- gizmo는 난이도가 높으므로 이동과 회전을 분리한다.
- renderer 구조를 크게 뒤집지 않고 현재 `App -> ViewportPanel -> WebGLQuadRenderer` 흐름을 유지한다.
- UI 추가보다 상태 구조와 렌더 반영을 먼저 완성한다.

---

## 3. 스프린트 개요

- Sprint A
  - 셰이더 재생
- Sprint B
  - 모델 transform 상태
- Sprint C
  - 텍스처 반복 방식
- Sprint D
  - 블렌드 `src`, `dst` 프리셋
- Sprint E
  - 이동 gizmo
- Sprint F
  - 회전 gizmo
- Sprint G
  - 저장/복원 정리 및 안정화

---

## 4. 상세 스프린트 계획

## Sprint A. 셰이더 재생

### 목표

viewport 포커스 상태에서 `R` 키로 `uTime` 기반 애니메이션을 0부터 다시 시작할 수 있게 한다.

### 포함 작업

- WBS `1.1`
- WBS `1.2`
- WBS `1.3`
- WBS `1.4`
- WBS `1.5`

### 수정 예상 파일

- [src/core/renderer/WebGLQuadRenderer.ts](/e:/projects/shader-playground/src/core/renderer/WebGLQuadRenderer.ts)
- [src/features/viewport/ViewportPanel.tsx](/e:/projects/shader-playground/src/features/viewport/ViewportPanel.tsx)
- [src/App.css](/e:/projects/shader-playground/src/App.css)

### 완료 기준

- viewport 포커스 상태에서 `R` 입력 시 셰이더 애니메이션이 다시 시작된다.
- 에디터에서 `r` 입력은 정상적으로 유지된다.

### 리스크

- CodeMirror 입력과 충돌 가능성
- viewport focus UX 부족

---

## Sprint B. 모델 transform 상태

### 목표

업로드 모델의 위치와 회전을 상태로 관리하고, 실제 `uModel` 계산에 반영한다.

### 포함 작업

- WBS `4.1`
- WBS `4.2`
- WBS `4.3`
- WBS `4.4`
- WBS `4.5`
- WBS `4.6`

### 수정 예상 파일

- [src/shared/types/scenePreview.ts](/e:/projects/shader-playground/src/shared/types/scenePreview.ts)
- [src/shared/types/projectSnapshot.ts](/e:/projects/shader-playground/src/shared/types/projectSnapshot.ts)
- [src/shared/utils/projectPersistence.ts](/e:/projects/shader-playground/src/shared/utils/projectPersistence.ts)
- [src/core/renderer/math/matrix4.ts](/e:/projects/shader-playground/src/core/renderer/math/matrix4.ts)
- [src/core/renderer/WebGLQuadRenderer.ts](/e:/projects/shader-playground/src/core/renderer/WebGLQuadRenderer.ts)
- [src/App.tsx](/e:/projects/shader-playground/src/App.tsx)

### 완료 기준

- 모델 위치와 회전 상태가 실제 모델 렌더에 반영된다.
- 저장 후 불러오면 같은 transform이 복원된다.

### 리스크

- 기존 camera framing과 충돌 가능성
- 행렬 조합 순서 오류 가능성

---

## Sprint C. 텍스처 반복 방식

### 목표

텍스처 자산마다 `wrapS`, `wrapT`를 독립적으로 설정하고 저장/복원할 수 있게 한다.

### 포함 작업

- WBS `2.1`
- WBS `2.2`
- WBS `2.3`
- WBS `2.4`
- WBS `2.5`
- WBS `2.6`
- WBS `2.7`
- WBS `2.8`

### 수정 예상 파일

- [src/shared/types/textureAsset.ts](/e:/projects/shader-playground/src/shared/types/textureAsset.ts)
- [src/shared/types/projectSnapshot.ts](/e:/projects/shader-playground/src/shared/types/projectSnapshot.ts)
- [src/shared/utils/loadTextureAsset.ts](/e:/projects/shader-playground/src/shared/utils/loadTextureAsset.ts)
- [src/shared/utils/projectPersistence.ts](/e:/projects/shader-playground/src/shared/utils/projectPersistence.ts)
- [src/core/renderer/WebGLQuadRenderer.ts](/e:/projects/shader-playground/src/core/renderer/WebGLQuadRenderer.ts)
- [src/features/assets/AssetBrowserPanel.tsx](/e:/projects/shader-playground/src/features/assets/AssetBrowserPanel.tsx)
- [src/App.tsx](/e:/projects/shader-playground/src/App.tsx)

### 완료 기준

- `wrapS`, `wrapT`를 각각 `repeat`, `clamp`, `mirror`로 바꿀 수 있다.
- 변경 즉시 반영된다.
- 저장/불러오기 후에도 유지된다.

### 리스크

- 기존 텍스처 자산 직렬화와의 호환성
- 렌더러의 기존 텍스처 캐시 갱신 누락 가능성

---

## Sprint D. 블렌드 `src`, `dst` 프리셋

### 목표

블렌드를 단일 프리셋이 아니라 `src`, `dst` 조합으로 제어할 수 있게 한다.

### 포함 작업

- WBS `3.1`
- WBS `3.2`
- WBS `3.3`
- WBS `3.4`
- WBS `3.5`
- WBS `3.6`
- WBS `3.7`
- WBS `3.8`

### 수정 예상 파일

- [src/shared/types/scenePreview.ts](/e:/projects/shader-playground/src/shared/types/scenePreview.ts)
- [src/shared/types/projectSnapshot.ts](/e:/projects/shader-playground/src/shared/types/projectSnapshot.ts)
- [src/shared/utils/projectPersistence.ts](/e:/projects/shader-playground/src/shared/utils/projectPersistence.ts)
- [src/core/renderer/WebGLQuadRenderer.ts](/e:/projects/shader-playground/src/core/renderer/WebGLQuadRenderer.ts)
- [src/features/viewport/ViewportPanel.tsx](/e:/projects/shader-playground/src/features/viewport/ViewportPanel.tsx)
- [src/App.tsx](/e:/projects/shader-playground/src/App.tsx)

### 완료 기준

- `src`, `dst` 각각에서 `opaque`, `alpha`, `additive`를 선택할 수 있다.
- 실제 렌더에 반영된다.
- 저장/불러오기 후에도 유지된다.

### 리스크

- 기존 `BlendMode`와의 구조 충돌
- depth write 정책 부조화

---

## Sprint E. 이동 gizmo

### 목표

모델을 선택했을 때 이동 기즈모가 표시되고, 축을 잡아 해당 축 방향으로만 위치를 이동할 수 있게 한다.

### 포함 작업

- WBS `5.1`
- WBS `5.2`
- WBS `5.3`
- WBS `5.4`
- WBS `5.5`
- WBS `5.6`
- WBS `5.7`
- WBS `5.8`
- WBS `5.9`
- WBS `5.10`

### 수정 예상 파일

- [src/shared/types/scenePreview.ts](/e:/projects/shader-playground/src/shared/types/scenePreview.ts)
- [src/features/viewport/ViewportPanel.tsx](/e:/projects/shader-playground/src/features/viewport/ViewportPanel.tsx)
- [src/core/renderer/math/matrix4.ts](/e:/projects/shader-playground/src/core/renderer/math/matrix4.ts)
- [src/core/renderer/WebGLQuadRenderer.ts](/e:/projects/shader-playground/src/core/renderer/WebGLQuadRenderer.ts)
- [src/App.tsx](/e:/projects/shader-playground/src/App.tsx)
- [src/App.css](/e:/projects/shader-playground/src/App.css)

### 완료 기준

- 모델 선택 시 이동 축 gizmo가 보인다.
- `X`, `Y`, `Z` 축 중 하나를 잡고 드래그하면 해당 축만 이동한다.
- orbit camera와 입력 충돌이 없다.

### 리스크

- CPU 기반 picking 정확도
- gizmo와 orbit 입력 충돌

---

## Sprint F. 회전 gizmo

### 목표

회전 모드에서 축별 회전 링 gizmo가 보이고, 축 링을 잡아 해당 축 회전만 바꿀 수 있게 한다.

### 포함 작업

- WBS `6.1`
- WBS `6.2`
- WBS `6.3`
- WBS `6.4`
- WBS `6.5`
- WBS `6.6`
- WBS `6.7`
- WBS `6.8`

### 수정 예상 파일

- [src/features/viewport/ViewportPanel.tsx](/e:/projects/shader-playground/src/features/viewport/ViewportPanel.tsx)
- [src/core/renderer/math/matrix4.ts](/e:/projects/shader-playground/src/core/renderer/math/matrix4.ts)
- [src/core/renderer/WebGLQuadRenderer.ts](/e:/projects/shader-playground/src/core/renderer/WebGLQuadRenderer.ts)
- [src/App.tsx](/e:/projects/shader-playground/src/App.tsx)
- [src/App.css](/e:/projects/shader-playground/src/App.css)

### 완료 기준

- 회전 모드에서 축 링 gizmo가 보인다.
- `X`, `Y`, `Z` 축 링을 잡고 드래그하면 해당 축 회전만 변한다.
- orbit camera와 입력 충돌이 없다.

### 리스크

- 링 hit test 정확도
- 각도 계산 안정성

---

## Sprint G. 저장/복원 정리 및 안정화

### 목표

이번 범위에서 바뀐 상태들이 저장/복원에 모두 반영되고, gizmo 및 입력 UX를 안정화한다.

### 포함 작업

- WBS `7.1`
- WBS `7.2`
- WBS `7.3`
- WBS `7.4`
- WBS `8.1`
- WBS `8.2`
- WBS `8.3`
- WBS `8.4`

### 수정 예상 파일

- [src/shared/types/projectSnapshot.ts](/e:/projects/shader-playground/src/shared/types/projectSnapshot.ts)
- [src/shared/utils/projectPersistence.ts](/e:/projects/shader-playground/src/shared/utils/projectPersistence.ts)
- [src/App.tsx](/e:/projects/shader-playground/src/App.tsx)
- [src/features/viewport/ViewportPanel.tsx](/e:/projects/shader-playground/src/features/viewport/ViewportPanel.tsx)
- [src/App.css](/e:/projects/shader-playground/src/App.css)

### 완료 기준

- texture wrap, blend preset, model transform이 저장/복원된다.
- gizmo 입력과 orbit 입력 우선순위가 안정화된다.
- reset camera / reset transform 역할이 분리된다.

### 리스크

- 기존 저장 포맷과의 호환성
- 여러 신규 상태가 동시에 복원될 때 순서 문제

---

## 5. 권장 진행 순서

아래 순서로 진행하는 것이 가장 안전하다.

1. Sprint A
2. Sprint B
3. Sprint C
4. Sprint D
5. Sprint E
6. Sprint F
7. Sprint G

이 순서를 권장하는 이유:

- 작은 기능부터 순차적으로 검증 가능하다.
- 저장 스키마는 상태 구조가 확정된 뒤 정리할 수 있다.
- gizmo는 가장 복잡하므로 마지막에 들어가는 편이 안정적이다.

---

## 6. 완료 정의

다음 조건을 만족하면 이번 스프린트 계획 범위가 완료된 것으로 본다.

- viewport에서 `R`로 셰이더 재생을 다시 시작할 수 있다.
- 텍스처마다 `wrapS`, `wrapT`를 바꿀 수 있다.
- 블렌드 `src`, `dst` 프리셋을 각각 선택할 수 있다.
- 모델 transform이 실제 렌더와 저장 포맷에 반영된다.
- 이동 gizmo로 축 제한 위치 조절이 가능하다.
- 회전 gizmo로 축 제한 회전 조절이 가능하다.
- 저장/복원과 기본 UX가 안정화된다.
