# 셰이더 플레이그라운드 개발 계획

## 1. 문서 목적

이 문서는 기존 `shader_playground_guide.md`를 바탕으로, 웹 기반 셰이더 플레이그라운드를 실제로 구현하기 위한 상세 개발 계획을 정리한 문서입니다.

본 프로젝트의 목표는 단순히 fragment shader를 화면에 출력하는 데서 끝나는 것이 아니라, 다음 요소를 하나의 시스템으로 통합하는 것입니다.

- 셰이더 코드 편집기
- 실시간 렌더링 뷰포트
- 모델 업로드 및 프리뷰
- 텍스처 업로드 및 연결
- 셰이더 변수 기반 머티리얼 인스펙터
- 프로젝트 저장/불러오기
- 향후 WebGPU 확장을 고려한 렌더링 구조

즉, 최종 산출물은 다음과 같이 정의할 수 있습니다.

> 코드 기반 셰이더 편집기 + 모델 프리뷰 + 머티리얼 인스펙터 + 사용자 리소스 연결 시스템

---

## 2. 프로젝트 목표

### 2.1 핵심 목표

사용자가 브라우저에서 직접 다음 작업을 수행할 수 있어야 합니다.

- vertex / fragment shader 코드를 작성하고 수정한다.
- 컴파일 결과와 오류를 실시간으로 확인한다.
- 기본 도형 또는 업로드한 3D 모델에 셰이더를 적용한다.
- 텍스처를 업로드해서 셰이더 입력에 연결한다.
- 셰이더에 선언된 변수를 기반으로 자동 생성된 UI에서 값을 조절한다.
- 작업 상태를 저장하고 나중에 다시 불러온다.

### 2.2 제품 방향

이 프로젝트는 처음부터 완전한 노드 기반 Shader Graph 에디터를 만드는 것이 아닙니다.

1차 목표는 다음과 같습니다.

- 사용자가 코드를 작성한다.
- 시스템이 셰이더 입력을 분석한다.
- UI가 자동으로 생성된다.
- 사용자가 텍스처와 값을 연결한다.
- 결과를 실시간으로 확인한다.

즉, 1차 제품은 **Shader Graph 자체**보다는 **Material Inspector가 강한 코드 기반 셰이더 플레이그라운드**에 가깝습니다.

---

## 3. 범위 정의

## 3.1 1차 범위(MVP)

다음 기능은 반드시 1차 범위에 포함합니다.

- WebGL2 기반 렌더링
- GLSL ES 3.00 기반 vertex / fragment shader 편집
- 컴파일 및 링크 오류 표시
- Fullscreen Quad 미리보기
- 기본 도형(plane, cube, sphere 등) 미리보기
- 업로드한 glTF / GLB 모델 프리뷰
- 셰이더 변수 기반 자동 UI 생성
- sampler2D 기반 텍스처 슬롯 생성
- 이미지 텍스처 업로드 및 연결
- 프로젝트 상태 저장/복원

## 3.2 2차 범위

- OBJ 지원
- 머티리얼 프로퍼티 메타데이터 주석 파서
- 프로퍼티 그룹화 및 표시명 설정
- Asset Browser 개선
- 디버그 뷰(normal/uv/depth 등)
- 고급 프로젝트 관리

## 3.3 후속 확장 범위

- WebGPU 백엔드 추가
- WGSL 지원
- 진짜 그래프형 노드 UI
- 멀티패스 렌더링
- 후처리 패스 체인
- 공유/협업 기능

---

## 4. 기술 방향

## 4.1 렌더링 백엔드

1차는 WebGL2를 기본 백엔드로 사용합니다.

이유는 다음과 같습니다.

- 브라우저 지원 범위가 넓습니다.
- 셰이더 컴파일/링크 과정이 단순합니다.
- active uniform reflection을 이용한 자동 UI 생성이 비교적 쉽습니다.
- 텍스처 업로드, 모델 렌더링, 미리보기 구축이 빠릅니다.

WebGPU는 후속 확장 대상으로 두되, 아키텍처는 처음부터 백엔드 교체 가능성을 고려합니다.

## 4.2 셰이더 언어

MVP에서는 WebGL2 기준 GLSL ES 3.00을 사용합니다.

- `.vert`, `.frag`
- `.vsh`, `.fsh`

위 확장자는 모두 지원할 수 있지만, 이는 UI/파일 편의 차원이며 실제 shader stage 구분은 애플리케이션이 수행합니다.

## 4.3 모델 포맷

