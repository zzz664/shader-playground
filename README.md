# shader-playground

WebGL2 기반 셰이더 플레이그라운드 MVP 프로젝트입니다.

현재 반영 범위는 Sprint 6의 FBX 우선 경로까지이며, 아래 항목을 포함합니다.

- 프로젝트 기본 레이아웃
- WebGL2 컨텍스트 초기화
- fullscreen quad 렌더링
- 기본 GLSL ES 3.00 shader compile/link 구조
- vertex / fragment 코드 편집 UI
- 수동 compile 버튼
- auto compile
- 오류 패널
- active uniform reflection
- 인스펙터 자동 생성
- float / int / bool / vector uniform 반영
- 텍스처 업로드
- sampler2D 연결
- 텍스처 미리보기
- 기본 geometry preview
- screen / model mode 분리
- viewport controls 기초
- Binary / ASCII FBX import
- FBX node transform 반영
- FBX normal / UV 반영
- FBX diffuse 텍스처 연결

## 실행 방법

```bash
npm install
npm run dev
```

## 주요 스크립트

```bash
npm run build
npm run preview
npm run lint
```

## 현재 구조

```txt
src/
  core/
    model/
      framing/
      loader/
    renderer/
      geometry/
      gl/
      math/
    shader/
  features/
    compile-panel/
    editor/
    inspector/
    viewport/
  shared/
    types/
    utils/
```

## 현재 메모

- 1차 렌더 백엔드는 WebGL2만 구현합니다.
- WebGPU는 현재 구현 대상이 아니며, 이후 확장을 고려한 구조만 유지합니다.
- 셰이더는 GLSL ES 3.00 기준입니다.
- auto compile은 debounce 기반으로 동작합니다.
- 컴파일 실패 시 마지막 성공 렌더 결과를 유지합니다.
- 인스펙터는 사용자 uniform만 자동 노출하고, 엔진 예약 uniform은 제외합니다.
- FBX import는 `three`의 `FBXLoader`를 로더 전용으로 사용하고, 렌더링은 기존 WebGL2 경로를 유지합니다.
- 이번 단계의 FBX 지원 범위는 정적 메시, node hierarchy transform, normal/UV, diffuse 텍스처 연결까지입니다.
- 스킨, 애니메이션, 고급 FBX 머티리얼 속성은 아직 지원하지 않습니다.
