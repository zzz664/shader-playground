# CodeMirror 6 전환 검토 문서

## 1. 문서 목적

이 문서는 현재 프로젝트의 코드 에디터 구현을 `Monaco Editor`에서 `CodeMirror 6`으로 전환할 필요가 있는지 검토하기 위한 비교 문서이다.

검토 범위는 다음과 같다.

- 현재 Monaco 기반 구현의 장점과 한계
- Lighthouse 성능 이슈와의 관련성
- CodeMirror 6 전환 시 기대 효과
- 전환 시 필요한 구현 작업과 리스크
- 현재 프로젝트 기준 권장 방향

이 문서는 구현 지시서가 아니라 **기술 선택 검토 문서**이다.

---

## 2. 현재 상태 요약

현재 프로젝트의 에디터는 다음 구조로 구현돼 있다.

- `@monaco-editor/react` 기반 에디터 래퍼 사용
- `monaco-editor/esm/vs/editor/editor.api.js` 직접 로드
- 커스텀 GLSL 언어 등록
- `Ctrl + Space` 자동완성 지원
- 컴파일 오류를 Monaco marker로 표시
- 콘솔 패널 클릭 시 해당 줄 이동 지원
- `vertexShader`, `fragmentShader` 탭 기반 단일 에디터 UI
- lazy load 및 Vite `manualChunks` 적용

관련 파일:

- `src/features/editor/ShaderEditorPanel.tsx`
- `src/features/editor/MonacoShaderEditor.tsx`
- `src/features/editor/configureMonacoGlsl.ts`
- `vite.config.ts`

현재 빌드 기준 Monaco 관련 산출물은 대략 다음 수준이다.

- `monaco` 청크: 약 `2.5MB`
- gzip 기준: 약 `664KB`
- 초기 진입 청크에서는 분리됐지만, 에디터 사용 시 다운로드 비용은 여전히 큼

---

## 3. Monaco 유지의 장점

### 3.1 기능 완성도가 높다

Monaco는 코드 편집기 기능이 이미 매우 풍부하다.

- marker
- hover
- completion
- selection / reveal API
- 테마 구성
- 향후 semantic token, inline hint 같은 확장 여지

현재 프로젝트에서 이미 필요한 기능 대부분이 Monaco API 위에서 구현돼 있다.

### 3.2 현재 구현 자산을 그대로 활용할 수 있다

이미 아래 기능이 Monaco 기준으로 연결돼 있다.

- GLSL 토큰 컬러링
- 자동완성
- 컴파일 에러 marker
- 콘솔 클릭 이동
- 탭 전환

즉 유지 비용은 상대적으로 낮다.

### 3.3 WBS 4.x 요구사항과 잘 맞는다

WBS의 `4.1`, `4.4`, `4.5` 관점에서 Monaco는 이미 요구사항 충족 방향으로 구현돼 있다.

---

## 4. Monaco 유지의 한계

### 4.1 번들 크기 부담이 매우 크다

현재 성능 관점에서 가장 큰 문제는 Monaco 코어 크기다.

- lazy load를 해도 에디터를 여는 순간 큰 다운로드가 발생한다.
- Lighthouse의 `Reduce unused JavaScript`, `Minify JavaScript` 항목에 불리하다.
- 네트워크 상태가 좋지 않은 환경에서는 에디터 표시가 늦어질 수 있다.

### 4.2 React 래퍼와 수동 layout 관리가 필요하다

Monaco는 DOM 기반 단순 textarea보다 초기화 비용과 레이아웃 관리 비용이 크다.

- mount 시점 layout 문제
- ResizeObserver 연동 필요
- marker와 focus 이동 동기화 필요

즉 현재처럼 성능 최적화와 안정성을 함께 잡으려면 에디터 주변 보조 코드가 계속 필요하다.

### 4.3 셰이더 플레이그라운드 용도 대비 과한 면이 있다

현재 프로젝트의 편집 대상은 일반 프로그래밍 언어 전체가 아니라 GLSL 중심의 짧은 셰이더 코드다.

즉 다음 같은 점에서 Monaco의 무게가 과할 수 있다.

- 프로젝트 단위 코드 인텔리센스 불필요
- 파일 탐색기, 리네임, 복잡한 심볼 분석 불필요
- 대규모 IDE급 기능 대부분 미사용

---

## 5. CodeMirror 6 전환 시 기대 효과

### 5.1 번들 크기 감소 가능성이 크다

CodeMirror 6은 모듈식 구조라 필요한 기능만 선택해서 넣을 수 있다.

현재 프로젝트에 필요한 기능만 조합하면 Monaco보다 훨씬 작은 에디터 구성이 가능하다.

예상 이점:

- 초기 네트워크 비용 감소
- 에디터 오픈 시 체감 로딩 속도 개선
- Lighthouse JS 관련 지표 개선 가능성 증가

### 5.2 필요한 기능만 선택적으로 조합 가능하다

현재 프로젝트에서 실제 필요한 기능은 다음 정도다.

- GLSL 문법 컬러링
- 자동완성
- 오류 marker
- 줄 이동
- 탭 기반 단일 에디터

CodeMirror 6은 extension 조합 방식이라 이 범위에 맞게 가볍게 설계하기 좋다.

### 5.3 React 통합이 단순한 편이다

CodeMirror 6은 뷰 인스턴스를 직접 붙이거나 React 래퍼를 얇게 둘 수 있어서, Monaco보다 초기화 흐름이 단순해질 가능성이 있다.

---

## 6. CodeMirror 6 전환 시 필요한 재구현 범위

CodeMirror 6으로 바꾸면 기존 에디터 기능을 거의 다시 붙여야 한다.

### 6.1 언어 지원

