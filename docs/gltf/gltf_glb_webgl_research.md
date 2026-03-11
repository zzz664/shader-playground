# glTF / GLB / WebGL 조사 메모

## 목적
- 현재 프로젝트의 모델 업로드와 렌더링 경로를 재검토하기 위해 glTF 2.0, GLB, WebGL 렌더링 방식의 기준 문서를 정리한다.
- 이 문서는 2026년 3월 9일 기준으로 Khronos와 MDN의 공식 문서를 우선 참고해 작성한다.

## 참고한 공식 문서
- Khronos glTF 소개: https://www.khronos.org/gltf
- Khronos glTF 2.0 명세: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
- Khronos glTF Sample Renderer: https://github.com/KhronosGroup/glTF-Sample-Renderer
- Khronos glTF Sample Viewer 릴리스 소개: https://www.khronos.org/blog/gltf-sample-viewer-1.1-released
- MDN WebGL API 개요: https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API
- MDN WebGLRenderingContext.bufferData: https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/bufferData
- MDN WebGLRenderingContext.vertexAttribPointer: https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/vertexAttribPointer
- MDN WebGLRenderingContext.drawElements: https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/drawElements
- MDN WebGLRenderingContext.cullFace: https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/cullFace
- MDN WebGLRenderingContext.depthFunc: https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/depthFunc
- MDN WebGL2RenderingContext.createVertexArray: https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/createVertexArray

## 핵심 결론
- WebGL은 glTF 또는 GLB를 공식 로더 형태로 내장 지원하지 않는다.
- glTF와 GLB는 Khronos가 정의한 3D 전송 포맷이며, WebGL은 이를 GPU에 그리는 렌더링 API다.
- 따라서 모델 로딩은 별도 파서가 필요하고, 파싱 결과를 WebGL 버퍼, 속성, 인덱스, 텍스처, 상태 설정으로 옮기는 렌더링 계층이 따로 필요하다.
- Khronos는 공식 레퍼런스 구현으로 `glTF Sample Renderer`를 제공하지만, 이것은 WebGL 표준 API의 일부가 아니라 참고용 렌더러다.

## glTF 2.0이 정의하는 것
Khronos 소개 문서와 glTF 2.0 명세 기준으로 glTF는 런타임 친화적인 3D 전송 포맷이다. 핵심 데이터는 다음 구조로 나뉜다.

- `scene`, `scenes`
  - 어떤 노드 집합을 시작 장면으로 사용할지 정의한다.
- `node`, `nodes`
  - 계층 구조와 변환을 가진 장면 노드다.
  - 노드는 `matrix` 하나를 가지거나, `translation`, `rotation`, `scale` 조합을 가진다.
- `mesh`, `meshes`
  - 하나 이상의 `primitive` 묶음이다.
- `primitive`
  - 실제 드로우 단위다.
  - `attributes`, `indices`, `material`, `mode`를 가진다.
- `buffer`
  - 원시 바이너리 데이터 저장소다.
- `bufferView`
  - 버퍼의 연속 구간을 가리킨다.
- `accessor`
  - `bufferView`를 타입, 개수, 정규화 여부와 함께 해석하는 뷰다.
- `material`
  - PBR 메타데이터, `doubleSided`, `alphaMode` 같은 렌더 상태 관련 정보를 포함한다.
- `image`, `texture`, `sampler`
  - 텍스처 소스와 샘플링 설정을 정의한다.

## `.gltf`와 `.glb`의 차이
### `.gltf`
- JSON 기반의 텍스트 파일이다.
- 바이너리 버퍼, 이미지가 외부 파일 또는 data URI로 분리될 수 있다.
- 사람이 읽기 쉽고 디버깅이 쉽지만, 파일 개수가 늘어날 수 있다.

### `.glb`
- 바이너리 패키지 포맷이다.
- glTF 2.0 명세의 Binary glTF 섹션에서 헤더와 청크 구조를 정의한다.
- 일반적으로 다음 순서로 읽는다.
  1. 12바이트 헤더를 읽는다.
  2. `magic`, `version`, `length`를 확인한다.
  3. JSON 청크를 읽는다.
  4. 필요하면 BIN 청크를 읽는다.
