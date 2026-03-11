# 성능 점검 및 최적화 메모

## 1. 문서 목적

이 문서는 현재 셰이더 플레이그라운드의 Lighthouse 성능 점수 저하 원인을 코드 기준으로 점검하고, 이번 작업에서 반영한 최적화와 남은 리스크를 정리하기 위한 문서이다.

기준 점검 대상은 다음과 같다.

- Monaco Editor 번들 크기
- 초기 진입 번들 크기
- 런타임 렌더링 비용
- 자동 저장과 에셋 직렬화 비용
- FBX 로딩 및 이미지 처리 비용

---

## 2. 이번 작업에서 적용한 최적화

### 2.0 런타임 성능 P0 항목 반영

이번 턴에서는 P0 중 런타임 관련 항목도 함께 반영했다.

- `12.4 해상도 스케일 옵션`
- `12.5 비활성 탭 처리`

적용 내용:

- viewport에 `50% / 75% / 100%` 해상도 스케일 옵션 추가
- `resolutionScale`에 따라 실제 캔버스 렌더 해상도를 축소
- 비활성 탭 상태에서 `requestAnimationFrame` 루프 중지
- 탭 복귀 시 렌더 루프 재개

관련 파일:

- `src/shared/types/scenePreview.ts`
- `src/core/renderer/WebGLQuadRenderer.ts`
- `src/features/viewport/ViewportPanel.tsx`
- `src/App.tsx`

### 2.1 Monaco Editor 지연 로드 적용

초기 상태에서는 `App`가 `ShaderEditorPanel`을 즉시 import하고, 그 안에서 `@monaco-editor/react`와 `monaco-editor`를 바로 불러와 첫 진입 번들에 Monaco가 포함되었다.

이번 작업에서는 아래처럼 구조를 분리했다.

- `ShaderEditorPanel.tsx`
  - 가벼운 wrapper 역할만 수행
  - `React.lazy()` + `Suspense`로 Monaco 에디터를 지연 로드
- `MonacoShaderEditor.tsx`
  - 실제 Monaco 통합 로직 분리

관련 파일:

- `src/features/editor/ShaderEditorPanel.tsx`
- `src/features/editor/MonacoShaderEditor.tsx`

효과:

- Monaco가 초기 메인 청크에서 분리됨
- 첫 화면 표시 시 에디터가 꼭 필요하지 않은 시점의 JS 부담이 줄어듦

### 2.2 Vite manualChunks 적용

`vite.config.ts`에 `manualChunks`를 추가해 주요 서드파티 의존성을 분리했다.

- `monaco`
- `three`
- `react-vendor`

관련 파일:

- `vite.config.ts`

효과:

- 단일 대형 청크를 여러 청크로 분해
- 브라우저 캐시 효율 개선
- 최초 실행 시 앱 핵심 UI 청크와 무거운 라이브러리 청크를 분리

### 2.3 FBX 로더 지연 import 적용

초기 상태에서는 `App.tsx`가 `loadFbxAsset`를 정적 import하고 있었고, 그 안에서 `three/examples/jsm/loaders/FBXLoader.js`를 불러오기 때문에 FBX 관련 코드가 초기 번들에 포함될 가능성이 있었다.

이번 작업에서는 `handleModelUpload()` 내부에서 동적 import하도록 변경했다.

관련 파일:

- `src/App.tsx`

효과:

- FBX 업로드를 사용하지 않는 첫 진입 경로에서 `FBXLoader` 실행 비용을 늦춤
- 모델 업로드 기능이 필요한 시점에만 관련 코드 로드

---

## 3. 빌드 결과 비교

### 3.1 최적화 전

이전 빌드 결과에서는 주요 JS가 사실상 하나의 대형 청크로 묶여 있었다.

- `assets/index-C7owIA2r.js`: 약 `3,051.88 kB`

이 상태는 Lighthouse의 다음 항목에 직접 불리하다.

- 초기 JS 평가 시간
- main-thread work
- TBT
- LCP 이전 스크립트 비용

