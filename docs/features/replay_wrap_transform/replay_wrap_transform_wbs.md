# 셰이더 재생, 텍스처 반복, 블렌드, 모델 기즈모 WBS

## 1. 문서 목적

이 문서는 [docs/features/replay_wrap_transform/replay_wrap_transform_development_plan.md](/e:/projects/shader-playground/docs/features/replay_wrap_transform/replay_wrap_transform_development_plan.md)를 바탕으로, 아래 기능을 실제 개발 가능한 단위로 분해한 WBS 문서이다.

- `R` 키로 셰이더 재생
- 텍스처 `wrapS`, `wrapT`
- 블렌드 `src`, `dst` 프리셋
- 모델 transform 상태
- 이동 gizmo
- 회전 gizmo

이 문서는 일정표가 아니라 작업 분해 문서이며, 각 항목은 완료 여부를 판단할 수 있는 수준으로 작성한다.

---

## 2. 최상위 WBS 개요

- 1. 셰이더 재생 기능
- 2. 텍스처 반복 방식
- 3. 블렌드 `src`, `dst` 프리셋
- 4. 모델 transform 상태
- 5. 이동 gizmo
- 6. 회전 gizmo
- 7. 저장/불러오기 스키마 반영
- 8. 안정화 및 UX 보강

---

## 3. 상세 WBS

## 1. 셰이더 재생 기능

### 1.1 renderer 재생 메서드 설계
- 설명: `uTime` 재생 시작점을 다시 0으로 돌릴 수 있는 renderer 메서드를 정의한다.
- 선행 작업: 없음
- 산출물: `restartPlayback()` 인터페이스
- 완료 기준:
  - renderer에 재생 리셋 메서드가 존재함
  - 내부 시간 누적값 초기화 방식이 고정됨

### 1.2 renderer 재생 메서드 구현
- 설명: 내부 누적 시간과 마지막 프레임 시간을 초기화하고 즉시 재렌더한다.
- 선행 작업: 1.1
- 산출물: `WebGLQuadRenderer.restartPlayback()`
- 완료 기준:
  - `uTime` 기반 애니메이션이 0부터 다시 시작됨

### 1.3 viewport focus 가능 상태 추가
- 설명: viewport frame이 키 입력을 받을 수 있도록 focus 가능한 요소로 만든다.
- 선행 작업: 없음
- 산출물: `tabIndex`, focus 스타일
- 완료 기준:
  - viewport에 포커스를 줄 수 있음

### 1.4 `R` 키 입력 처리
- 설명: viewport가 포커스를 가진 상태에서만 `R` 입력으로 재생 리셋을 호출한다.
- 선행 작업: 1.2, 1.3
- 산출물: viewport keydown 처리
- 완료 기준:
  - viewport 포커스 상태에서 `R` 입력 시 재생 리셋됨
  - `KeyboardEvent.repeat`에 의한 과도한 반복 호출이 없음

### 1.5 에디터 충돌 방지 검증
- 설명: CodeMirror 포커스 상태에서 문자 입력과 단축키 충돌이 없는지 확인한다.
- 선행 작업: 1.4
- 산출물: 입력 충돌 검증 결과
- 완료 기준:
  - 에디터에서 `r` 입력이 정상 동작함

---

## 2. 텍스처 반복 방식

### 2.1 `TextureWrapMode` 타입 정의
- 설명: `repeat`, `clamp`, `mirror`를 표현하는 공통 타입을 정의한다.
- 선행 작업: 없음
- 산출물: `TextureWrapMode`
- 완료 기준:
  - wrap mode 타입이 공통 타입 파일에 정의됨

### 2.2 `TextureAsset` 구조 확장
- 설명: 텍스처 자산에 `wrapS`, `wrapT`를 추가한다.
- 선행 작업: 2.1
- 산출물: 확장된 `TextureAsset`
- 완료 기준:
  - 모든 텍스처 자산이 축별 wrap 정보를 가짐