- 배포와 로딩 경로는 단순하지만, 직접 파싱할 때는 청크 단위 처리가 필요하다.

## glTF / GLB 파싱의 최소 절차
공식 명세 기준으로 WebGL 렌더링에 필요한 최소 파싱 절차는 아래와 같다.

1. 파일 형식 판별
- 확장자 또는 GLB 헤더를 기준으로 `.gltf`와 `.glb`를 구분한다.

2. JSON 문서 확보
- `.gltf`는 파일 본문 JSON을 그대로 읽는다.
- `.glb`는 JSON 청크를 파싱해서 JSON 문서를 얻는다.

3. 버퍼 로드
- `buffers[*].uri`가 있으면 외부 바이너리 또는 data URI를 읽는다.
- `.glb`는 BIN 청크를 해당 버퍼 데이터로 연결한다.

4. `bufferView`와 `accessor` 해석
- `bufferView.byteOffset`, `byteLength`, `byteStride`
- `accessor.componentType`, `count`, `type`, `normalized`
- 이 조합으로 정점 속성과 인덱스 배열을 만든다.

5. 노드 계층 변환 계산
- 각 노드의 로컬 변환을 계산하고 부모 변환을 누적해 월드 행렬을 만든다.
- `matrix`가 있으면 그대로 사용하고, 없으면 `TRS`를 합성한다.

6. 메쉬와 프리미티브 추출
- `POSITION`은 사실상 필수로 간주해야 한다.
- 필요에 따라 `NORMAL`, `TANGENT`, `TEXCOORD_0`, `COLOR_0` 등을 읽는다.
- `indices`가 있으면 `drawElements`, 없으면 `drawArrays` 경로를 쓴다.

7. 머티리얼 메타데이터 해석
- 최소한 `doubleSided`, `alphaMode`, 텍스처 참조는 읽어야 한다.
- 사용자 셰이더로 머티리얼 override를 하더라도 cull, blend 같은 상태는 여전히 중요하다.

## WebGL에서 실제로 필요한 렌더링 단계
MDN WebGL 문서 기준으로 glTF 파싱 결과를 화면에 그릴 때 필요한 기본 절차는 다음과 같다.

1. 버퍼 생성
- `createBuffer`, `bindBuffer`, `bufferData`로 정점/인덱스 버퍼를 만든다.

2. VAO 구성
- WebGL2에서는 `createVertexArray`와 `bindVertexArray`로 정점 레이아웃을 묶는 편이 안정적이다.

3. 정점 속성 연결
- `vertexAttribPointer`와 `enableVertexAttribArray`로 `POSITION`, `NORMAL`, `TEXCOORD_0` 등을 셰이더 입력과 연결한다.
- `bufferView.byteStride`가 있으면 그대로 반영해야 한다.

4. 셰이더 프로그램 준비
- vertex / fragment shader를 컴파일하고 프로그램을 링크한다.
- glTF 자체는 셰이더를 내장하지 않으므로, 엔진 셰이더 또는 사용자 셰이더가 필요하다.

5. 유니폼 갱신
- `model`, `view`, `projection` 행렬
- 카메라 위치
- 텍스처 슬롯
- 프로젝트 내부 예약 유니폼

6. 렌더 상태 설정
- 깊이 테스트: `enable(DEPTH_TEST)`와 `depthFunc`
- 컬링: `enable(CULL_FACE)`와 `cullFace`
- 블렌드: `alphaMode`가 `BLEND`이면 별도 처리 필요

7. 드로우 호출
- 인덱스가 있으면 `drawElements`
- 없으면 `drawArrays`
- glTF `primitive.mode`에 따라 `TRIANGLES`, `LINES` 등 토폴로지를 매핑해야 한다.

## 왜 `doubleSided`가 중요한가
glTF 2.0 명세는 `material.doubleSided`를 통해 양면 렌더링 여부를 정의한다. 이 값이 `true`면 해당 primitive는 뒷면 제거 없이 렌더링되어야 한다. 반대로 `false`면 일반적으로 back-face culling을 적용한다.

