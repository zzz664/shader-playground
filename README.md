# shader-playground

웹 기반 셰이더 플레이그라운드 MVP를 목표로 하는 프로젝트입니다.

현재 Sprint 1 범위까지 반영되어 있으며, 아래 항목이 포함됩니다.

- 프로젝트 기본 레이아웃
- WebGL2 컨텍스트 초기화
- fullscreen quad 렌더링
- 기본 GLSL ES 3.00 shader compile/link 경로

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
    viewport/
  shared/
    types/
```

## 이번 단계 메모

- WebGL2만 구현 대상이며 WebGPU는 아직 포함하지 않습니다.
- 셰이더 템플릿은 GLSL ES 3.00 기준입니다.
- 다음 단계에서는 코드 에디터, 컴파일 제어, 오류 패널이 이어질 예정입니다.