### 3.2 최적화 후

이번 작업 후 빌드 결과는 다음과 같이 분리되었다.

- `assets/index-C7-EVb14.js`: 약 `57.49 kB`
- `assets/react-vendor-DKvKP9fu.js`: 약 `192.48 kB`
- `assets/three-bWAYZnfe.js`: 약 `224.69 kB`
- `assets/monaco-DCCsD4ep.js`: 약 `2,561.43 kB`
- `assets/MonacoShaderEditor-BqaCNLG7.js`: 약 `7.20 kB`
- `assets/loadFbxAsset-C7LP2c4m.js`: 약 `3.91 kB`

정리:

- 앱 초기 엔트리 청크는 `3MB대`에서 `57KB대`로 크게 감소했다.
- 다만 `monaco` 청크 자체는 여전히 매우 크다.
- 즉, 이번 최적화는 “초기 진입 성능”에는 효과가 있지만, “에디터를 실제 여는 시점의 다운로드 비용”은 여전히 남아 있다.

---

## 3.5 Lighthouse 빨간 항목별 원인 정리

현재 보고된 빨간 항목은 다음과 같다.

- `Minify JavaScript`
- `Reduce unused JavaScript`
- `Forced reflow`
- `Network dependency tree`
- `Page prevented back/forward cache restoration`

### Minify JavaScript / Reduce unused JavaScript

원인:

- `monaco-editor` 코어 청크가 매우 크다.
- 첫 화면에서 editor panel이 즉시 mount되면 Monaco 다운로드와 평가가 너무 빨라져 초기 페이지 부하에 섞인다.
- `three`와 `FBXLoader`가 모델 업로드와 무관한 초기 경로에 섞이면 초기 JS 비용이 증가한다.

대응:

- Monaco를 `React.lazy()`로 분리
- editor panel에서 idle 시점까지 Monaco mount 지연
- FBX 로더를 업로드 시점 dynamic import로 전환
- Vite `manualChunks`로 `monaco / three / react-vendor` 분리

### Forced reflow

원인 후보:

- Monaco editor mount 직후 `focus()` 호출
- Monaco의 `automaticLayout`가 내부적으로 레이아웃 계산을 자주 유발
- marker 클릭 시 `revealLineInCenter()`와 focus가 즉시 호출됨

대응:

- editor mount 시 강제 `focus()` 제거
- Monaco `automaticLayout` 비활성화
- 외부 `ResizeObserver` 기반 `editor.layout()`으로 제어

### Network dependency tree

원인:

- 초기 엔트리에서 Monaco와 Three 계열 의존성이 한 번에 당겨질 때 의존 트리가 깊어진다.

대응:

- Monaco lazy chunk 분리
- FBX 로더 dynamic import
- manual chunk 분리

### Page prevented back/forward cache restoration

원인 후보:

- 페이지 이동 직전에도 WebGL 렌더 루프가 살아 있음
- viewport가 `requestAnimationFrame`을 계속 유지하고 있음

대응:

- `visibilitychange`에서 렌더 일시 중지
- `pagehide`에서 명시적으로 viewport 비활성화
- `pageshow`에서 다시 활성화

---

## 4. Monaco 번들 관련 현재 상태와 남은 이슈

### 4.1 현재 개선된 점

- 초기 메인 청크에서 Monaco 제거
- 에디터가 필요한 시점까지 로드를 지연
- CSS도 `monaco` 전용 청크로 분리

### 4.2 아직 남아 있는 문제

`monaco-editor`는 기본적으로 코드 에디터 코어 자체가 크기 때문에, lazy load만으로 청크 자체가 충분히 작아지지는 않는다.

현재 남은 문제:

1. `monaco` 청크가 여전히 `2.5MB` 이상이다.
2. GLSL 전용 에디터인데도 Monaco 코어 비용이 크다.
3. 현재는 에디터가 두 개(vertex / fragment)지만, Monaco 인스턴스와 모델 유지 비용이 계속 든다.