실무적으로는 다음 의미가 있다.

- 모델 로더가 geometry만 읽고 `doubleSided`를 무시하면 앞면/뒷면 표시가 틀어질 수 있다.
- 사용자 셰이더로 material override를 하더라도 primitive별 cull 정책은 여전히 유지되어야 한다.
- 전역적으로 `CULL_FACE`를 끄는 방식은 임시 회피책일 수는 있지만, glTF 메타데이터를 반영하지 못한다.

## 현재 프로젝트 관점에서 필요한 최소 지원 범위
현재 플레이그라운드 구조를 기준으로 보면 모델 경로에서 최소한 아래 항목은 보장되어야 한다.

- 파일 입력
  - `.glb`
  - `.gltf`
  - 외부 buffer/image 참조 또는 data URI

- geometry
  - `POSITION`
  - `NORMAL`
  - `TEXCOORD_0`
  - `indices`

- transform
  - 노드 계층
  - `matrix`
  - `translation`, `rotation`, `scale`

- render state
  - `doubleSided`
  - `alphaMode`
  - 기본 depth / cull / blend 정책

- texture
  - `images`
  - `textures`
  - `samplers`

이 범위를 벗어난 스킨, 애니메이션, morph target, 확장 기능은 별도 단계로 분리하는 편이 안전하다.

## 공식 구현을 참고할 때의 기준
Khronos `glTF Sample Renderer`는 다음 목적에 적합하다.

- glTF 2.0 명세를 어떻게 해석해야 하는지 확인
- material state와 mesh primitive 처리 방식을 참고
- `doubleSided`, 투명도, 텍스처, 노드 변환 처리 방식 비교

반면 현재 프로젝트에 바로 통째로 넣는 방식은 주의가 필요하다.

- 이 프로젝트는 사용자 셰이더 override가 핵심이다.
- 공식 샘플 렌더러는 자체 glTF 렌더링 파이프라인을 가진다.
- 그대로 도입하면 현재 editor / compile / inspector / override 구조와 충돌할 가능성이 높다.

따라서 가장 보수적인 접근은 다음 순서다.

1. 공식 명세와 공식 레퍼런스 구현을 기준으로 파싱 요구사항을 정리한다.
2. 현재 프로젝트의 `ModelAsset` 또는 동등한 내부 포맷을 먼저 설계한다.
3. 로더는 내부 포맷으로만 변환하고, 렌더러는 그 내부 포맷만 받게 한다.
4. 머티리얼 override 구조에서도 `doubleSided`, `alphaMode` 같은 glTF 메타데이터는 별도 렌더 상태로 유지한다.

## 이번 되돌림 판단
이번 작업에서는 기존 모델 업로드와 렌더링 코드를 초기 상태로 되돌렸다. 이유는 다음과 같다.

- 현재 구현은 glTF 명세의 최소 요구사항을 충분히 반영하지 못했다.
- 특히 `doubleSided`, 외부 리소스 참조, primitive 상태 관리가 임시 구현 수준에 머물렀다.
- 공식 문서 기준 설계를 먼저 정리한 뒤, 더 작은 단위로 다시 구현하는 편이 안전하다.

## 다음 구현 권장 순서
1. 내부 `ModelAsset` 데이터 구조를 문서 기준으로 재정의한다.
2. `.glb` 전용 최소 로더부터 다시 만든다.
3. `POSITION/NORMAL/TEXCOORD_0/indices`와 `doubleSided`만 우선 지원한다.
4. primitive별 cull 정책과 `alphaMode`를 렌더러에 반영한다.
5. 그 뒤 `.gltf` 외부 리소스 참조와 텍스처 경로를 추가한다.

## 비고
- `WebGL이 glTF 로더를 공식 제공한다`는 표현은 맞지 않다.
- 더 정확한 표현은 `Khronos가 glTF 명세와 공식 레퍼런스 구현을 제공한다`이다.