1차 지원 포맷은 다음과 같이 제한합니다.

- 우선 지원: `.gltf`, `.glb`
- 후순위 지원: `.obj`

이유는 glTF가 메시, UV, normal, material, scene hierarchy 등 런타임 친화적인 구조를 제공하기 때문입니다.

## 4.4 텍스처 포맷

우선 지원 포맷:

- `.png`
- `.jpg`, `.jpeg`
- `.webp`

---

## 5. 핵심 설계 원칙

## 5.1 이름 강제 대신 사용자 선언 기반

`NoiseTex`, `MaskTex` 같은 예약 이름을 강제하지 않습니다.

대신 다음 원칙을 따릅니다.

- 사용자가 셰이더에서 선언한 변수명을 그대로 사용합니다.
- 시스템은 타입을 기반으로 UI 종류를 자동 결정합니다.
- 추가적인 표현 방식은 메타데이터 주석으로 보강합니다.

예를 들어:

```glsl
uniform sampler2D myNoise;
uniform sampler2D dissolveMask;
uniform float edgePower;
uniform vec4 edgeColor;
```

이 경우 UI에는 `myNoise`, `dissolveMask`, `edgePower`, `edgeColor` 가 그대로 표시됩니다.

## 5.2 예약 이름은 엔진 내장 변수에만 사용

예약 변수는 엔진이 자동 공급하는 값에만 한정합니다.

예:

- `uTime`
- `uResolution`
- `uMouse`
- `uModel`
- `uView`
- `uProj`
- `uCameraPos`
- `uLightDir`

사용자 정의 머티리얼 프로퍼티는 자유 이름을 허용합니다.

## 5.3 렌더링 코어와 에디터 UI 분리

프로젝트는 반드시 다음 두 계층으로 나눕니다.

- 렌더링 코어
- 에디터/상태/UI 레이어

이렇게 해야 백엔드 교체, 테스트, 디버깅, 확장이 쉬워집니다.

## 5.4 Reflection + Metadata 조합

자동 UI 생성은 기본적으로 reflection에 의존합니다.

- WebGL2: active uniforms 조회
- UI 기본 형태 생성

하지만 reflection만으로는 슬라이더 범위, 표시명, 그룹 등을 알 수 없으므로, 이후 단계에서 메타데이터 주석 체계를 추가합니다.

---

## 6. 목표 사용자 경험

사용자가 기대하는 이상적인 흐름은 다음과 같습니다.

1. 기본 템플릿 셰이더를 연다.
2. fragment / vertex 코드를 수정한다.
3. 결과가 뷰포트에 바로 반영된다.
4. 셰이더에 선언된 변수들이 우측 인스펙터에 자동 생성된다.
5. 사용자는 숫자, 체크박스, 색상, 텍스처 슬롯을 조절한다.
6. 모델이나 기본 도형에 셰이더를 적용한다.
7. 결과를 저장하거나 나중에 다시 불러온다.

즉, 상용 엔진의 Material Inspector 같은 감각을 코드 기반 셰이더 편집 환경에 붙이는 것이 핵심입니다.

---

## 7. 시스템 구성 개요

전체 시스템은 다음 모듈로 나눕니다.

- App Shell
- Editor
- Viewport
- Renderer Core
- Shader System
- Material Property System
- Texture System
- Model System
- Project Persistence
- Asset Registry

### 7.1 App Shell

전체 레이아웃과 패널 분할을 담당합니다.

예상 패널 구성:

- 좌측: 프로젝트/에셋/프리셋
- 중앙: 뷰포트
- 우측 상단: fragment / vertex code editor
- 우측 하단: inspector / compile errors / asset binding

### 7.2 Renderer Core

역할:

- WebGL2 컨텍스트 초기화
- 프레임 루프 관리
- resize 대응
- 렌더 타겟 관리(초기에는 단일 타겟)
- draw call 실행
- 공통 상태 관리

### 7.3 Shader System

역할:

- 셰이더 소스 보관
- 컴파일 / 링크
- 에러 로그 수집
- active uniform / active attribute 조회
- 이전 성공 프로그램 유지 정책 관리

### 7.4 Material Property System

역할:

- 셰이더 변수에서 프로퍼티 목록 생성
- 타입별 UI 매핑
- 값 저장/복원
- GPU uniform 반영
- texture property 연결

### 7.5 Texture System

역할:

- 이미지 업로드
- 이미지 디코딩
- GPU texture 생성
- texture unit 배정
- texture binding
- preview thumbnail 관리