다음 중 하나가 필요하다.

- 기존 GLSL Lezer 문법 패키지 검토
- 없거나 부족하면 커스텀 하이라이팅 규칙 작성

필요 작업:

- 키워드/타입/내장 함수 컬러링
- 주석/문자열/숫자 처리
- stage별 스니펫 자동완성 연결

### 6.2 자동완성 재구현

현재 Monaco completion provider에서 제공하는 항목을 CodeMirror completion source로 옮겨야 한다.

대상:

- GLSL 키워드
- 타입
- 내장 함수
- 엔진 내장 uniform
- vertex / fragment stage별 스니펫

### 6.3 에러 marker 재구현

현재는 `ParsedDiagnosticLine`을 Monaco marker로 바로 연결하고 있다.

전환 시 필요 작업:

- line/column -> document position 변환
- 진단 범위 decoration 생성
- 오류/경고 스타일 분리
- 콘솔 클릭 시 selection / scrollIntoView 연결

### 6.4 테마 재구현

현재 GLSL 전용 색상 규칙을 CodeMirror highlight style로 다시 정의해야 한다.

### 6.5 탭 전환 시 상태 유지 처리

현재는 단일 Monaco 인스턴스에 `path`와 `value`를 바꿔 쓰는 구조다.

CodeMirror 6에서는 다음 방식 중 하나를 선택해야 한다.

- stage별로 별도 `EditorState` 유지
- 단일 state를 탭 전환 시 교체

첫 번째 방식이 UX상 안전하지만 구현량이 늘어난다.

---

## 7. 기능 비교

### 7.1 현재 프로젝트 기준 비교표

| 항목 | Monaco | CodeMirror 6 |
| --- | --- | --- |
| 번들 크기 | 큼 | 작게 구성 가능 |
| 초기 로드 성능 | 불리함 | 유리함 |
| GLSL 커스텀 완성도 | 현재 구현 완료 | 다시 구현 필요 |
| 오류 marker | 현재 구현 완료 | 다시 구현 필요 |
| 콘솔 클릭 이동 | 현재 구현 완료 | 다시 구현 필요 |
| 자동완성 | 현재 구현 완료 | 다시 구현 필요 |
| 확장성 | 높음 | 충분함 |
| 구현 난이도 | 현재 유지 쉬움 | 전환 비용 큼 |
| Lighthouse 개선 기대 | 제한적 | 큼 |

---

## 8. 프로젝트 기준 리스크 비교

### 8.1 Monaco 유지 리스크

- 성능 점수 개선 폭이 제한적이다.
- 에디터 표시 지연이 사용자에게 보일 수 있다.
- 추후 기능이 늘어날수록 Monaco 주변 최적화 코드가 계속 필요할 수 있다.

### 8.2 CodeMirror 전환 리스크

- 현재 잘 동작하는 편집기 기능을 다시 구현해야 한다.
- 진단 표시, 자동완성, 포커스 이동에서 회귀 가능성이 높다.
- WBS의 다른 미완료 항목을 미루고 에디터 교체에 시간이 들어간다.

---

## 9. 권장 판단

현재 프로젝트 기준 권장 방향은 다음과 같다.

### 단기 권장

당장 전면 교체는 보류한다.

이유:

- 현재 에디터 기능이 이미 Monaco 기준으로 안정화 단계에 들어가 있다.
- 지금 남은 WBS 항목은 orbit camera, context lost, 디버그 패널, IndexedDB 검토 등 에디터 외 작업도 많다.
- 즉 지금 시점의 전면 교체는 기능 진척보다 교체 비용이 더 크다.

### 중기 권장

CodeMirror 6 최소 PoC를 별도 브랜치 또는 작은 스파이크 작업으로 검토한다.

PoC 범위:

- 단일 fragment editor
- GLSL 컬러링
- `Ctrl + Space` 자동완성
- 진단 marker 1종
- 콘솔 클릭 이동

이 PoC로 다음을 비교한다.

- 번들 크기 감소 폭
- 초기 표시 속도
- 구현 복잡도
- 기존 Monaco 기능 대체 가능성

### 최종 판단 기준

다음 조건을 만족하면 CodeMirror 6 전환 가치가 높다.

- 에디터 관련 JS가 체감 가능 수준으로 감소
- 자동완성/marker/탭 UX를 큰 회귀 없이 재현 가능
- 1~2 스프린트 안에 전환 비용을 감당 가능

반대로 아래 조건이면 Monaco 유지가 맞다.

- 번들 절감 폭이 예상보다 작음
- GLSL 지원 품질이 낮음
- 에디터 회귀가 많이 발생함

---

## 10. 권장 후속 작업

우선순위는 다음 순서가 적절하다.

1. `CodeMirror 6 최소 PoC` 문서화 및 범위 확정
2. fragment editor 단일 버전 PoC 구현
3. 번들 크기, Lighthouse, 기능 회귀 비교 측정
4. 결과가 충분히 좋으면 Monaco 교체 계획 수립

---

## 11. 결론

CodeMirror 6은 현재 프로젝트의 가장 큰 프론트엔드 성능 리스크인 Monaco 번들 크기를 줄일 가능성이 높다. 다만 현재 구현된 편집기 기능을 상당 부분 다시 붙여야 하므로, 바로 교체하는 것은 위험하다.

따라서 현재 시점의 합리적인 결론은 다음과 같다.

- **즉시 전면 교체는 보류**
- **작은 PoC로 전환 가능성 먼저 검증**
- **PoC 결과가 충분할 때만 실제 교체 진행**

이 방향이 현재 프로젝트의 기능 안정성과 성능 개선 가능성을 함께 지키는 가장 보수적인 선택이다.