### 2.3 텍스처 기본 wrap 정책 정의
- 설명: 신규 업로드 텍스처의 기본 wrap 정책을 정한다.
- 선행 작업: 2.2
- 산출물: 기본값 정책
- 완료 기준:
  - 기본값이 `repeat / repeat` 또는 명시된 값으로 고정됨

### 2.4 GPU 텍스처 생성 시 wrap 적용
- 설명: 텍스처 생성 시 자산의 `wrapS`, `wrapT`를 실제 `texParameteri()`에 반영한다.
- 선행 작업: 2.2, 2.3
- 산출물: wrap 반영된 GPU 텍스처 생성 코드
- 완료 기준:
  - 새 텍스처 업로드 시 wrap 설정이 반영됨

### 2.5 기존 GPU 텍스처 wrap 갱신 경로 구현
- 설명: UI에서 wrap mode를 바꾸면 기존 GPU texture에도 즉시 재적용한다.
- 선행 작업: 2.4
- 산출물: texture parameter 업데이트 경로
- 완료 기준:
  - wrap 변경 시 새로 업로드하지 않아도 즉시 반영됨

### 2.6 Asset Browser wrap UI 구현
- 설명: 텍스처 카드에 `Wrap S`, `Wrap T` 선택 UI를 추가한다.
- 선행 작업: 2.2
- 산출물: wrap 편집 UI
- 완료 기준:
  - 텍스처 자산별 wrap 변경 가능

### 2.7 텍스처 직렬화 스키마 확장
- 설명: 프로젝트 저장 형식에 `wrapS`, `wrapT`를 포함한다.
- 선행 작업: 2.2
- 산출물: 확장된 `SerializedTextureAsset`
- 완료 기준:
  - JSON export/import와 로컬 저장에서 wrap 정보 유지

### 2.8 텍스처 wrap 복원 구현
- 설명: 저장된 프로젝트를 불러올 때 텍스처 wrap 상태를 복원한다.
- 선행 작업: 2.7
- 산출물: wrap 복원 로직
- 완료 기준:
  - 저장 후 불러와도 wrap 설정이 유지됨

---

## 3. 블렌드 `src`, `dst` 프리셋

### 3.1 `BlendPreset` 타입 정의
- 설명: `opaque`, `alpha`, `additive`를 표현하는 blend preset 타입을 정의한다.
- 선행 작업: 없음
- 산출물: `BlendPreset`
- 완료 기준:
  - 공통 타입으로 재사용 가능

### 3.2 `BlendPresetState` 구조 정의
- 설명: `src`, `dst` 각각의 프리셋을 담는 상태 구조를 정의한다.
- 선행 작업: 3.1
- 산출물: `BlendPresetState`
- 완료 기준:
  - `src`, `dst`를 독립 상태로 표현 가능

### 3.3 프리셋 -> WebGL factor 매핑 표 고정
- 설명: `src`, `dst` 프리셋을 어떤 WebGL factor로 해석할지 고정한다.
- 선행 작업: 3.2
- 산출물: factor mapping 함수 또는 상수 테이블
- 완료 기준:
  - `src`와 `dst`의 `opaque`, `alpha`, `additive` 매핑이 고정됨

### 3.4 renderer 블렌드 적용 경로 확장
- 설명: 현재 단일 `BlendMode` 대신 `src`, `dst` 프리셋 조합을 적용한다.
- 선행 작업: 3.3
- 산출물: 갱신된 blend 적용 코드
- 완료 기준:
  - `src`, `dst` 조합에 따라 실제 블렌드가 달라짐

### 3.5 depth write 정책 정리
- 설명: 새 blend preset 구조에서도 기존 depth 정책을 유지하거나 정리한다.
- 선행 작업: 3.4
- 산출물: blend별 depth 정책
- 완료 기준:
  - 투명 렌더 결과가 기존보다 명확히 깨지지 않음

### 3.6 viewport UI 구현
- 설명: `Src Blend`, `Dst Blend` 선택 UI를 추가한다.
- 선행 작업: 3.2
- 산출물: blend preset UI
- 완료 기준:
  - `src`, `dst` 프리셋을 각각 변경 가능