### 7.6 Model System

역할:

- glTF / GLB 로드
- 메시 데이터 추출
- position / normal / uv 매핑
- 버퍼 생성
- 서브메시 draw 정보 생성
- 모델 프레이밍 정보 계산

### 7.7 Project Persistence

역할:

- 셰이더 코드 저장
- 프로퍼티 값 저장
- 텍스처 연결 정보 저장
- 현재 씬 모드 저장
- 업로드한 에셋 정보 관리

---

## 8. 추천 폴더 구조

```txt
src/
  app/
    providers/
    store/
    routes/

  core/
    renderer/
      backend/
      gl/
      scene/
      camera/
      geometry/
    shader/
      compiler/
      reflection/
      templates/
    material/
      property/
      binding/
      metadata/
    texture/
      loader/
      binding/
      registry/
    model/
      loader/
      parser/
      mesh/
    project/
      persistence/
      serializer/

  features/
    editor/
    inspector/
    viewport/
    asset-browser/
    project-panel/
    compile-panel/

  shared/
    types/
    constants/
    utils/
```

---

## 9. 단계별 개발 계획

## Phase 0. 기술 스펙 확정

### 목표
개발 전에 이번 버전의 범위를 고정합니다.

### 작업 항목

- WebGL2를 1차 렌더링 백엔드로 확정
- GLSL ES 3.00 템플릿 정의
- 모델 포맷 우선순위 확정
- 저장 방식(localStorage / IndexedDB) 결정
- 에디터 라이브러리 선택
- 기본 UI 레이아웃 확정

### 산출물

- 기술 스펙 문서
- MVP 체크리스트
- 제외 기능 목록

### 완료 기준

- 이번 버전의 목표와 비목표가 명확히 정리됨

---

## Phase 1. 프로젝트 초기 세팅

### 목표
개발 가능한 기본 프레임을 구축합니다.

### 작업 항목

- Vite + TypeScript + React 프로젝트 초기화
- 상태 관리 라이브러리 선정 및 도입
- ESLint / Prettier / path alias 설정
- 기본 앱 레이아웃 작성
- canvas 영역 확보

### 산출물

- 실행 가능한 빈 앱
- 기본 패널 레이아웃
- 뷰포트 컨테이너

### 완료 기준

- 앱이 실행되고, canvas와 편집 패널의 자리 구조가 확정됨

---

## Phase 2. WebGL2 렌더링 MVP

### 목표
뷰포트에 기본 셰이더를 렌더링합니다.

### 작업 항목

- WebGL2 context 생성
- canvas resize 처리
- fullscreen quad geometry 구성
- 기본 vertex / fragment shader 컴파일
- program link 처리
- animation frame loop 작성
- 엔진 내장 uniform 공급

### 내장 uniform 1차 목록

- `uTime`
- `uResolution`
- `uMouse`

### 산출물

- 셰이더가 화면에 출력되는 최소 렌더링 경로

### 완료 기준

- 기본 fragment shader를 수정하면 화면 결과가 달라짐

---

## Phase 3. 코드 에디터 통합

### 목표
사용자가 직접 셰이더를 편집할 수 있게 합니다.

### 작업 항목

- vertex editor / fragment editor 배치
- compile 버튼 추가
- auto compile 옵션 추가
- 기본 템플릿 제공
- 예제 preset 제공
- 에러 패널 연결

### UX 정책

- 컴파일 실패 시 마지막 성공 프레임 유지
- 에러 메시지는 별도 패널에 표시
- 자동 컴파일은 debounce 적용

### 산출물

- 코드 수정 → 컴파일 → 결과 반영 흐름

### 완료 기준

- 셰이더를 직접 편집하고 오류를 확인할 수 있음

---

## Phase 4. 셰이더 에러 처리 체계

### 목표
왜 실패했는지 사용자에게 명확히 보여줍니다.

### 작업 항목

- compile error 수집
- link error 수집
- line-based error 파싱
- 에러 패널 UI 구성
- warning / error 구분

### 산출물

- 컴파일 결과 피드백 시스템

### 완료 기준

- 잘못된 코드 입력 시 에러 원인이 표시됨

---

## Phase 5. Material Property System 1차

### 목표
셰이더 변수 기반으로 UI를 자동 생성합니다.

### 핵심 아이디어

- 셰이더 컴파일/링크 성공
- active uniform 목록 조회
- 타입별로 UI를 자동 생성
- 변경된 값을 uniform으로 반영

