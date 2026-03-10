# 인스펙터 주석 메타데이터 가이드

## 목적

셰이더 `uniform` 선언 뒤에 주석 형태의 메타데이터를 붙여 인스펙터 표시 이름, 그룹, UI 형태, 수치 범위를 제어한다.

현재 구현은 다음 코드 경로를 기준으로 동작한다.

- `src/core/shader/metadata/parseShaderMetadata.ts`
- `src/core/shader/reflection/reflectActiveUniforms.ts`
- `src/features/inspector/MaterialInspectorPanel.tsx`

## 기본 작성 형식

주석 메타데이터는 `uniform` 선언과 같은 줄의 `//` 주석에서 읽는다.

```glsl
uniform float edgePower;   // @ui slider @min 0 @max 5 @step 0.01 @label Edge Power @group Surface
uniform vec3 tintColor;    // @ui color @label Tint Color @group Surface
uniform bool useTint;      // @ui checkbox @label Use Tint @group Surface
uniform sampler2D detailTex; // @ui texture @label Detail Texture @group Noise
```

## 파싱 규칙

- 파서는 `uniform <type> <name>;` 패턴만 읽는다.
- 메타데이터는 선언 뒤 `//` 주석에서만 읽는다.
- `@키 값` 형태의 토큰만 인식한다.
- 여러 토큰은 한 줄에서 공백으로 이어서 작성할 수 있다.
- 같은 `uniform` 이름이 vertex, fragment 양쪽에 있으면 마지막으로 읽힌 메타데이터가 덮어쓴다.
- 배열 uniform은 현재 지원하지 않는다.

현재 파서 정규식 기준으로, 선언과 주석이 다른 줄로 분리된 경우는 인식되지 않는다.

## 지원 토큰

### `@label`

인스펙터에 표시할 이름을 바꾼다.

```glsl
uniform float edgePower; // @label Edge Power
```

적용 결과:

- 카드 제목에 `Edge Power` 표시
- 내부 식별자는 계속 `edgePower` 유지

### `@group`

인스펙터 그룹 이름을 지정한다.

```glsl
uniform vec3 tintColor; // @group Surface
```

적용 결과:

- 같은 그룹명을 가진 속성끼리 한 섹션으로 묶인다.
- 지정하지 않으면 기본 그룹으로 들어간다.

### `@ui`

UI 렌더링 방식을 지정한다.

지원 값:

- `number`
- `checkbox`
- `vector`
- `texture`
- `slider`
- `color`

예시:

```glsl
uniform float roughness; // @ui slider
uniform vec3 tintColor;  // @ui color
uniform bool useTint;    // @ui checkbox
```

## `@ui`와 타입 호환 규칙

모든 `@ui` 값이 모든 타입에 허용되지는 않는다.

- `slider`: `float`만 허용
- `color`: `vec3`, `vec4`만 허용
- `checkbox`: `bool`만 허용
- `texture`: `sampler2D`만 허용

호환되지 않는 조합이면 주석 값을 무시하고 기본 UI로 되돌린다.

예:

```glsl
uniform int count; // @ui color
```

위 경우 `color`는 무시되고 숫자 입력으로 표시된다.

## 수치 범위 토큰

### `@min`

최솟값 지정

### `@max`

최댓값 지정

### `@step`

증감 간격 지정

예시:

```glsl
uniform float edgePower; // @ui slider @min 0 @max 5 @step 0.01
```

적용 범위:

- `slider`의 range input
- number input의 최소값, 최대값, step

숫자로 변환할 수 없는 값이면 무시된다.

## 기본 타입별 UI 매핑

메타데이터가 없을 때 reflection 결과는 아래처럼 기본 UI를 만든다.

- `float`, `int`: `number`
- `bool`: `checkbox`
- `vec2`, `vec3`, `vec4`: `vector`
- `ivec*`, `bvec*`: `vector`
- `sampler2D`: `texture`

즉 메타데이터는 기본 타입 매핑을 완전히 바꾸는 것이 아니라, 허용된 범위 안에서 UI 표현을 덮어쓰는 역할이다.

## 인스펙터 표시 방식

현재 인스펙터는 아래 규칙으로 렌더링한다.

- `label`이 있으면 제목으로 사용
- 없으면 `uniform` 이름 그대로 사용
- `group`이 있으면 그룹 섹션으로 묶음
- `slider`면 range + number 입력을 같이 표시
- `color`면 color picker를 표시
- `vec4 + color`면 alpha 슬라이더를 추가 표시
- `texture`면 파일 업로드와 텍스처 선택 드롭다운을 표시

## 엔진 예약 uniform 처리

다음 uniform은 인스펙터에서 제외된다.

- `uTime`
- `uResolution`
- `uMouse`
- `uSceneMode`
- `uModel`
- `uView`
- `uProj`
- `uCameraPos`
- `uLightDir`

현재 구현은 이름 비교를 소문자 기준으로 수행하므로, 대소문자가 섞여 있어도 예약 uniform으로 처리된다.

## 예시 모음

### 1. 슬라이더

```glsl
uniform float edgePower; // @ui slider @min 0 @max 5 @step 0.01 @label Edge Power @group Surface
```

### 2. 색상

```glsl
uniform vec3 tintColor; // @ui color @label Tint Color @group Surface
```

### 3. 체크박스

```glsl
uniform bool useTint; // @ui checkbox @label Use Tint @group Surface
```

### 4. 텍스처 슬롯

```glsl
uniform sampler2D detailTex; // @ui texture @label Detail Texture @group Noise
```

## 현재 한계

- 블록 주석 `/* ... */` 메타데이터는 지원하지 않는다.
- 선언 다음 줄의 주석은 지원하지 않는다.
- 배열 uniform 메타데이터는 지원하지 않는다.
- `mat3`, `mat4` 인스펙터는 아직 지원하지 않는다.
- 그룹 순서, 표시 순서를 별도 토큰으로 제어하지 않는다.
- `@tooltip`, `@default`, `@hidden` 같은 확장 토큰은 아직 없다.

## 권장 작성 방식

- 한 줄에 하나의 `uniform`만 선언한다.
- 메타데이터는 선언과 같은 줄에 둔다.
- `label`은 사용자 친화적 문구로, 이름은 코드 식별자로 유지한다.
- 그룹명은 일관되게 사용한다.
  - 예: `Surface`, `Noise`, `Mask`, `Lighting`
- `slider`는 반드시 `@min`, `@max`, `@step`를 함께 적는 편이 좋다.

## 권장 예시

```glsl
uniform float edgePower;     // @ui slider @min 0 @max 5 @step 0.01 @label Edge Power @group Surface
uniform vec2 uvOffset;       // @label UV Offset @group Surface
uniform vec3 tintColor;      // @ui color @label Tint Color @group Surface
uniform bool useTint;        // @ui checkbox @label Use Tint @group Surface
uniform int bandCount;       // @label Band Count @group Noise
uniform sampler2D detailTex; // @ui texture @label Detail Texture @group Noise
```
