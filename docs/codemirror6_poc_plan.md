# CodeMirror 6 최소 PoC 계획

## 1. 문서 목적

이 문서는 `CodeMirror 6` 전환 가능성을 실제 구현으로 검증하기 위한 최소 PoC 범위를 정의한다.

이번 PoC의 목적은 다음 두 가지다.

- Monaco 대비 번들 크기와 초기 로드 부담이 얼마나 줄어드는지 확인
- 현재 프로젝트에서 필요한 핵심 편집 기능을 CodeMirror 6으로 재현 가능한지 확인

이번 문서는 전면 교체 계획이 아니라 **검증 범위 고정 문서**이다.

---

## 2. PoC 범위

이번 PoC는 다음 범위까지만 구현한다.

- fragment shader 단일 편집기
- GLSL 유사 코드 컬러링
- `Ctrl + Space` 자동완성
- 컴파일 오류 marker 표시
- 콘솔 클릭 시 해당 줄 이동
- 빌드 변수 기반 에디터 엔진 분기

이번 PoC 범위 밖 항목은 구현하지 않는다.

- vertex shader CodeMirror 편집기
- Monaco 완전 제거
- 프로젝트 저장 상태에 에디터 엔진 저장
- hover, folding, multi-cursor 고도화
- semantic token
- 고급 GLSL 파서 도입

---

## 3. 구현 정책

### 3.1 기존 Monaco 경로 유지

현재 Monaco 구현은 그대로 유지한다.

PoC는 별도 빌드 변수로만 켜고 끌 수 있게 한다.

- 기본 빌드: Monaco
- PoC 빌드: CodeMirror fragment editor

이 방식으로 기존 기능 회귀를 최소화한다.

### 3.2 fragment 편집만 지원

PoC에서는 fragment shader만 CodeMirror로 편집한다.

이유:

- 현재 셰이더 플레이그라운드의 사용자 체감 대부분은 fragment 편집에 집중된다.
- 최소 기능으로도 자동완성, marker, 이동 UX를 검증할 수 있다.
- vertex까지 같이 옮기면 PoC 범위를 벗어난다.

### 3.3 GLSL 전용 확장은 최소화

이번 단계에서는 완전한 GLSL 문법 지원보다 다음을 우선한다.

- 키워드/타입/함수 색상 구분
- 기본 스니펫 자동완성
- 진단 marker 연결

즉 언어 품질보다 전환 가능성 검증을 우선한다.

---

## 4. 완료 기준

다음 조건을 만족하면 이번 PoC를 완료로 본다.

- `VITE_EDITOR_ENGINE=codemirror-poc` 빌드가 성공한다.
- fragment shader를 CodeMirror에서 편집할 수 있다.
- `Ctrl + Space` 자동완성이 동작한다.
- fragment 컴파일 오류가 CodeMirror marker로 표시된다.
- 콘솔 클릭 시 fragment 에디터가 해당 줄로 이동한다.
- 기본 Monaco 빌드와 CodeMirror PoC 빌드의 번들 결과를 비교할 수 있다.

---

## 5. 측정 항목

비교 측정 항목은 다음과 같다.

- 전체 빌드 산출물 크기
- 에디터 관련 청크 크기
- 초기 진입 청크 크기
- 구현 가능한 기능 범위
- 기능 회귀 여부

Lighthouse는 로컬 자동 측정 도구 사용 가능 여부를 먼저 확인한 뒤, 가능할 때만 수치를 추가한다.

---

## 6. 후속 판단 기준

PoC 결과를 보고 다음 중 하나를 선택한다.

### 유지

아래 조건이면 Monaco 유지가 맞다.

- 번들 감소 폭이 작다.
- CodeMirror에서 GLSL 편집 UX 회귀가 크다.
- 오류 marker나 자동완성 품질이 기준에 못 미친다.

### 전환 검토

아래 조건이면 실제 전환 계획을 세운다.

- 에디터 관련 번들 감소 폭이 크다.
- fragment PoC UX가 충분히 안정적이다.
- vertex editor, diagnostics, preset 흐름 재현 비용이 감당 가능하다.