### 작업 항목

- active uniform reflection 모듈 작성
- uniform 타입 매핑 테이블 작성
- 동적 인스펙터 UI 생성기 작성
- 프로퍼티 상태 저장 구조 설계
- 값 변경 시 GPU 반영 경로 작성

### 1차 지원 타입

- float
- int
- bool
- vec2
- vec3
- vec4
- sampler2D

### UI 매핑 예시

- float → number 또는 slider
- int → integer input
- bool → checkbox
- vec2 / vec3 / vec4 → 숫자 묶음
- sampler2D → texture slot

### 산출물

- 자동 생성 머티리얼 인스펙터

### 완료 기준

- 셰이더에 선언된 uniform이 인스펙터에 자동으로 표시됨

---

## Phase 6. 사용자 텍스처 업로드 및 슬롯 연결

### 목표
사용자가 임의의 텍스처를 업로드해서 셰이더 입력에 연결할 수 있게 합니다.

### 작업 항목

- 이미지 파일 업로드 UI
- drag & drop 처리
- 이미지 디코딩 로직 작성
- GPU texture 생성
- texture asset registry 작성
- sampler2D property와 texture asset 연결
- texture unit 관리기 작성
- preview thumbnail UI 추가

### 중요한 정책

- 텍스처 이름을 예약하지 않음
- 사용자가 선언한 `sampler2D` 이름을 그대로 슬롯명으로 사용
- 텍스처의 의미는 이름 추론이 아니라 연결 구조로 결정

### 산출물

- 사용자 텍스처 업로드/연결 시스템

### 완료 기준

- `uniform sampler2D myNoise;` 선언 시 `myNoise` 슬롯이 생성되고, 이미지 연결이 가능함

---

## Phase 7. 기본 도형 및 Scene Mode 분리

### 목표
단순한 전체화면 셰이더뿐 아니라 3D 미리보기의 기반을 만듭니다.

### 작업 항목

- Scene Mode 분리
  - Screen Mode
  - Model Mode
- 기본 geometry 추가
  - plane
  - cube
  - sphere
  - torus 또는 capsule
- 공통 draw path 정리

### 산출물

- 전체화면 모드와 기본 3D 도형 모드

### 완료 기준

- 뷰포트 모드를 바꿔가며 셰이더 테스트 가능

---

## Phase 8. 모델 업로드 및 프리뷰

### 목표
업로드한 3D 모델에 셰이더를 적용할 수 있게 합니다.

### 작업 항목

- glTF / GLB 로더 통합
- 메시 추출 및 버퍼 생성
- position / normal / uv attribute 매핑
- 모델의 경계 박스 계산
- 자동 프레이밍 로직 구현
- 모델 원본 머티리얼 무시 또는 override 정책 구현

### 정책

기본 정책은 **플레이그라운드 셰이더를 모델 전체에 강제 적용**하는 것입니다.

### 경고 정책

다음 경우 경고를 표시합니다.

- normal 없음
- uv 없음
- 지원하지 않는 속성 구조

### 산출물

- 업로드 모델에 셰이더를 적용하는 프리뷰 기능

### 완료 기준

- `.glb` 업로드 후 모델이 보이고 셰이더 적용 결과가 확인됨

---

## Phase 9. 카메라 및 씬 제어

### 목표
모델 기반 셰이더 실험이 가능한 기본 3D 환경을 제공합니다.

### 작업 항목

- orbit camera
- 줌/회전/이동 제어
- reset framing 버튼
- 기본 directional light
- ambient factor
- 배경 모드(grid/checker/solid)

### 내장 uniform 2차 목록

- `uModel`
- `uView`
- `uProj`
- `uCameraPos`
- `uLightDir`

### 산출물

- 실용적인 모델 테스트 환경

### 완료 기준

- 사용자가 카메라를 조작하며 모델 셰이더를 디버깅할 수 있음

---

## Phase 10. 프로퍼티 메타데이터 시스템

### 목표
상용 엔진 머티리얼 인스펙터처럼 UI 표현을 향상시킵니다.

### 배경

reflection만으로는 다음 정보를 알 수 없습니다.

- 슬라이더 최소/최대값
- 표시명
- 그룹명
- 컬러 피커 여부
- 텍스처 슬롯 설명

따라서 메타데이터를 추가합니다.

### 예시

```glsl
uniform float edgePower;   // @label Edge Power @min 0 @max 5 @step 0.01
uniform vec4 edgeColor;    // @label Edge Color @ui color
uniform sampler2D myNoise; // @group Noise @ui texture
```

