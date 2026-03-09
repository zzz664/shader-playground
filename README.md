# shader-playground

웹 기반 셰이더 플레이그라운드 MVP를 목표로 하는 프로젝트입니다.

현재 Sprint 3 범위까지 반영되어 있으며, 아래 항목이 포함됩니다.

- 프로젝트 기본 레이아웃
- WebGL2 컨텍스트 초기화
- fullscreen quad 렌더링
- 기본 GLSL ES 3.00 shader compile/link 경로
- vertex / fragment 코드 편집 UI
- 수동 compile 버튼
- auto compile
- 오류 패널
- active uniform reflection
- 인스펙터 자동 생성
- float/int/bool/vector uniform 반영

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
    renderer/
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

## 이번 단계 메모

- WebGL2만 구현 대상이며 WebGPU는 아직 포함하지 않습니다.
- 셰이더 템플릿은 GLSL ES 3.00 기준입니다.
- auto compile은 debounce 기반으로 동작합니다.
- 컴파일 실패 시 마지막 성공 렌더 결과를 유지합니다.
- 내장 uniform은 인스펙터에서 숨기고, 사용자 uniform만 자동 노출합니다.