### 3.7 블렌드 preset 직렬화 스키마 확장
- 설명: 저장 형식에 `blendPresetState`를 포함한다.
- 선행 작업: 3.2
- 산출물: 확장된 project snapshot
- 완료 기준:
  - 저장/불러오기 후 blend preset 유지

### 3.8 블렌드 preset 복원 구현
- 설명: 로컬 저장/JSON import 시 `src`, `dst` 상태를 복원한다.
- 선행 작업: 3.7
- 산출물: blend preset 복원 로직
- 완료 기준:
  - 복원 후 viewport blend UI와 renderer가 일치함

---

## 4. 모델 transform 상태

### 4.1 `ModelTransformState` 타입 정의
- 설명: 모델 위치와 회전 상태를 표현하는 타입을 정의한다.
- 선행 작업: 없음
- 산출물: `ModelTransformState`
- 완료 기준:
  - `position`, `rotation`을 공통 타입으로 표현 가능

### 4.2 App 상태에 모델 transform 추가
- 설명: 업로드 모델 transform을 상위 상태로 관리한다.
- 선행 작업: 4.1
- 산출물: `modelTransform` 상태
- 완료 기준:
  - `App`에서 모델 transform을 보관함

### 4.3 행렬 유틸 확장
- 설명: X/Z 회전과 행렬 곱셈 유틸을 추가한다.
- 선행 작업: 4.1
- 산출물: matrix4 보조 함수
- 완료 기준:
  - translation + rotation 조합 행렬 생성 가능

### 4.4 renderer `uModel` 계산 교체
- 설명: 고정 translation 대신 상태 기반 모델 행렬을 사용한다.
- 선행 작업: 4.2, 4.3
- 산출물: 상태 기반 `uModel`
- 완료 기준:
  - transform 상태 변경이 실제 모델 렌더 결과에 반영됨

### 4.5 모델 transform 직렬화 스키마 확장
- 설명: project snapshot에 `modelTransform`을 추가한다.
- 선행 작업: 4.1
- 산출물: 확장된 project snapshot
- 완료 기준:
  - 저장 시 transform 상태 포함

### 4.6 모델 transform 복원 구현
- 설명: 저장 후 불러오기 시 transform 상태를 복원한다.
- 선행 작업: 4.5
- 산출물: transform 복원 로직
- 완료 기준:
  - 불러오기 후 모델 위치/회전 상태 유지

---

## 5. 이동 gizmo

### 5.1 gizmo 모드 / 축 타입 정의
- 설명: `translate`, `rotate`, `x`, `y`, `z` 타입을 정의한다.
- 선행 작업: 없음
- 산출물: `TransformGizmoMode`, `TransformAxis`
- 완료 기준:
  - gizmo 상태를 일관되게 표현 가능

### 5.2 gizmo 런타임 상태 설계
- 설명: active axis, hover axis, drag 시작점 등 런타임 상태를 설계한다.
- 선행 작업: 5.1
- 산출물: viewport 내부 상태 구조
- 완료 기준:
  - gizmo 상호작용 상태 구조가 정의됨

### 5.3 모델 선택 정책 구현
- 설명: 현재 활성 모델이 선택됐을 때만 gizmo를 표시하도록 한다.
- 선행 작업: 5.2
- 산출물: 모델 선택 / 비선택 상태
- 완료 기준:
  - 단일 활성 모델 기준 gizmo on/off 가능

### 5.4 이동 gizmo helper mesh 설계
- 설명: X/Y/Z 축 선분과 핸들 geometry를 정의한다.
- 선행 작업: 5.1
- 산출물: gizmo mesh 데이터
- 완료 기준:
  - 축별 helper geometry 준비 완료

