# Post Process 사용자 정의 N-Pass Chain WBS

## 1. Pass Chain 상태

### 1.1 `PostProcessPass` 타입 정의
- 설명: 개별 post pass를 표현하는 타입을 정의한다.
- 선행 작업: 없음
- 산출물: `id`, `name`, `enabled`, `source`
- 완료 기준:
  - pass 하나를 독립적으로 표현할 수 있다.

### 1.2 `PostProcessChainState` 타입 정의
- 설명: 전체 post chain 상태를 정의한다.
- 선행 작업: 1.1
- 산출물: `enabled`, `passes`
- 완료 기준:
  - chain 전체 상태를 표현할 수 있다.

### 1.3 기본 pass 1개 생성
- 설명: 초기 상태에 기본 post pass 1개를 만든다.
- 선행 작업: 1.2
- 산출물: 기본 pass 초기값
- 완료 기준:
  - 앱 시작 시 최소 pass 1개가 존재한다.

### 1.4 기존 단일 post source 구조 제거
- 설명: `postProcessSource` 단일 구조를 새 chain 상태로 치환한다.
- 선행 작업: 1.2, 1.3
- 산출물: App 상태 전환
- 완료 기준:
  - post source가 pass 목록 구조로 바뀐다.

## 2. 에디터 Pass 목록 구조

### 2.1 pass 목록 탭 UI 추가
- 설명: post 영역을 단일 탭이 아니라 pass 목록 구조로 바꾼다.
- 선행 작업: 1.x
- 산출물: pass 목록 UI
- 완료 기준:
  - pass별 탭 또는 목록 선택이 가능하다.

### 2.2 pass 추가 기능
- 설명: 사용자가 새 pass를 추가할 수 있게 한다.
- 선행 작업: 2.1
- 산출물: `Pass 추가` UI
- 완료 기준:
  - 새 pass가 목록에 추가된다.

### 2.3 pass 삭제 기능
- 설명: 사용자가 pass를 삭제할 수 있게 한다.
- 선행 작업: 2.1
- 산출물: `Pass 삭제` UI
- 완료 기준:
  - 기존 pass를 제거할 수 있다.

### 2.4 pass 이름 변경 기능
- 설명: 사용자가 각 pass 이름을 수정할 수 있게 한다.
- 선행 작업: 2.1
- 산출물: 이름 편집 UI
- 완료 기준:
  - pass 표시 이름을 바꿀 수 있다.

### 2.5 pass 순서 이동 기능
- 설명: 사용자가 pass 순서를 이동할 수 있게 한다.
- 선행 작업: 2.1
- 산출물: move up/down 또는 drag 정렬
- 완료 기준:
  - 순서가 렌더 순서에 반영된다.

### 2.6 선택된 pass source 편집 연결
- 설명: 선택된 pass source를 CodeMirror가 편집하게 연결한다.
- 선행 작업: 2.1
- 산출물: 선택 pass 편집 경로
- 완료 기준:
  - pass별 shader source를 수정할 수 있다.

## 3. 렌더러 N-Pass 루프

### 3.1 ping-pong target A 상태 추가
- 설명: post chain용 target A를 추가한다.
- 선행 작업: 없음
- 산출물: target A 상태
- 완료 기준:
  - target A를 생성/관리할 수 있다.

### 3.2 ping-pong target B 상태 추가
- 설명: post chain용 target B를 추가한다.
- 선행 작업: 없음
- 산출물: target B 상태
- 완료 기준:
  - target B를 생성/관리할 수 있다.

### 3.3 target A/B 생성 및 resize 재생성
- 설명: viewport 크기에 맞는 post target A/B를 생성하고 resize 시 다시 만든다.
- 선행 작업: 3.1, 3.2
- 산출물: target 생성 코드
- 완료 기준:
  - resize 후에도 chain이 유지된다.

### 3.4 pass별 program 관리
- 설명: 각 pass source에 대응하는 WebGLProgram을 생성/보관한다.
- 선행 작업: 1.x
- 산출물: pass id -> program 관리
- 완료 기준:
  - pass마다 독립적인 compile/link가 가능하다.

### 3.5 pass 순차 렌더 루프 구현
- 설명: pass 목록 순서대로 A/B target을 번갈아 사용해 렌더한다.
- 선행 작업: 3.3, 3.4
- 산출물: N-pass render loop
- 완료 기준:
  - pass 순서가 실제 렌더 순서로 반영된다.

### 3.6 마지막 pass screen output
- 설명: 마지막 활성 pass는 기본 framebuffer로 출력한다.
- 선행 작업: 3.5
- 산출물: final screen output 경로
- 완료 기준:
  - 마지막 pass가 final composite 역할을 한다.

