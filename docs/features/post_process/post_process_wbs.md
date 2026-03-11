# Post Process WBS

## 1. 렌더 타깃 기반 구조

### 1.1 scene framebuffer 상태 정의
- 설명: renderer에 scene pass 전용 framebuffer 상태를 추가한다.
- 선행 작업: 없음
- 산출물: framebuffer 관련 필드
- 완료 기준:
  - color/depth/offscreen 상태가 renderer 내부에 정의됨

### 1.2 scene color texture 생성
- 설명: scene pass 결과를 저장할 color texture를 만든다.
- 선행 작업: 1.1
- 산출물: color attachment texture 생성 코드
- 완료 기준:
  - viewport 크기에 맞는 color texture가 생성됨

### 1.3 depth renderbuffer 생성
- 설명: scene pass depth test를 위한 depth attachment를 만든다.
- 선행 작업: 1.1
- 산출물: depth renderbuffer 생성 코드
- 완료 기준:
  - scene pass depth test가 유지됨

### 1.4 framebuffer attachment 연결
- 설명: color texture와 depth renderbuffer를 framebuffer에 연결한다.
- 선행 작업: 1.2, 1.3
- 산출물: framebuffer 설정 코드
- 완료 기준:
  - framebuffer completeness 검사를 통과함

### 1.5 resize 시 offscreen target 재생성
- 설명: viewport 리사이즈 시 offscreen 자원을 다시 만든다.
- 선행 작업: 1.4
- 산출물: resize 재생성 경로
- 완료 기준:
  - resize 후 post pass가 깨지지 않음

## 2. post pass 기본 렌더

### 2.1 고정 post vertex shader 추가
- 설명: fullscreen quad용 고정 vertex shader를 추가한다.
- 선행 작업: 없음
- 산출물: 고정 post vertex shader 템플릿
- 완료 기준:
  - fullscreen quad 렌더에 사용 가능

### 2.2 기본 post fragment shader 추가
- 설명: sceneColor를 그대로 출력하는 기본 후처리 shader를 추가한다.
- 선행 작업: 2.1
- 산출물: 기본 post fragment shader
- 완료 기준:
  - post pass 없이 보이던 결과와 동일한 화면이 출력됨

### 2.3 post process program 생성
- 설명: post pass용 shader compile/link 구조를 추가한다.
- 선행 작업: 2.1, 2.2
- 산출물: post program 생성 코드
- 완료 기준:
  - post pass program이 정상 링크됨

### 2.4 scene pass / post pass 순서 분리
- 설명: 현재 단일 렌더 경로를 2패스로 분리한다.
- 선행 작업: 1.x, 2.3
- 산출물: pass 분리된 render 루프
- 완료 기준:
  - scene -> post 순서로 화면에 출력됨

### 2.5 post uniform 공급
- 설명: `uSceneColor`, `uResolution`, `uTime`을 공급한다.
- 선행 작업: 2.4
- 산출물: post pass uniform 적용 코드
- 완료 기준:
  - `uSceneColor` 샘플링이 가능함

## 3. 에디터 3번째 탭

### 3.1 post process source 상태 추가
- 설명: App 상태에 post process source를 추가한다.
- 선행 작업: 없음
- 산출물: `postProcessSource`
- 완료 기준:
  - post shader 소스를 별도로 보관 가능

### 3.2 ShaderEditorPanel 탭 확장
- 설명: `Post Process` 탭을 추가한다.
- 선행 작업: 3.1
- 산출물: 3탭 UI
- 완료 기준:
  - `Vertex / Fragment / Post Process` 탭 전환 가능

### 3.3 CodeMirror stage 확장
- 설명: post stage를 editor 내부 stage로 추가한다.
- 선행 작업: 3.2
- 산출물: 3번째 stage editor 지원
- 완료 기준:
  - post 탭도 동일한 에디터 경험을 제공함

### 3.4 기본 post shader 프리셋 반영
- 설명: 새 탭이 비어 있지 않도록 기본 source를 넣는다.
- 선행 작업: 3.1
- 산출물: 기본 post process source
- 완료 기준:
  - 처음부터 후처리 화면이 동작함

## 4. 컴파일/진단/오류 처리