### 5.5 이동 gizmo helper pass 구현
- 설명: WebGL 월드 공간에서 축 gizmo를 그리는 경로를 구현한다.
- 선행 작업: 5.4
- 산출물: 이동 gizmo 렌더 패스
- 완료 기준:
  - 모델 선택 시 축 gizmo가 viewport에 표시됨

### 5.6 축 hover 강조 처리
- 설명: 마우스가 축 근처에 있을 때 hover 상태를 표시한다.
- 선행 작업: 5.5
- 산출물: hover 강조 로직
- 완료 기준:
  - 가까운 축이 시각적으로 강조됨

### 5.7 이동 axis picking 구현
- 설명: CPU 기반 근사 판정으로 축 선택을 구현한다.
- 선행 작업: 5.5
- 산출물: axis picking 로직
- 완료 기준:
  - X/Y/Z 축 선택 가능

### 5.8 축 제한 이동 계산 구현
- 설명: 선택된 축 방향으로만 위치가 변하도록 이동량을 계산한다.
- 선행 작업: 5.7, 4.2
- 산출물: axis-constrained translate 계산
- 완료 기준:
  - 선택 축에 해당하는 position 값만 변함

### 5.9 gizmo 드래그 중 orbit 충돌 방지
- 설명: gizmo를 잡은 상태에서는 orbit camera 입력을 비활성화한다.
- 선행 작업: 5.8
- 산출물: 입력 충돌 방지 로직
- 완료 기준:
  - gizmo 드래그 중 카메라가 같이 움직이지 않음

### 5.10 이동 gizmo polish
- 설명: active axis 강조, 선택 해제, reset transform 버튼 등 기본 UX를 마무리한다.
- 선행 작업: 5.8, 5.9
- 산출물: polish된 이동 gizmo UX
- 완료 기준:
  - 이동 gizmo 조작 흐름이 끊기지 않음

---

## 6. 회전 gizmo

### 6.1 회전 링 helper mesh 설계
- 설명: X/Y/Z 축에 대응하는 회전 링 geometry를 정의한다.
- 선행 작업: 5.1
- 산출물: 회전 링 mesh 데이터
- 완료 기준:
  - 축별 링 geometry 준비 완료

### 6.2 회전 gizmo helper pass 구현
- 설명: WebGL 월드 공간에서 회전 링 gizmo를 그리는 경로를 구현한다.
- 선행 작업: 6.1
- 산출물: 회전 gizmo 렌더 패스
- 완료 기준:
  - 회전 모드에서 링 gizmo가 표시됨

### 6.3 회전 링 hover 강조 처리
- 설명: 마우스가 링 근처에 있을 때 hover 상태를 표시한다.
- 선행 작업: 6.2
- 산출물: 링 hover 강조 로직
- 완료 기준:
  - 가까운 링이 시각적으로 강조됨

### 6.4 회전 axis picking 구현
- 설명: CPU 기반 근사 판정으로 회전 링 선택을 구현한다.
- 선행 작업: 6.2
- 산출물: 링 선택 로직
- 완료 기준:
  - X/Y/Z 회전 링 선택 가능

### 6.5 회전 각도 계산 구현
- 설명: 회전 평면 기준으로 드래그 각도를 계산한다.
- 선행 작업: 6.4, 4.3
- 산출물: rotation delta 계산
- 완료 기준:
  - 드래그에 따라 축별 회전 각도 계산 가능

### 6.6 축 제한 회전 반영
- 설명: 선택된 축 회전에만 각도 차이를 반영한다.
- 선행 작업: 6.5, 4.2
- 산출물: axis-constrained rotate 적용
- 완료 기준:
  - 선택 축 회전만 변경됨

### 6.7 회전 gizmo와 orbit 충돌 방지
- 설명: 회전 gizmo를 잡은 상태에서는 orbit camera 입력을 비활성화한다.
- 선행 작업: 6.6
- 산출물: 입력 충돌 방지 로직
- 완료 기준:
  - 회전 링 드래그 중 카메라가 같이 움직이지 않음