### 3.7 chain off / empty pass 우회 경로
- 설명: chain이 꺼져 있거나 활성 pass가 없을 때 scene copy를 유지한다.
- 선행 작업: 3.6
- 산출물: bypass 경로
- 완료 기준:
  - 검정 화면 없이 안전하게 fallback 한다.

## 4. Pass 입력 / Uniform 설계

### 4.1 `uSceneColor` 입력 공급
- 설명: 모든 pass에 원본 scene texture를 입력으로 공급한다.
- 선행 작업: 3.5
- 산출물: `uSceneColor`
- 완료 기준:
  - 모든 pass가 원본 scene을 참조할 수 있다.

### 4.2 `uPrevPassColor` 입력 공급
- 설명: 각 pass에 직전 활성 pass 결과를 공급한다.
- 선행 작업: 3.5
- 산출물: `uPrevPassColor`
- 완료 기준:
  - chain형 효과 구성이 가능하다.

### 4.3 기본 공통 uniform 공급
- 설명: `uResolution`, `uTime`를 모든 pass에 공급한다.
- 선행 작업: 3.5
- 산출물: 공통 uniform 경로
- 완료 기준:
  - 각 pass가 공통 화면 정보와 시간을 사용할 수 있다.

## 5. Diagnostics / Inspector

### 5.1 pass별 compile diagnostics 구조 확장
- 설명: diagnostics를 pass id 기준으로 분리한다.
- 선행 작업: 3.4
- 산출물: pass별 diagnostics
- 완료 기준:
  - 어느 pass가 실패했는지 식별할 수 있다.

### 5.2 pass별 editor marker 연동
- 설명: 선택된 pass source에 marker를 표시한다.
- 선행 작업: 5.1
- 산출물: pass marker
- 완료 기준:
  - 오류 줄을 pass별로 표시할 수 있다.

### 5.3 pass별 console 출력
- 설명: console에 pass id / pass name 기준 오류를 출력한다.
- 선행 작업: 5.1
- 산출물: pass별 console line
- 완료 기준:
  - 콘솔에서 특정 pass 오류를 식별할 수 있다.

### 5.4 pass별 active uniform reflection
- 설명: pass별 shader uniform을 reflection한다.
- 선행 작업: 3.4
- 산출물: pass별 property 정의
- 완료 기준:
  - pass별 uniform 목록을 읽을 수 있다.

### 5.5 pass별 inspector 분리
- 설명: 인스펙터를 pass 단위로 분리한다.
- 선행 작업: 5.4
- 산출물: pass별 inspector UI
- 완료 기준:
  - 특정 pass의 uniform을 독립적으로 수정할 수 있다.

## 6. 저장 / 복원

### 6.1 snapshot 스키마 확장
- 설명: pass chain 전체를 저장 구조에 포함한다.
- 선행 작업: 1.x
- 산출물: `postProcessPasses`
- 완료 기준:
  - 저장 구조에 pass 목록이 포함된다.

### 6.2 local save/load 반영
- 설명: 로컬 저장과 불러오기에 pass chain을 포함한다.
- 선행 작업: 6.1
- 산출물: local persistence 확장
- 완료 기준:
  - 로컬 저장본에서 pass chain이 복원된다.

### 6.3 JSON export/import 반영
- 설명: JSON 내보내기와 가져오기에 pass chain을 포함한다.
- 선행 작업: 6.1
- 산출물: JSON persistence 확장
- 완료 기준:
  - JSON 파일에서 pass chain이 복원된다.

## 7. 안정화

### 7.1 pass별 WebGL state 정리
- 설명: 각 pass 진입 시 framebuffer, viewport, depth, blend, cull 상태를 명시적으로 정리한다.
- 선행 작업: 3.x
- 산출물: 상태 정리 코드
- 완료 기준:
  - pass 전환 시 state 꼬임이 없다.

### 7.2 ping-pong lifecycle 정리
- 설명: target A/B 생성, 재생성, 해제를 정리한다.
- 선행 작업: 3.x
- 산출물: target lifecycle 정리
- 완료 기준:
  - resize / dispose 시 누수가 없다.

### 7.3 pass 추가/삭제/재정렬 직후 안정화
- 설명: 구조가 바뀐 직후에도 렌더가 깨지지 않도록 정리한다.
- 선행 작업: 2.x, 3.x
- 산출물: 구조 변경 안정화
- 완료 기준:
  - 목록 변경 직후 검정 화면이 발생하지 않는다.

### 7.4 recompilation 안정화
- 설명: pass source 수정과 compile 실패/성공 전환이 안정적으로 동작하게 한다.
- 선행 작업: 3.x, 5.x
- 산출물: 재컴파일 안정화
- 완료 기준:
  - 실패한 pass가 있어도 마지막 성공 결과 유지 정책을 적용할 수 있다.
