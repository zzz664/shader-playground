# Post Process 스프린트 계획

## 목적

`Post Process` 탭과 2패스 렌더 구조를 작은 스프린트 단위로 나눠 구현한다.

## 스프린트 구성 원칙

- framebuffer 기반 구조를 먼저 만든다.
- 후처리 탭은 그 다음에 붙인다.
- 진단, 인스펙터, 저장/복원은 마지막에 확장한다.

## Sprint A. Scene Framebuffer 도입

### 범위

- scene framebuffer
- scene color texture
- depth renderbuffer
- framebuffer completeness 검사
- resize 재생성

### 포함 WBS

- `1.1` ~ `1.5`

### 수정 예상 파일

- `src/core/renderer/WebGLQuadRenderer.ts`

### 완료 기준

- scene pass 결과를 offscreen framebuffer에 기록할 수 있다.

### 리스크

- resize 시 incomplete framebuffer
- color/depth attachment 해제 누락

## Sprint B. Post Pass 기본 출력

### 범위

- 고정 post vertex shader
- 기본 post fragment shader
- fullscreen quad 후처리 출력
- `uSceneColor`, `uResolution`, `uTime`

### 포함 WBS

- `2.1` ~ `2.5`

### 수정 예상 파일

- `src/core/renderer/WebGLQuadRenderer.ts`
- `src/core/shader/templates/defaultShaders.ts`

### 완료 기준

- scene -> post -> 화면 순서로 결과가 출력된다.

### 리스크

- feedback loop
- post pass 상태 오염

## Sprint C. 에디터 3번째 탭

### 범위

- `Post Process` 탭
- post shader source 상태
- CodeMirror 3번째 stage

### 포함 WBS

- `3.1` ~ `3.4`

### 수정 예상 파일

- `src/App.tsx`
- `src/features/editor/ShaderEditorPanel.tsx`
- `src/features/editor/CodeMirrorShaderEditor.tsx`
- `src/core/shader/templates/defaultShaders.ts`

### 완료 기준

- 사용자가 post shader를 편집하고 적용할 수 있다.

### 리스크

- 에디터 stage 전환 시 diagnostics 혼선

## Sprint D. Post 진단/콘솔/에러 마커

### 범위

- post compile 경로
- `post` stage diagnostics
- console 출력
- 에디터 marker

### 포함 WBS

- `4.1` ~ `4.4`

### 수정 예상 파일

- `src/App.tsx`
- `src/shared/types/renderDiagnostics.ts`
- `src/shared/utils/parseDiagnostics.ts`
- `src/features/console/ShaderConsolePanel.tsx`
- `src/features/editor/CodeMirrorShaderEditor.tsx`

### 완료 기준

- post shader 오류를 별도 stage로 보고 수정할 수 있다.

### 리스크

- stage 구분 누락
- 콘솔 클릭 시 잘못된 탭 포커스

## Sprint E. Post Process 인스펙터

### 범위

- post active uniform reflection
- builtin uniform 제외
- `Scene / Post Process` 그룹 분리
- post material values

### 포함 WBS

- `5.1` ~ `5.4`

### 수정 예상 파일

- `src/core/shader/reflection/*`
- `src/App.tsx`
- `src/features/inspector/MaterialInspectorPanel.tsx`
- `src/shared/types/materialProperty.ts`

### 완료 기준

- post shader uniform이 인스펙터에서 제어된다.

### 리스크

- scene/pass uniform 이름 충돌

## Sprint F. 저장/불러오기 반영

### 범위

- snapshot 스키마 확장
- local save/load
- JSON export/import

### 포함 WBS

- `6.1` ~ `6.3`

### 수정 예상 파일

- `src/shared/types/projectSnapshot.ts`
- `src/shared/utils/projectPersistence.ts`
- `src/App.tsx`

### 완료 기준

- post process 코드와 상태가 복원된다.

### 리스크

- 구버전 스냅샷 호환

## Sprint G. 안정화

### 범위

- pass별 WebGL 상태 정리
- framebuffer dispose
- post on/off 검토
- resize / recompilation 안정화

### 포함 WBS

- `7.1` ~ `7.4`

### 수정 예상 파일

- `src/core/renderer/WebGLQuadRenderer.ts`
- `src/App.tsx`

### 완료 기준

- 주요 사용자 흐름에서 post pass가 안정적으로 유지된다.

### 리스크

- pass 상태 누수
- 리소스 dispose 누락

## 권장 진행 순서

1. Sprint A
2. Sprint B
3. Sprint C
4. Sprint D
5. Sprint E
6. Sprint F
7. Sprint G

## 현재 권장 세션 시작점

가장 먼저 시작할 세션은 `Sprint A`다.

이유:

- framebuffer 기반이 먼저 없으면 post 탭을 붙여도 실제 후처리 결과를 볼 수 없다.
- 렌더러 구조를 먼저 2패스로 나누는 편이 이후 에디터/인스펙터 작업보다 선행돼야 한다.