### 6.8 회전 gizmo polish
- 설명: active axis 강조, rotate 모드 전환, reset transform 등 기본 UX를 마무리한다.
- 선행 작업: 6.6, 6.7
- 산출물: polish된 회전 gizmo UX
- 완료 기준:
  - 회전 gizmo 조작 흐름이 끊기지 않음

---

## 7. 저장/불러오기 스키마 반영

### 7.1 texture wrap 저장 구조 정리
- 설명: `wrapS`, `wrapT`를 project snapshot 직렬화에 포함한다.
- 선행 작업: 2.7
- 산출물: texture wrap 저장 구조
- 완료 기준:
  - wrap 정보가 저장/복원됨

### 7.2 blend preset 저장 구조 정리
- 설명: `src`, `dst` blend preset을 project snapshot 직렬화에 포함한다.
- 선행 작업: 3.7
- 산출물: blend preset 저장 구조
- 완료 기준:
  - blend preset이 저장/복원됨

### 7.3 model transform 저장 구조 정리
- 설명: `modelTransform`을 project snapshot 직렬화에 포함한다.
- 선행 작업: 4.5
- 산출물: model transform 저장 구조
- 완료 기준:
  - transform이 저장/복원됨

### 7.4 schema version 영향 점검
- 설명: 확장된 저장 구조가 기존 version 1 스냅샷과 충돌하지 않는지 검토한다.
- 선행 작업: 7.1, 7.2, 7.3
- 산출물: 호환성 메모 또는 보정 코드
- 완료 기준:
  - 구버전 스냅샷 로드 시 치명적 오류 없음

---

## 8. 안정화 및 UX 보강

### 8.1 gizmo와 orbit 입력 우선순위 정리
- 설명: 빈 공간 드래그는 orbit, gizmo hit 시에는 transform 조작으로 고정한다.
- 선행 작업: 5.9, 6.7
- 산출물: 명확한 입력 우선순위 정책
- 완료 기준:
  - 입력 충돌이 재현되지 않음

### 8.2 hover / active axis 시각 차이 정리
- 설명: hover 상태와 active 상태가 구분되도록 스타일을 정리한다.
- 선행 작업: 5.10, 6.8
- 산출물: 시각 상태 체계
- 완료 기준:
  - 축/링 상태가 명확히 보임

### 8.3 reset camera / reset transform 정책 적용
- 설명: camera reset과 transform reset의 역할을 분리한다.
- 선행 작업: 4.6, 5.10, 6.8
- 산출물: reset 정책 반영 UI
- 완료 기준:
  - camera reset과 transform reset 결과가 서로 명확히 구분됨

### 8.4 회귀 테스트 항목 정리
- 설명: 새 기능이 기존 viewport, texture, save/load 흐름을 깨지 않는지 점검 항목을 정리한다.
- 선행 작업: 1.x ~ 7.x 완료
- 산출물: 수동 테스트 체크리스트
- 완료 기준:
  - 최소 회귀 점검 항목이 문서화됨

---

## 4. 권장 구현 순서

실제 작업 순서는 아래가 적절하다.

1. `1.x` 셰이더 재생 기능
2. `4.x` 모델 transform 상태
3. `2.x` 텍스처 반복 방식
4. `3.x` 블렌드 `src`, `dst` 프리셋
5. `5.x` 이동 gizmo
6. `6.x` 회전 gizmo
7. `7.x` 저장 스키마 정리
8. `8.x` 안정화 및 polish

---

## 5. 완료 정의

다음 조건을 만족하면 이번 WBS 범위가 완료된 것으로 본다.

- viewport에서 `R`로 셰이더 재생을 다시 시작할 수 있다.
- 텍스처마다 `wrapS`, `wrapT`를 바꿀 수 있다.
- 블렌드 `src`, `dst` 프리셋을 각각 선택할 수 있다.
- 모델 transform이 실제 렌더 결과와 저장 포맷에 반영된다.
- 이동 gizmo로 축 제한 위치 조절이 가능하다.
- 회전 gizmo로 축 제한 회전 조절이 가능하다.