### 작업 항목

- 주석 파서 작성
- reflection 결과와 metadata 병합
- 그룹화 UI 작성
- color picker 매핑 추가
- displayName override 처리

### 산출물

- 고도화된 머티리얼 인스펙터

### 완료 기준

- 변수명은 유지하면서도 UI가 더 읽기 좋고 제어하기 쉬워짐

---

## Phase 11. 프로젝트 저장/불러오기

### 목표
사용자가 작업을 보존할 수 있게 합니다.

### 저장 대상

- vertex shader 코드
- fragment shader 코드
- 현재 scene mode
- 현재 geometry 또는 model 선택 정보
- 프로퍼티 값
- texture binding 정보
- 텍스처 asset 메타데이터
- camera 상태(선택)
- inspector metadata 상태

### 저장 방식

- 최근 작업: localStorage
- 구조화된 프로젝트: IndexedDB
- export/import: JSON 기반

### 산출물

- 프로젝트 저장/복원 기능

### 완료 기준

- 새로고침 후 작업 상태를 복원할 수 있음

---

## Phase 12. 에셋 관리 UI

### 목표
업로드한 모델과 텍스처를 관리할 수 있는 패널을 제공합니다.

### 작업 항목

- asset browser 패널
- texture thumbnail 목록
- 현재 연결 상태 표시
- model 교체 UI
- asset 삭제/교체
- 동일 이름 충돌 처리 정책

### 산출물

- 사용자가 연결 상태를 직관적으로 이해할 수 있는 에셋 패널

### 완료 기준

- 텍스처/모델 자산 관리가 쉬워짐

---

## Phase 13. 안정화 및 성능 개선

### 목표
실사용 가능한 수준으로 안정성을 높입니다.

### 작업 항목

- 셰이더 컴파일 debounce 조정
- context lost 대응
- resource dispose 체계 정리
- texture/model unload cleanup
- 큰 모델 업로드 제한
- 해상도 스케일 옵션
- draw path 성능 검토

### 산출물

- 반복 테스트 시 안정적으로 동작하는 플레이그라운드

### 완료 기준

- 메모리 누수와 상태 꼬임 없이 반복 사용 가능

---

## Phase 14. WebGPU 확장 준비

### 목표
나중에 WebGPU 백엔드를 추가할 수 있도록 추상화를 정리합니다.

### 작업 항목

- 렌더러 인터페이스 추상화
- 백엔드 공통 리소스 타입 정리
- property system을 backend-independent 구조로 정리
- shader metadata의 엔진 측 descriptor 모델 정리

### 주의점

WebGPU에서는 WebGL처럼 active uniform reflection 흐름이 동일하지 않으므로, 장기적으로는 다음 구조가 필요합니다.

- reflection
- metadata
- engine-side property descriptor

### 산출물

- WebGPU 도입 가능성을 고려한 구조 정리

### 완료 기준

- WebGL2 코드가 WebGPU 확장에 발목을 잡지 않음

---

## 10. 데이터 모델 설계 방향

## 10.1 Shader Asset

셰이더 코드와 컴파일 상태를 보관합니다.

예상 필드:

- id
- vertexSource
- fragmentSource
- compileStatus
- compileErrors
- metadata

## 10.2 Material Property

셰이더 입력 프로퍼티를 나타냅니다.

예상 필드:

- name
- displayName
- type
- ui control type
- current value
- default value
- binding target
- metadata

## 10.3 Material Instance

특정 셰이더에 대해 사용자가 현재 연결한 값과 텍스처를 보관합니다.

예상 필드:

- shaderId
- scalar/vector values
- texture bindings
- toggle states
- UI expansion states

## 10.4 Texture Asset

업로드된 텍스처를 나타냅니다.

예상 필드:

- asset id
- file name
- mime type
- width / height
- preview url
- gpu handle

## 10.5 Model Asset

업로드된 3D 모델을 나타냅니다.

예상 필드:

- asset id
- source file name
- format
- mesh count
- bounds
- attribute availability

---

## 11. UI 구성 계획

## 11.1 기본 레이아웃

추천 레이아웃은 3영역 구조입니다.

- 좌측: Project / Assets / Presets
- 중앙: Viewport
- 우측: Editors + Inspector + Compile Panel

## 11.2 Inspector 패널

Inspector는 다음 섹션으로 나누는 것이 좋습니다.

