# 셰이더 플레이그라운드 이용 가이드

웹 기반 셰이더 플레이그라운드를 처음 사용하는 사용자를 위한 안내 문서입니다.  
이 문서는 화면 구성, 기본 작업 흐름, 모델/텍스처 업로드, 인스펙터, 멀티 패스 포스트 프로세스 사용법까지 포함합니다.

![앱 전체 레이아웃](./guide/overview-layout.svg)

## 1. 화면 구성

앱은 크게 다섯 영역으로 나뉩니다.

- `FBX Import`: 모델 업로드와 모델 제거
- `Project`: 저장, 불러오기, JSON 내보내기/가져오기
- `Compile`: 자동 컴파일, 수동 컴파일, 마지막 컴파일 결과
- `Viewport`: 장면 미리보기와 카메라/렌더 설정
- `Editor / Console / Asset / Inspector`: 셰이더 작성, 오류 확인, 텍스처/모델 자산 관리, uniform 편집

### 상단 패널

- `FBX Import`
  - `.fbx` 파일과 관련 텍스처 파일을 함께 업로드합니다.
  - 업로드된 모델 정보와 경고를 확인할 수 있습니다.
- `Project`
  - 현재 프로젝트를 로컬 저장소에 저장합니다.
  - 로컬 저장본을 다시 불러옵니다.
  - JSON 파일로 내보내거나 가져옵니다.
- `Compile`
  - `Auto Compile`이 켜져 있으면 에디터 수정 시 자동으로 다시 컴파일됩니다.
  - 수동 컴파일이 필요하면 `Compile` 버튼을 사용합니다.

## 2. 기본 작업 흐름

1. `fragmentShader` 또는 `vertexShader` 탭에서 셰이더를 수정합니다.
2. 필요하면 `Post Process` 탭에서 후처리 패스를 수정합니다.
3. `Viewport`에서 결과를 확인합니다.
4. `Inspector`에서 사용자 uniform 값을 조절합니다.
5. 필요하면 `Project`에서 현재 상태를 저장합니다.

## 3. 셰이더 편집

에디터는 세 개의 탭으로 구성됩니다.

- `vertexShader`
- `fragmentShader`
- `postProcess`

### 에디터 사용 팁

- `Ctrl + Space`: 자동완성 제안 호출
- 오류가 발생하면 해당 줄에 마커가 표시됩니다.
- 하단 `Console`에서 오류 항목을 클릭하면 해당 줄로 이동합니다.

### Fragment 타겟 설정

`fragmentShader` 탭에서는 `Target`을 설정할 수 있습니다.

- `RGBA8`
  - 일반적인 8비트 렌더 타겟
- `RGBA16F`
  - 더 넓은 값 범위를 위한 16비트 부동소수점 렌더 타겟

이 값은 scene 렌더 타겟 포맷에 반영되며, 저장/불러오기에도 포함됩니다.

## 4. 인스펙터 사용

인스펙터는 탭 형식으로 구성됩니다.

- `Scene`
- `Pass 1`
- `Pass 2`
- `...`

각 탭은 해당 scope의 uniform만 보여줍니다.

### 인스펙터에서 보이는 항목

- `float / int`: 숫자 입력 또는 슬라이더
- `bool`: 체크박스
- `vec3 / vec4`: 벡터 입력 또는 색상 입력
- `sampler2D`: 텍스처 업로드와 텍스처 선택

예약 uniform은 인스펙터에 표시되지 않습니다.

- `uTime`
- `uResolution`
- `uSceneColor`
- `uPrevPassColor`
- `uPassNColor`
- `uModel`
- `uView`
- `uProj`

## 5. 텍스처 업로드와 Asset Browser

`Asset Browser`에서는 현재 프로젝트에 등록된 텍스처와 모델을 확인할 수 있습니다.

- 텍스처 삭제
- 모델 제거
- 텍스처별 `Wrap S / Wrap T` 설정

텍스처 반복 방식:

- `Repeat`
- `Clamp`
- `Mirror`

## 6. Viewport 사용

`Viewport`에서는 렌더링 결과를 확인하고 기본 렌더 설정을 바꿀 수 있습니다.

- `Screen / Model` 모드 전환
- 기본 geometry 선택
- `Src Blend / Dst Blend` 설정
- `Post On / Off`
- 해상도 스케일 설정

### 카메라 조작

- 모델 모드에서 마우스 드래그: Orbit 회전
- 마우스 휠: 줌 인/아웃
- `Reset`: 카메라 상태 초기화
- `R` 키: 셰이더 재생 시간 리셋

## 7. 모델 업로드

모델은 `FBX Import`에서 업로드합니다.

- `.fbx` 파일 선택
- 관련 텍스처 파일도 함께 선택 가능
- 업로드 후 모델은 뷰포트에 표시됩니다.

모델을 지우려면 `Clear`를 사용합니다.

## 8. 멀티 패스 포스트 프로세스

`postProcess` 탭에서는 패스를 여러 개 만들 수 있습니다.

![멀티 패스 체인](./guide/post-pass-chain.svg)

### 패스 목록

- `+ Pass`: 새 패스 추가
- 패스 이름 변경
- 위/아래 이동
- 삭제
- 각 패스별 `Target` 포맷 선택

### 패스에서 사용할 수 있는 입력

- `uSceneColor`
  - 원본 scene 결과
- `uPrevPassColor`
  - 직전 활성 pass 결과
- `uPass1Color`, `uPass2Color`, ...
  - 특정 pass 결과

예:

```glsl
uniform sampler2D uSceneColor;
uniform sampler2D uPass1Color;

in vec2 vUv;
out vec4 outColor;

void main() {
  vec4 sceneColor = texture(uSceneColor, vUv);
  vec4 pass1Color = texture(uPass1Color, vUv);
  outColor = mix(sceneColor, pass1Color, 0.5);
}
```

## 9. 저장과 불러오기

프로젝트 저장 시 아래 정보가 함께 저장됩니다.

- vertex / fragment / post process 소스
- post pass 목록과 순서
- active post pass
- scene / post 렌더 타겟 포맷
- material values
- texture assets
- model asset
- viewport 설정

불러오면 마지막 상태를 그대로 복원합니다.

## 10. 자주 겪는 문제

### 화면이 검정색으로 나온다

- 컴파일 오류가 있는지 `Console`을 확인합니다.
- `Post Off` 상태인지 확인합니다.
- 현재 pass에서 `outColor`를 실제로 쓰고 있는지 확인합니다.

### 텍스처가 안 보인다

- `Inspector`에서 해당 `sampler2D`에 텍스처가 연결되어 있는지 확인합니다.
- `Asset Browser`에서 텍스처가 삭제되지 않았는지 확인합니다.

### 특정 pass 결과를 다른 pass에서 못 읽는다

- `uPrevPassColor`는 직전 pass만 가리킵니다.
- 특정 pass를 직접 참조하려면 `uPass1Color`, `uPass2Color`처럼 선언해야 합니다.
- 아직 실행되지 않은 미래 pass 결과는 참조할 수 없습니다.

## 11. 권장 시작 예제

처음 사용할 때는 아래 순서를 권장합니다.

1. `fragmentShader`만 수정해 기본 색 변화를 확인
2. `Inspector`에 표시되는 uniform 조절
3. 텍스처 업로드 후 `sampler2D` 연결
4. `Post Process` 패스 1개 추가
5. `uSceneColor`와 `uPrevPassColor`를 사용한 간단한 합성 테스트