### 4.1 post shader compile 요청 경로 추가
- 설명: 기존 compile 흐름에 post shader를 포함한다.
- 선행 작업: 2.3, 3.1
- 산출물: post compile 경로
- 완료 기준:
  - compile 버튼이 post shader도 함께 처리함

### 4.2 diagnostics stage 확장
- 설명: `post` stage를 진단 구조에 추가한다.
- 선행 작업: 4.1
- 산출물: render diagnostics 확장
- 완료 기준:
  - post 오류가 별도 stage로 기록됨

### 4.3 console 출력 확장
- 설명: post shader 오류를 콘솔에 표시한다.
- 선행 작업: 4.2
- 산출물: console line 확장
- 완료 기준:
  - console에서 post 오류를 구분 가능

### 4.4 에디터 marker 연동
- 설명: post 탭에도 marker를 표시한다.
- 선행 작업: 4.2, 3.3
- 산출물: post editor marker
- 완료 기준:
  - post shader 오류 위치가 에디터에 표시됨

## 5. reflection / inspector

### 5.1 post active uniform reflection
- 설명: post program에서 active uniform을 읽는다.
- 선행 작업: 2.3
- 산출물: post uniform reflection 결과
- 완료 기준:
  - post shader uniform 목록 획득 가능

### 5.2 예약 uniform 제외 규칙 추가
- 설명: `uSceneColor`, `uResolution`, `uTime` 등을 인스펙터에서 제외한다.
- 선행 작업: 5.1
- 산출물: post builtin uniform 규칙
- 완료 기준:
  - 엔진 제공 uniform이 인스펙터에 나타나지 않음

### 5.3 인스펙터 그룹 분리
- 설명: `Scene`, `Post Process` 그룹으로 표시한다.
- 선행 작업: 5.1
- 산출물: grouped inspector 확장
- 완료 기준:
  - scene/post uniform이 분리되어 보임

### 5.4 post material values 상태 추가
- 설명: post shader 사용자 uniform 값을 따로 저장한다.
- 선행 작업: 5.1
- 산출물: post material value 상태
- 완료 기준:
  - post uniform 값 변경이 렌더에 반영됨

## 6. 저장/불러오기

### 6.1 project snapshot 스키마 확장
- 설명: post source와 상태를 저장 구조에 추가한다.
- 선행 작업: 3.1, 5.4
- 산출물: snapshot 타입 확장
- 완료 기준:
  - 저장 구조에 post 항목 포함

### 6.2 local save/load 반영
- 설명: 로컬 저장과 불러오기에 post 상태를 반영한다.
- 선행 작업: 6.1
- 산출물: local persistence 확장
- 완료 기준:
  - 로컬 저장본에 post 상태가 포함됨

### 6.3 JSON export/import 반영
- 설명: JSON 내보내기/가져오기에 post 상태를 반영한다.
- 선행 작업: 6.1
- 산출물: JSON persistence 확장
- 완료 기준:
  - JSON로 post 상태를 복원 가능

## 7. 안정화

### 7.1 pass별 WebGL 상태 정리
- 설명: blend/depth/cull/viewport를 pass마다 명시적으로 세팅한다.
- 선행 작업: 2.4
- 산출물: 상태 정리 코드
- 완료 기준:
  - scene/post 전환 시 상태 오염 없음

### 7.2 framebuffer dispose 정리
- 설명: renderer dispose 시 framebuffer 관련 GPU 자원을 해제한다.
- 선행 작업: 1.x
- 산출물: dispose 경로
- 완료 기준:
  - GPU 자원 누수 없음

### 7.3 post on/off 토글 검토
- 설명: 필요 시 post process를 끄고 scene 결과를 직접 출력하는 옵션을 검토한다.
- 선행 작업: 2.4
- 산출물: 토글 여부 결정 또는 구현
- 완료 기준:
  - 후처리 사용 여부를 제어 가능하거나, 미구현 사유가 문서화됨

### 7.4 resize / recompilation 안정화
- 설명: resize, shader 재컴파일, asset 변경 시 post pass가 안정적으로 유지되게 한다.
- 선행 작업: 1.x ~ 6.x
- 산출물: 안정화 보강
- 완료 기준:
  - 주요 사용자 흐름에서 post pass가 깨지지 않음