- Builtin Inputs
- Material Properties
- Texture Bindings
- Model Settings
- Viewport Settings

## 11.3 Compile 패널

- 오류 개수 표시
- line / column 표시
- warning 구분
- 이전 성공 상태 유지 여부 표시

## 11.4 Asset Browser

- Texture 목록
- Model 목록
- 현재 사용 중 표시
- 미리보기 썸네일

---

## 12. 주요 리스크와 대응 방안

## 12.1 Reflection 한계

문제:

- active uniform만 조회되므로 선언했지만 사용하지 않는 변수는 사라질 수 있음

대응:

- 문서화
- 나중에 선언 파서 보강
- metadata 기반 노출 옵션 검토

## 12.2 모델 속성 다양성

문제:

- 업로드한 모델이 normal / uv 를 가지지 않을 수 있음

대응:

- 경고 메시지 제공
- fallback 처리
- 기본 geometry 제공

## 12.3 텍스처 슬롯 복잡도 증가

문제:

- sampler2D가 많아질수록 texture unit 관리가 꼬일 수 있음

대응:

- 중앙 binding manager 구현
- 슬롯 디버그 정보 제공

## 12.4 셰이더 문법 혼동

문제:

- 사용자가 데스크톱 GLSL 문법이나 WebGL1 문법을 섞을 수 있음

대응:

- GLSL ES 3.00 템플릿 제공
- 문법 안내 패널 제공

## 12.5 프로젝트 저장 포맷의 복잡화

문제:

- 에셋 참조, property state, camera state가 늘어나면 저장 구조가 복잡해짐

대응:

- schema version 도입
- serializer / migrator 분리

---

## 13. 우선순위 정리

### 최우선

1. WebGL2 renderer
2. code editor
3. compile / link error 처리
4. fullscreen quad 렌더링
5. active uniform 기반 inspector
6. texture upload + sampler2D binding

### 그 다음

7. 기본 도형 미리보기
8. glTF / GLB model preview
9. orbit camera
10. project save/load
11. metadata 기반 inspector 고도화

### 후속

12. asset browser 고도화
13. debug modes
14. WebGPU backend
15. graph-like UX 강화

---

## 14. 추천 스프린트 구성

## Sprint 1

- 프로젝트 세팅
- WebGL2 canvas 초기화
- fullscreen quad 렌더링
- 기본 shader compile/link

## Sprint 2

- code editor 통합
- compile 버튼
- auto compile
- error panel

## Sprint 3

- active uniform reflection
- inspector 자동 생성
- float/int/bool/vector 반영

## Sprint 4

- texture upload
- sampler2D 연결
- texture preview

## Sprint 5

- 기본 geometry preview
- screen/model mode 분리
- viewport controls 기초

## Sprint 6

- glTF / GLB import
- model framing
- material override

## Sprint 7

- metadata 주석 파서
- grouped inspector
- color/slider 개선

## Sprint 8

- project save/load
- asset browser
- cleanup / stability 작업

---

## 15. 완료 정의

다음 조건을 만족하면 1차 개발 목표를 달성한 것으로 봅니다.

- 사용자가 vertex / fragment shader를 직접 편집할 수 있다.
- 컴파일 및 링크 오류를 확인할 수 있다.
- 셰이더 변수 기반으로 프로퍼티 UI가 자동 생성된다.
- 사용자가 텍스처를 업로드해서 sampler2D에 연결할 수 있다.
- 기본 도형 또는 업로드한 모델에 셰이더를 적용할 수 있다.
- 프로젝트 상태를 저장하고 복원할 수 있다.

---

## 16. 최종 권장 방향

이 프로젝트는 처음부터 “노드형 Shader Graph” 전체를 만들기보다, 먼저 아래 시스템을 완성하는 것이 가장 중요합니다.

> 코드 기반 셰이더 에디터 + 자동 노출 프로퍼티 + 머티리얼 인스펙터 + 모델 프리뷰

이 구조가 안정적으로 완성되면, 그 다음 단계에서 다음 기능을 확장할 수 있습니다.

- 프로퍼티 그룹 및 프리셋
- 텍스처 썸네일 중심 에디터 UX
- 다중 패스/후처리 체인
- WebGPU 백엔드
- 그래프형 연결 UX

즉, 1차 개발은 “강한 Material Inspector를 가진 셰이더 플레이그라운드”를 목표로 하고, 이후 점진적으로 Shader Graph 감각을 강화하는 것이 가장 현실적이고 유지보수에도 유리합니다.