### 4.3 다음 최적화 후보

1. Monaco를 route-level이 아니라 panel open 시점까지 더 늦게 로드
2. 에디터가 화면에 보이지 않을 때 Monaco editor dispose 전략 검토
3. 필요하다면 Monaco 대신 CodeMirror 6로 전환 비교 검토
4. Monaco worker / 언어 리소스 로딩 범위를 더 줄일 수 있는지 검토

---

## 5. 현재 프로젝트에서 성능 저하가 발생할 수 있는 부분

아래 항목은 현재 코드 기준으로 실제 병목 가능성이 높은 부분이다.

### 5.1 연속 렌더 루프가 항상 동작함

관련 파일:

- `src/core/renderer/WebGLQuadRenderer.ts`

문제:

- `start()`에서 `requestAnimationFrame` 루프를 계속 유지한다.
- 화면이 정적인 상황, 탭이 백그라운드인 상황, 사용자가 상호작용하지 않는 상황에도 렌더가 반복된다.

영향:

- CPU / GPU 사용량 증가
- 노트북 배터리 소모 증가
- Lighthouse의 main-thread / energy 관련 지표에 불리

후속 작업:

- page visibility 기반 렌더 절감
- 정적 상태에서 conditional render 또는 저주기 렌더 검토

### 5.2 해상도 스케일 옵션 부재

관련 파일:

- `src/core/renderer/WebGLQuadRenderer.ts`

문제:

- `resize()`에서 `window.devicePixelRatio`를 그대로 적용한다.
- 고해상도 디스플레이에서는 캔버스 렌더 비용이 빠르게 증가한다.

영향:

- GPU fill-rate 비용 증가
- 프래그먼트 셰이더가 무거울수록 프레임 저하 심화

후속 작업:

- WBS `12.4 해상도 스케일 옵션` 구현

### 5.3 Auto Compile 시 셰이더 재컴파일 비용

관련 파일:

- `src/App.tsx`
- `src/features/viewport/ViewportPanel.tsx`
- `src/core/renderer/WebGLQuadRenderer.ts`

문제:

- `autoCompile`가 켜져 있으면 350ms debounce 후 재컴파일된다.
- shader compile / link / reflection / uniform location 재조회가 메인 스레드에서 발생한다.

영향:

- 입력 중 끊김 가능성
- 긴 shader에서 typing latency 증가

후속 작업:

- 변경량 기반 컴파일 정책 세분화
- 큰 입력 시 auto compile 임계값 조정 검토

### 5.4 프로젝트 자동 저장이 전체 스냅샷 직렬화를 반복함

관련 파일:

- `src/App.tsx`
- `src/shared/utils/projectPersistence.ts`
- `src/shared/utils/loadTextureAsset.ts`

문제:

- `projectSnapshot`이 매번 전체 상태를 다시 구성한다.
- 텍스처는 `data URL` 형태로 저장된다.
- `localStorage.setItem()`이 전체 JSON 문자열 직렬화를 유발한다.

영향:

- 큰 텍스처 / 모델이 있을 때 메인 스레드 부하 증가
- 입력 중 자동 저장 타이밍이 겹치면 UX 저하 가능
- `localStorage` 용량 제한에 빨리 도달할 수 있음

후속 작업:

- WBS `9.5 IndexedDB 기반 자산 저장 검토`
- autosave를 텍스트 상태와 대형 에셋 참조 저장으로 분리

### 5.5 텍스처를 data URL로 보관함

관련 파일:

- `src/shared/utils/loadTextureAsset.ts`

문제:

- 이미지 업로드 시 `blob -> data URL` 변환을 수행한다.
- base64는 원본 대비 저장 크기가 커진다.

영향:

- 메모리 사용량 증가
- 직렬화 / 역직렬화 비용 증가
- localStorage 저장 부하 증가

후속 작업:

- IndexedDB Blob 저장 전략으로 전환 검토

### 5.6 FBX 파싱이 메인 스레드에서 수행됨

관련 파일:

- `src/core/model/loader/loadFbxAsset.ts`

문제:

- `FBXLoader` 파싱, geometry 병합, normal 계산, 텍스처 매칭이 모두 메인 스레드에서 수행된다.

영향:

- 큰 FBX 업로드 시 UI 멈춤
- 업로드 직후 긴 main-thread task 발생 가능

후속 작업:

- Web Worker 파싱 검토
- 큰 모델에서 progressive feedback UI 추가

### 5.7 FBX geometry 병합 과정의 배열 재구성 비용

관련 파일:

- `src/core/model/loader/loadFbxAsset.ts`

문제:

- `mergedVertices`, `mergedIndices`를 일반 JS 배열에 누적한 뒤 마지막에 typed array로 바꾼다.
- geometry clone, `applyMatrix4`, normal 계산이 반복된다.

영향:

- 메모리 일시 증가
- 큰 모델에서 GC 압박 증가

후속 작업:

- mesh 단위 GPU 업로드 분리 검토
- 중간 배열 할당 축소

### 5.8 texture asset 동기화가 전체 목록 기준으로 반복됨

관련 파일:

- `src/core/renderer/WebGLQuadRenderer.ts`

문제:

- `syncTextureAssets()`가 전체 asset 목록을 매번 순회한다.
- 새 asset인지 확인하고 GPU texture를 생성한다.

영향:

- 텍스처 수가 많아질수록 diff 비용 증가

후속 작업:

- registry 기반 증분 업데이트 구조 검토

### 5.9 App 단일 컴포넌트 상태 집중

관련 파일:

- `src/App.tsx`

문제:

- editor, compile, asset, project, viewport 상태가 상위 컴포넌트 하나에 모여 있다.
- source 변경 시 넓은 범위의 리렌더가 일어날 수 있다.

영향:

- React commit 비용 증가
- Monaco 외 다른 패널도 자주 다시 계산될 가능성

후속 작업:

- editor / project / asset 상태 범위 분리
- 상위 상태 최소화

### 5.10 현재 코드에 깨진 문자열이 남아 있음

관련 파일:

- `src/App.tsx`
- `src/features/viewport/ViewportPanel.tsx`
- `src/core/model/loader/loadFbxAsset.ts`
- `src/features/editor/configureMonacoGlsl.ts`

문제:

- 일부 한글 문자열이 깨져 있어 사용자 메시지 품질이 떨어진다.
- 직접적인 성능 병목은 아니지만, 진단성과 유지보수성이 저하된다.

영향:

- 디버깅 비용 증가
- 로그 이해도 저하

후속 작업:

- 문자열 복구와 인코딩 정리

---

## 6. 우선순위 제안

성능 기준으로 보면 다음 순서가 적절하다.

### P0

1. Monaco lazy load 유지 + 추가 경량화 검토
2. 비활성 탭 렌더 절감
3. 해상도 스케일 옵션

### P1

1. autosave / localStorage 구조 재설계
2. FBX 파싱 메인 스레드 부하 완화
3. App 상태 분리

### P2

1. texture registry 구조 개선
2. Monaco 대체 가능성 비교
3. 문자열/인코딩 정리

---

## 7. 결론

이번 작업으로 초기 엔트리 JS는 크게 줄었고, Lighthouse의 초기 로드 성능에는 분명한 개선 효과가 기대된다. 다만 Monaco 청크 자체는 아직 매우 크고, 런타임 측면에서는 다음 항목이 여전히 주요 리스크다.

- 고정 DPR 렌더링
- 전체 프로젝트 autosave 직렬화
- 메인 스레드 FBX 파싱

즉 현재 단계에서 가장 큰 개선 포인트는 다음 두 갈래다.

1. 초기 로드: Monaco / FBX 로더의 지연 로드 유지 및 추가 경량화
2. 런타임: autosave 구조 분리, 에셋 처리 비동기화, 해상도 스케일 고도화
