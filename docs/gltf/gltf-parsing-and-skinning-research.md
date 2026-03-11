# glTF 파싱 및 스키닝 구현 조사 정리

## 문서 목적

이 문서는 glTF 2.0 파싱, 애니메이션, 스키닝 구현 시 반드시 알아야 하는 규칙을 공식 Khronos 자료 기준으로 정리한 문서입니다.

목표는 다음과 같습니다.

- glTF 파일을 읽을 때 어떤 규칙을 지켜야 하는지 명확히 정리
- `.gltf`와 `.glb`의 구조 차이를 구현 관점에서 설명
- `buffer`, `bufferView`, `accessor` 해석 규칙과 함정을 정리
- 노드 계층, 애니메이션, 스키닝의 계산 순서를 정리
- 실제 렌더러에서 자주 발생하는 오류 원인과 디버깅 포인트를 정리
- PrismCore 같은 엔진에서 책임 분리를 어떻게 잡아야 안정적인지 정리

이 문서는 “파일을 읽는 법”만이 아니라, “런타임에서 좌표계와 스키닝을 어떻게 통합해야 하는가”까지 포함합니다.

---

## 1. glTF 2.0의 기본 철학

glTF는 단순한 모델 파일 포맷이 아니라, 렌더링 가능한 3D 자산 전송 포맷입니다.

핵심 특징은 다음과 같습니다.

- 장면(Scene), 노드(Node), 메쉬(Mesh), 재질(Material), 텍스처(Texture), 스킨(Skin), 애니메이션(Animation)을 한 포맷 안에 함께 담음
- GPU 친화적인 버퍼 구조를 가짐
- 정적 메시뿐 아니라 리깅, 스키닝, 애니메이션까지 전달 가능
- 런타임이 최소 가공으로 렌더링할 수 있도록 설계됨

즉, glTF 구현은 단순 파일 파서가 아니라 “장면 그래프 + 자산 그래프 + 애니메이션 시스템”을 읽는 일에 가깝습니다.

---

## 2. `.gltf`와 `.glb`의 차이

### 2.1 `.gltf`

`.gltf`는 JSON 본문을 중심으로 하고, 바이너리와 이미지를 외부 파일 또는 `data:` URI로 참조하는 형태입니다.

일반적으로 다음 구조를 가집니다.

- JSON 파일 하나 (`model.gltf`)
- 바이너리 파일 하나 이상 (`.bin`)
- 텍스처 이미지 파일 (`.png`, `.jpg` 등)

장점:

- 사람이 구조를 보기 쉬움
- 일부 파일만 교체 가능
- 디버깅이 쉬움

주의점:

- 상대 경로 해석이 정확해야 함
- `uri`가 외부 파일인지 `data:` URI인지 구분해야 함
- 리소스 로더가 파일명/대소문자/네임스페이스 규칙을 만족해야 함

### 2.2 `.glb`

`.glb`는 JSON과 바이너리를 하나의 바이너리 컨테이너로 묶은 형식입니다.

장점:

- 배포가 쉬움
- 파일 1개만 로드하면 됨
- 외부 `.bin` 의존성이 없음

주의점:

- 바이너리 청크 레이아웃을 정확히 해석해야 함
- JSON 청크와 BIN 청크의 정렬 규칙을 지켜야 함

### 2.3 `.glb` 바이너리 구조

공식 스펙 기준 `.glb`는 다음 순서입니다.

1. 12바이트 헤더
2. JSON 청크
3. 선택적 BIN 청크
4. 추가 청크가 있을 수 있으나, 일반 구현은 JSON/BIN 위주로 처리

헤더 구성:

- `magic`
- `version`
- `length`

청크 구성:

- `chunkLength`
- `chunkType`
- `chunkData`

구현 시 주의:

- `magic` 검증 필수
- `version`이 2인지 확인
- `length`와 실제 파일 길이 일치 확인
- 첫 번째 청크가 JSON인지 확인
- JSON 청크는 공백(`0x20`) 패딩 가능
- BIN 청크는 `0x00` 패딩 가능
- 청크 경계는 4바이트 정렬을 의식해야 함

잘못 구현하면 발생하는 문제:

- JSON 파싱 실패
- BIN 오프셋이 밀려 모든 accessor가 깨짐
- 텍스처/스키닝 데이터가 전부 잘못 읽힘

---

## 3. JSON 상위 구조에서 우선 이해해야 하는 것

glTF JSON의 주요 상위 배열:

- `scenes`
- `nodes`
- `meshes`
- `materials`
- `textures`
- `images`
- `samplers`
- `skins`
- `animations`
- `buffers`
- `bufferViews`
- `accessors`

이 중 구현 우선순위를 나누면 다음이 좋습니다.

1. `buffers`, `bufferViews`, `accessors`
2. `nodes`, `meshes`
3. `materials`, `textures`, `images`
4. `animations`
5. `skins`

이 순서가 좋은 이유:

- 모든 기하/애니메이션/스키닝 데이터는 결국 accessor 해석 위에 올라감
- accessor를 정확히 읽지 못하면 그 위 레이어는 전부 신뢰할 수 없음

---

## 4. Buffer / BufferView / Accessor 해석 규칙

### 4.1 `buffer`

`buffer`는 원시 바이트 저장소입니다.

역할:

- 실제 바이너리 데이터의 최상위 컨테이너
- `.gltf`에서는 외부 파일 또는 `data:` URI
- `.glb`에서는 BIN 청크가 보통 `buffer[0]`

구현 체크:

- `byteLength` 검증
- `.gltf`에서는 `uri` 해석
- `.glb`에서는 `uri`가 없을 수 있음

### 4.2 `bufferView`

`bufferView`는 `buffer` 안의 연속된 바이트 구간입니다.

주요 필드:

- `buffer`
- `byteOffset`
- `byteLength`
- `byteStride` (선택)
- `target` (선택)

실질적 의미:

- `buffer` 안에서 일부 구간만 잘라 쓰는 슬라이스
- 정점 데이터, 인덱스 데이터, 애니메이션 키프레임 데이터가 각각 다른 `bufferView`를 가질 수 있음

중요 주의점:

- `byteOffset` 기본값은 0
- `byteStride`가 있으면 인터리브 정점 데이터일 수 있음
- `byteStride`가 없으면 tightly packed로 해석
- `target`은 힌트이지 강제 규칙이 아님

구현 실수 포인트:

- `byteStride` 무시
- `target`만 보고 정점/인덱스를 강제 분기
- `bufferView` 오프셋과 `accessor.byteOffset`를 합산하지 않음

### 4.3 `accessor`

`accessor`는 `bufferView`를 “어떤 타입의 데이터 배열로 볼지” 정의합니다.

주요 필드:

- `bufferView`
- `byteOffset`
- `componentType`
- `count`
- `type`
- `normalized` (선택)
- `min`, `max` (선택)
- `sparse` (선택)

핵심 역할:

- 동일한 바이트 배열을 `VEC3`, `MAT4`, `SCALAR` 등으로 해석
- 정수인지 부동소수인지 결정
- 개수와 stride 계산의 기준점 제공

### 4.4 `componentType`

자주 쓰는 값:

- `5120` = `BYTE`
- `5121` = `UNSIGNED_BYTE`
- `5122` = `SHORT`
- `5123` = `UNSIGNED_SHORT`
- `5125` = `UNSIGNED_INT`
- `5126` = `FLOAT`

구현 주의:

- `JOINTS_0`는 보통 정수 인덱스이므로 정수로 읽어야 함
- `WEIGHTS_0`는 정수 기반일 수도 있고 `normalized=true`일 수 있음
- 정수인데 `normalized=true`인 경우, 런타임 float로 정규화 변환해야 함

### 4.5 `type`

대표 값:

- `SCALAR`
- `VEC2`
- `VEC3`
- `VEC4`
- `MAT2`
- `MAT3`
- `MAT4`

구현 포인트:

- 요소 개수 계산에 사용
- 예: `VEC3`는 3개, `MAT4`는 16개

### 4.6 `normalized`

이 필드는 매우 중요합니다.

의미:

- 정수 값을 바로 정수로 쓰는 것이 아니라, 지정된 범위의 실수로 해석해야 함

대표 예:

- `UNSIGNED_BYTE + normalized=true`면 `0..255`를 `0..1`로 변환
- `BYTE + normalized=true`면 `-128..127`을 `-1..1` 근처로 변환

자주 실수하는 지점:

- `WEIGHTS_0`를 정수 그대로 써서 가중치가 깨짐
- `COLOR_0`를 정수 그대로 써서 색이 틀어짐

### 4.7 `accessor.byteOffset`

이 값은 `bufferView.byteOffset` 위에 추가로 더해집니다.

최종 바이트 시작점:

`buffer.byteOffset + bufferView.byteOffset + accessor.byteOffset`

실무 오류:

- 둘 중 하나만 더함
- `byteStride`가 있는 경우에도 각 요소별 시작점을 잘못 계산함

### 4.8 Column-major 행렬

glTF의 행렬 데이터는 column-major 기준입니다.

영향:

- `MAT4` accessor를 읽을 때 메모리 배치를 정확히 반영해야 함
- 엔진 내부가 row-major인지 column-major인지에 따라 로드 시 변환이 필요할 수 있음

이 부분을 틀리면:

- 본 행렬
- 노드 `matrix`
- inverse bind matrix

가 모두 뒤틀립니다.

스키닝이 찌그러지는 가장 흔한 원인 중 하나입니다.

### 4.9 Sparse accessor

glTF는 sparse accessor를 지원합니다.

의미:

- 기본 배열 위에 일부 인덱스만 덮어쓰는 방식

구현 전략:

- 완전 지원
- 혹은 명시적으로 미지원 처리

중요한 점:

- “아예 존재를 모른 채 무시”하면 안 됨
- 미지원이면 로그와 함께 안전하게 실패하거나 fallback 해야 함

---

## 5. 정점 속성(Attribute) 해석 시 주의점

glTF primitive 속성은 semantic 이름으로 식별합니다.

대표 semantic:

- `POSITION`
- `NORMAL`
- `TANGENT`
- `TEXCOORD_0`
- `TEXCOORD_1`
- `COLOR_0`
- `JOINTS_0`
- `WEIGHTS_0`

복수 세트가 가능한 semantic:

- `TEXCOORD_n`
- `COLOR_n`
- `JOINTS_n`
- `WEIGHTS_n`

구현 주의:

- `JOINTS_0`, `WEIGHTS_0`만 있다고 가정하면 장기적으로 한계가 있음
- 최소 구현에서는 `JOINTS_0`, `WEIGHTS_0`만 지원해도 되지만, 지원 범위를 문서화해야 함
- 추후 고품질 자산에서는 `JOINTS_1`, `WEIGHTS_1`가 등장할 수 있음

### 5.1 `POSITION`

- 보통 `FLOAT`
- 필수에 가깝지만, primitive 유형에 따라 가정하지 말고 검증하는 편이 좋음

### 5.2 `NORMAL`

- 없을 수 있음
- 없으면 라이팅 계산이 달라짐
- 단순 렌더러는 법선을 재계산하지 않거나, 평면 법선을 생성하거나, 언릿처럼 처리할 수 있음

중요:

- `fox.glb` 같은 자산은 `NORMAL`이 없는 경우가 있을 수 있음
- 이 경우 “형상이 깨진다”와 “라이팅이 이상하다”를 구분해서 봐야 함

### 5.3 `TEXCOORD_n`

- `VEC2`
- 보통 `FLOAT`지만 정수 + `normalized`도 가능
- UV 범위가 반드시 `0..1`일 필요는 없음

### 5.4 `JOINTS_n`

- 관절 인덱스
- 정수로 읽어야 함
- 일반적으로 `UNSIGNED_BYTE` 또는 `UNSIGNED_SHORT`

실수 포인트:

- float로 읽고 반올림하면서 인덱스가 틀어짐
- `normalized`를 잘못 적용

### 5.5 `WEIGHTS_n`

- 가중치
- float일 수도 있고 정수 + `normalized=true`일 수도 있음

실수 포인트:

- 정규화된 정수 가중치를 정수 그대로 사용
- 합이 1이 아니라고 가정하고 그대로 사용

권장:

- 로드 후 유효 가중치만 다시 합산하여 재정규화
- 극소값은 버릴 수 있음

---

## 6. 인덱스(Index)와 Primitive 모드

### 6.1 인덱스

primitive는 `indices` accessor를 가질 수 있습니다.

가능한 타입:

- `UNSIGNED_BYTE`
- `UNSIGNED_SHORT`
- `UNSIGNED_INT`

주의:

- 인덱스가 없으면 비인덱스 드로우
- 인덱스 타입별 읽기 경로 필요

### 6.2 primitive 모드

대표적으로 `TRIANGLES`가 가장 흔하지만, 다른 모드도 있을 수 있습니다.

구현 전략:

- 초기 구현은 `TRIANGLES`만 지원해도 되지만, 나머지는 명시적으로 거절해야 함

무심코 가정하면:

- 선형 데이터가 삼각형처럼 해석되어 형상이 무너짐

---

## 7. 노드(Node), 씬(Scene), 변환(Transform)

### 7.1 Scene -> Node 구조

`scene`은 루트 노드 목록을 가집니다.

즉 월드 행렬 계산은 다음 개념으로 진행됩니다.

1. scene의 루트 노드들에서 시작
2. 각 노드의 local transform 계산
3. 부모 world * 자식 local로 누적

### 7.2 노드의 local transform 표현

노드는 둘 중 하나를 가집니다.

- `matrix`
- TRS (`translation`, `rotation`, `scale`)

중요 규칙:

- 스펙상 같은 노드에 `matrix`와 TRS를 동시에 두면 안 됨

### 7.3 TRS 순서

local matrix는 `T * R * S` 순서입니다.

이 순서를 틀리면:

- 애니메이션 회전축이 이상해짐
- 스케일이 회전 후에 먹어 기하가 찌그러짐

### 7.4 `rotation`

`rotation`은 quaternion `(x, y, z, w)`입니다.

주의:

- `(w, x, y, z)`가 아님
- 정규화되지 않은 값이 들어올 가능성을 방어하는 편이 안정적

### 7.5 `matrix`와 TRS 변환

실무에서 `matrix`를 TRS로 분해하는 구현이 많지만, 다음을 주의해야 합니다.

- 분해 가능한 순수 TRS 행렬인지 확인해야 함
- shear가 있거나 수치 오차가 큰 경우, 분해/재조합 시 원래 값이 달라질 수 있음
- 가능하면 원본 `matrix` 경로를 유지하는 구현이 더 안전함

안전한 방향:

- 노드는 “TRS 기반 local transform”과 “직접 matrix local transform”을 모두 표현할 수 있게 설계
- 런타임에서는 최종 local matrix만 공통으로 쓰는 구조가 좋음

### 7.6 부모 체인 누적

스키닝과 일반 노드 렌더링 모두 결국 “부모 체인 누적” 위에 올라갑니다.

따라서 다음이 핵심입니다.

- 노드 world matrix는 공통 평가기에서 한 번만 계산
- 렌더 경로, 스키닝 경로, 애니메이션 경로가 같은 world matrix를 재사용

이 원칙이 깨지면:

- 정적 모델은 멀쩡한데 스키닝만 깨짐
- node animation과 bone animation이 서로 다른 기준좌표를 씀

---

## 8. 이미지(Image), 텍스처(Texture), 샘플러(Sampler)

### 8.1 `image`

이미지는 다음 중 하나로 올 수 있습니다.

- 외부 파일 `uri`
- `data:` URI
- `bufferView` 기반 임베디드 이미지

구현 시 반드시 확인할 것:

- `.gltf`에서 상대 경로 해석
- `data:` URI base64 디코딩
- `bufferView` 기반 이미지 해석

### 8.2 `texture`

`texture`는 보통 다음을 참조합니다.

- `source` -> 이미지
- `sampler` -> 필터/랩 모드

### 8.3 `sampler`

중요 필드:

- `wrapS`
- `wrapT`
- `magFilter`
- `minFilter`

초기 구현은 단순화할 수 있지만, 다음은 의식해야 합니다.

- UV가 `0..1`을 넘을 수 있음
- wrap 모드가 반복인지 clamp인지에 따라 결과가 달라짐

### 8.4 텍스처 알파와 material 알파는 다르다

매우 중요합니다.

텍스처에 알파 채널이 있다고 해서 자동으로 투명 재질이 되는 것이 아닙니다.

실제 투명도 해석은 material의 `alphaMode`가 결정합니다.

즉:

- 텍스처 PNG에 알파 채널 존재
- 하지만 material이 `OPAQUE`

이면, 알파를 투명도로 취급하면 안 됩니다.

이 부분을 틀리면:

- 멀쩡한 불투명 캐릭터 얼굴이 구멍처럼 보임
- 특정 부위가 “텍스처가 안 보인다”처럼 보임

---

## 9. Material 구현 시 주의점

### 9.1 `baseColorFactor`

`baseColorFactor`는 기본 색상 계수입니다.

구현 포인트:

- 텍스처가 없을 때 단색 재질로 보이게 함
- 텍스처가 있을 때는 보통 texture 샘플과 곱해짐

실무 주의:

- 색상 기본값은 `(1, 1, 1, 1)`이어야 함
- 회전용 quaternion identity `(0, 0, 0, 1)`을 색상 기본값으로 쓰면 안 됨

이 실수는 실제로 “모든 텍스처가 검게 보이는” 전형적인 원인입니다.

### 9.2 `alphaMode`

값:

- `OPAQUE`
- `MASK`
- `BLEND`

의미:

- `OPAQUE`: 알파를 투명도로 사용하지 않음
- `MASK`: cutoff 기준으로 버림
- `BLEND`: 반투명 블렌딩

### 9.3 `alphaCutoff`

`MASK`일 때 의미가 있습니다.

주의:

- `OPAQUE`에서 cutoff를 적용하면 안 됨

### 9.4 `doubleSided`

`doubleSided=true`면 백페이스 컬링을 끄는 쪽이 일반적입니다.

중요:

- 스키닝 모델에서 면 방향이나 winding이 예민한 경우, 컬링 문제는 “텍스처가 투명하다”처럼 보일 수 있음
- 특히 얇은 다리, 귀, 얼굴 주변은 이런 착시가 자주 생김

### 9.5 렌더 패스 선택

실무에서는 보통 다음처럼 나눕니다.

- `OPAQUE` -> 불투명 패스
- `MASK` -> 컷아웃 패스
- `BLEND` -> 투명 패스

이 분기가 잘못되면:

- 불투명 모델이 잘려 보임
- 반투명 정렬이 깨짐

---

## 10. 애니메이션(Animation) 구조

### 10.1 기본 구조

glTF 애니메이션은 다음 두 레이어로 구성됩니다.

- `samplers`
- `channels`

의미:

- sampler는 시간 입력과 값 출력을 연결
- channel은 그 sampler가 어떤 노드의 어떤 속성을 구동하는지 지정

### 10.2 Channel target

`target.path`는 다음 중 하나입니다.

- `translation`
- `rotation`
- `scale`
- `weights`

주의:

- `weights`는 morph target용
- 스켈레톤 애니메이션만 보고 구현하면 나중에 morph가 빠짐

### 10.3 Sampler input/output

- `input`은 키프레임 시간 배열
- `output`은 키프레임 값 배열

주의:

- `input`은 오름차순이어야 함
- 시간 단위는 초

### 10.4 보간 모드

지원 값:

- `STEP`
- `LINEAR`
- `CUBICSPLINE`

---

## 11. 애니메이션 보간 구현 시 핵심 주의점

### 11.1 `STEP`

- 현재 키값 유지
- 다음 키까지 점프하지 않음

### 11.2 `LINEAR`

`translation`, `scale`, `weights`는 일반 선형 보간을 사용하면 됩니다.

하지만 `rotation`은 다릅니다.

중요:

- quaternion rotation의 `LINEAR`는 단순 성분별 lerp 후 정규화로 처리하면 시각적으로 틀어질 수 있음
- 실무적으로는 shortest-path 기준 quaternion `slerp`가 필요

단순 성분 lerp의 문제:

- 긴 경로로 회전
- 관절이 비정상적으로 꺾임
- 공식 샘플과 다른 동작

### 11.3 반구 정렬(Hemisphere alignment)

두 quaternion의 내적이 음수면 한쪽 부호를 뒤집어 shortest-path로 맞추는 처리가 필요합니다.

이걸 하지 않으면:

- 보간 도중 갑자기 반대 방향으로 크게 회전

### 11.4 `CUBICSPLINE`

가장 많이 틀리는 부분입니다.

glTF의 `CUBICSPLINE` output은 키마다 값 하나가 아니라 3개 묶음입니다.

구성:

- in-tangent
- value
- out-tangent

즉, 키프레임 수가 `N`이면 output 항목 수는 보통 `3N`입니다.

또한 tangent는 구간 길이(`deltaTime`)를 곱해 사용해야 합니다.

이 점을 놓치면:

- 움직임이 과도하게 빠르거나 느려짐
- 키프레임 사이가 폭발적으로 튐

### 11.5 부분 오버라이드 규칙

애니메이션이 노드의 모든 TRS를 다 덮는 것이 아닙니다.

예:

- 어떤 channel이 `rotation`만 애니메이션함
- 그럼 `translation`, `scale`은 원래 노드의 기본값을 유지해야 함

이 규칙을 틀리면:

- 회전만 해야 하는 본이 원점으로 이동
- 스케일이 0 또는 1로 덮여 형상이 깨짐

---

## 12. 스키닝(Skinning) 구조

### 12.1 `skin`

`skin`은 다음 핵심 필드를 가집니다.

- `joints`
- `inverseBindMatrices` (선택)
- `skeleton` (선택)

### 12.2 `joints`

매우 중요합니다.

`skin.joints`는 “관절 노드 목록”이며, 이 배열의 순서가 곧 `JOINTS_*`가 참조하는 인덱스 공간입니다.

즉:

- 정점의 `JOINTS_0 = [3, 1, 0, 0]`
- 이는 `nodes`의 인덱스가 아니라 `skin.joints` 배열에서의 인덱스

이걸 틀리면:

- 완전히 다른 뼈를 참조하게 됨
- 모델이 심하게 꼬이거나 찢어짐

### 12.3 `inverseBindMatrices`

이 값은 각 joint에 대응하는 inverse bind matrix 배열입니다.

규칙:

- `skin.joints`와 순서가 1:1로 대응
- `count`도 같아야 함

없을 경우:

- identity로 간주 가능

실무 주의:

- column-major 해석 필수
- 순서 mismatch가 생기면 전체 스키닝이 깨짐

### 12.4 `skeleton`

`skin.skeleton`은 스켈레톤 루트 노드를 가리킬 수 있습니다.

하지만:

- 이것만 믿고 전체 계층을 단순화하면 안 됨
- 실제 parent chain은 여전히 `nodes` 그래프를 봐야 함

---

## 13. 스키닝 수학: 무엇을 언제 계산해야 하는가

### 13.1 기본 개념

정점은 여러 joint의 영향을 가중 평균으로 받습니다.

개념적 수식:

`skinnedVertex = sum(weight_i * (jointMatrix_i * bindVertex))`

여기서 `jointMatrix_i`는 보통 다음 구조입니다.

`currentJointGlobal * inverseBindMatrix`

### 13.2 중요한 구현 현실

위 식만 그대로 쓰면 끝나는 것이 아닙니다.

실제 엔진에서는 “현재 스키닝 결과를 어느 좌표계에 둘 것인가”를 명확히 해야 합니다.

대표적인 두 방식:

1. 월드 기준 joint matrix를 만들고, 스키닝 결과도 월드 공간에 둠
2. 메쉬 로컬 기준 joint matrix를 만들어, 스키닝 결과를 메쉬 로컬 공간에 둠

실무적으로는 2번이 더 다루기 쉽습니다.

이유:

- 스키닝 후 일반 노드 transform 경로를 그대로 재사용 가능
- draw 단계에서 mesh node world를 한 번만 적용하면 됨

### 13.3 이중 변환 문제

가장 흔한 스키닝 버그입니다.

문제 패턴:

1. bone global을 월드 기준으로 계산
2. `global * inverseBind`로 정점을 이미 사실상 월드 쪽으로 옮김
3. draw 단계에서 mesh node world를 다시 곱함

결과:

- 모델 전체가 이상하게 끌려감
- 특정 관절 애니메이션이 전체 모델 회전처럼 보임
- 공식 샘플은 정적은 멀쩡한데 skinned만 깨짐

해결 원칙:

- “최종 스키닝 행렬이 어느 좌표계 결과를 내는가”를 고정
- draw 단계의 일반 노드 transform과 중복되지 않게 설계

### 13.4 메쉬 인스턴스 기준 스키닝

중요한 설계 포인트입니다.

공통 skeleton pose는 bone global까지는 공유될 수 있지만, 최종 스키닝 행렬은 메쉬 인스턴스 기준으로 달라질 수 있습니다.

즉:

- 같은 skeleton
- 같은 현재 애니메이션 pose

라도,

- 어떤 mesh node 아래에 매달려 있는지
- 어떤 mesh local 기준으로 렌더할지

에 따라 최종 skinning matrix는 달라질 수 있습니다.

안정적인 구조:

- 공통 단계: 노드 world matrix와 bone global 계산
- 인스턴스 단계: 현재 skinned mesh node 기준으로 최종 skinning matrix 생성

### 13.5 비조인트 중간 부모 노드

joint와 joint 사이에 일반 transform 노드가 끼어 있을 수 있습니다.

이를 무시하면:

- 단순 샘플은 맞는데 실제 자산은 깨짐
- `rigged_figure`류에서 특히 잘 드러남

핵심:

- 스켈레톤은 “조인트 목록”만 보면 안 됨
- 실제 노드 그래프의 부모 체인을 그대로 반영해야 함

### 13.6 Bind pose와 runtime pose를 같은 기준으로 계산해야 함

이 원칙이 무너지면 스키닝이 불안정합니다.

권장 구조:

1. 공통 런타임 pose 프레임 생성
2. 이 프레임에서 모든 node world matrix 계산
3. 같은 프레임에서 joint global 계산
4. 같은 프레임을 바탕으로 메쉬별 skinning matrix 생성

즉:

- node animation용 world matrix
- bone용 global matrix
- mesh draw용 transform

이 셋이 같은 계산 프레임을 공유해야 합니다.

---

## 14. 스키닝 구현 순서 권장안

다음 순서가 가장 안정적입니다.

### 14.1 1단계: 공통 문서 파싱

파싱 결과는 “평평한 자산 집합”만 두지 말고, 문서 단위 관계를 잃지 않게 유지하는 것이 좋습니다.

적어도 다음 관계는 복원 가능해야 합니다.

- 어떤 노드가 어떤 부모를 가졌는가
- 어떤 노드가 어떤 mesh를 참조하는가
- 어떤 노드가 어떤 skin을 참조하는가
- 어떤 animation channel이 어떤 node를 타깃하는가

### 14.2 2단계: 런타임 pose 프레임 계산

매 프레임:

- 애니메이션 샘플링
- 각 노드의 최종 local transform 결정
- 부모 체인을 따라 모든 노드의 world matrix 계산

이 결과를 공통 프레임으로 보관합니다.

### 14.3 3단계: skeleton pose 계산

공통 프레임의 world matrix를 재사용해서 joint global을 계산합니다.

주의:

- 이 단계에서 별도로 parent chain을 또 복원하지 않는 것이 좋음
- 이미 계산된 node world를 직접 쓰는 구조가 더 안전

### 14.4 4단계: 메쉬 인스턴스별 skinning matrix 계산

각 skinned mesh마다:

- 자신이 속한 mesh node 기준
- 현재 skeleton pose 기준

으로 최종 skinning matrix 배열을 만듭니다.

### 14.5 5단계: CPU 또는 GPU skinning

- CPU skinning: 정점 배열을 실제로 변형
- GPU skinning: joint matrix palette를 업로드하고 셰이더에서 변형

핵심:

- 둘 다 같은 “메쉬 인스턴스 기준 최종 skinning matrix”를 써야 함

### 14.6 6단계: 일반 노드 draw transform 적용

CPU skinning으로 얻은 정점이 mesh local 공간에 있다면:

- draw에서 mesh node world를 정상 적용

이미 월드 기준으로 스키닝했다면:

- draw에서 mesh world를 다시 곱하면 안 됨

좌표계 약속은 반드시 하나로 고정해야 합니다.

---

## 15. CPU 스키닝 구현 시 상세 주의점

### 15.1 기본 루프

정점마다:

1. joint 인덱스 읽기
2. weight 읽기
3. 유효 influence만 선택
4. 필요시 재정규화
5. 각 joint matrix를 가중합
6. position 변형
7. normal 변형

### 15.2 가중치 재정규화

다음 이유로 재정규화가 필요할 수 있습니다.

- 정밀도 손실
- 일부 influence 제거
- 정수 normalized 변환 오차

권장:

- 유효 weight 합이 0이 아니면 다시 나눠서 정규화

### 15.3 법선(normal) 처리

normal은 위치와 완전히 같은 방식으로 취급하면 안 됩니다.

보통:

- 평행이동은 적용하지 않음
- 방향 성분만 변형
- 최종 정규화

비균일 스케일이 섞이면 더 엄밀한 normal matrix가 필요할 수 있습니다.

### 15.4 성능 이슈

CPU skinning은 구현은 쉽지만 비용이 큽니다.

주의:

- 같은 프레임 내 중복 계산 금지
- surface/wireframe이 같은 스키닝 결과를 재사용하게 구조화
- 캐시 단위를 “프레임” 기준으로 잡는 편이 안전

---

## 16. GPU 스키닝 구현 시 상세 주의점

### 16.1 준비 데이터와 실제 활성화는 다르다

많은 구현에서 다음 두 단계가 섞입니다.

- joint matrix palette를 업로드 가능한 형태로 준비
- 실제 셰이더가 그 palette를 읽어 스키닝 수행

이 둘은 별개 단계입니다.

“업로드 payload 준비”가 되어 있어도, 셰이더 결선이 없으면 실제 렌더는 CPU 경로와 동일할 수 있습니다.

### 16.2 필요한 최소 구성

GPU 스키닝을 실제 활성화하려면 다음이 전부 필요합니다.

- joint matrix palette 생성
- 업로드 버퍼 또는 유니폼 레이아웃
- 요청별 바인딩 참조 정보
- 셰이더 입력 계약
- 실제 셰이더에서 JOINTS/WEIGHTS 기반 변형
- 실패 시 CPU fallback

### 16.3 CPU와 GPU가 같은 행렬을 써야 함

가장 중요한 원칙:

- CPU 경로와 GPU 경로는 최종 skinning matrix 정의가 같아야 함

이게 다르면:

- 디버그에서는 맞고 실서비스에서는 틀림
- 플랫폼별 차이 발생

### 16.4 디버깅 포인트

GPU 스키닝 경로를 만들 때는 다음을 문서화하는 것이 좋습니다.

- 현재 프레임에 몇 개 인스턴스가 GPU 준비 상태인지
- 실제 활성화된 요청 수
- fallback된 요청 수
- 어떤 sample이 어떤 binding slot을 참조하는지

이 계측이 없으면 GPU 경로 디버깅이 매우 어려워집니다.

---

## 17. Morph Target과 스키닝의 순서

공식 튜토리얼 기준, morph target이 있다면 일반적으로 다음 순서가 중요합니다.

1. morph target 가중치 적용
2. skinning 적용
3. node transform 적용

즉, morph와 skinning은 독립 기능이 아니라 순서 관계가 있습니다.

현재 스키닝만 구현하더라도, 미래 확장을 생각하면 이 순서를 문서에 고정해 두는 것이 좋습니다.

---

## 18. 실제 구현에서 자주 깨지는 원인 정리

### 18.1 `matrix` 노드 무시

현상:

- 단순 샘플은 보이는데 특정 공식 샘플에서 형상 붕괴

원인:

- `translation/rotation/scale`만 읽고 `matrix`를 무시

### 18.2 quaternion 순서 착각

현상:

- 관절이 전혀 다른 방향으로 회전

원인:

- `(w, x, y, z)`로 잘못 읽음

### 18.3 `LINEAR` 회전을 lerp로 처리

현상:

- 애니메이션 방향이 어색함
- 팔 하나만 돌려야 하는데 경로가 이상함

원인:

- quaternion `slerp` 미적용

### 18.4 `JOINTS_0`를 nodes 인덱스로 착각

현상:

- 모델이 심하게 찢어짐

원인:

- `skin.joints` 인덱스 공간을 무시

### 18.5 `inverseBindMatrices` 순서 불일치

현상:

- pose는 도는 것처럼 보이지만 메쉬가 비정상 변형

원인:

- `skin.joints`와 같은 순서로 읽지 않음

### 18.6 `normalized` 미적용

현상:

- skinning weight가 이상
- 색상/UV가 깨짐

### 18.7 메쉬 world 이중 적용

현상:

- 팔만 돌아야 하는데 캐릭터 전체가 회전
- 스키닝 모델만 위치/회전이 과장됨

원인:

- 스키닝 계산과 draw transform이 같은 world를 두 번 적용

### 18.8 비조인트 부모 체인 누락

현상:

- 어떤 모델은 되고 어떤 모델은 안 됨

원인:

- joint 사이 일반 노드 transform 무시

### 18.9 색상 기본값 잘못 사용

현상:

- 텍스처가 정상 로드돼도 화면이 검게 보임

원인:

- 색상 기본값을 `(1,1,1,1)`이 아니라 `(0,0,0,1)`로 씀

### 18.10 알파 채널을 무조건 투명도로 사용

현상:

- 불투명 모델 일부가 구멍처럼 보임

원인:

- `alphaMode` 무시

### 18.11 실제 원인은 컬링인데 투명도로 오해

현상:

- 얼굴이나 다리 일부가 비어 보임

원인:

- back-face culling
- winding 방향
- 스키닝 후 법선/면 방향 변화

---

## 19. 디버깅을 할 때 원인을 좁히는 순서

스키닝 문제는 한 번에 감으로 고치기 어렵습니다.

다음 순서로 좁히는 것이 좋습니다.

### 19.1 1단계: 파싱 레벨 확인

확인 항목:

- `skin.joints` 개수
- `inverseBindMatrices` 개수
- `JOINTS_0`, `WEIGHTS_0` accessor 타입
- `matrix` 노드 존재 여부
- `animation` channel 대상 노드

이 단계에서 틀리면 그 아래는 전부 무의미합니다.

### 19.2 2단계: 정적 bind pose 확인

애니메이션을 끄고 bind pose 상태에서 봅니다.

확인 항목:

- 이미 찌그러져 있는가
- 위치만 틀린가
- 본이 잘못 연결된 것처럼 보이는가

bind pose부터 틀리면:

- inverse bind
- joints 인덱스
- matrix 해석

를 우선 의심해야 합니다.

### 19.3 3단계: 단일 관절만 움직여 보기

한 관절만 회전하는 테스트 클립이 가장 좋습니다.

확인 항목:

- 그 관절 주변만 움직이는가
- 전체 메쉬가 끌려가는가
- 반대쪽 팔다리까지 영향이 가는가

### 19.4 4단계: bone별 행렬 덤프

다음 값을 한 프레임 기준으로 비교하면 원인을 크게 줄일 수 있습니다.

- joint node world matrix
- inverse bind matrix
- 최종 skinning matrix
- mesh node world matrix

여기서 이미 이상한 값이 보이면 렌더 문제가 아니라 수학 경로 문제입니다.

### 19.5 5단계: 텍스처/재질 문제는 분리

“모델이 깨진다”와 “표면이 비어 보인다”는 다른 문제일 수 있습니다.

따라서:

- 형상 문제
- 애니메이션 문제
- 컬링 문제
- 알파 모드 문제
- 텍스처 로드 문제

를 따로 확인해야 합니다.

---

## 20. 책임 분리가 잘 된 통합 구조 권장안

스키닝 관련 버그가 반복될 때 가장 흔한 구조 문제는 다음과 같습니다.

- 파서는 공통인데
- 런타임에서 node transform 경로와 skinning 경로가 따로 계산됨
- 제출기 내부에서 다시 애니메이션/스키닝/행렬 보정을 여러 번 함

이 구조는 정적 모델은 쉬워도, 스키닝 모델에서 좌표계 불일치가 생기기 쉽습니다.

### 20.1 권장 계층

#### A. 공통 문서 파싱 계층

역할:

- 파일 형식 해석
- JSON/버퍼/accessor 로드
- 노드/메쉬/재질/스킨/애니메이션 연결

이 단계는 정적/스키닝 모델을 따로 파싱하지 않습니다.

#### B. 공통 런타임 pose 평가 계층

역할:

- 애니메이션 샘플링
- 노드 local transform 결정
- 노드 world matrix 계산

이 계층이 문서 기준 진실 원본이어야 합니다.

#### C. 스켈레톤 평가 계층

역할:

- 공통 pose 프레임의 world matrix로 joint global 계산

중요:

- 별도 parent chain 재계산을 줄이는 쪽이 안전

#### D. 메쉬 인스턴스 스키닝 계층

역할:

- 특정 skinned mesh node 기준 최종 skinning matrix 생성

이 단계는 인스턴스별 책임입니다.

#### E. 렌더 제출 계층

역할:

- 이미 계산된 world matrix / skinning matrix / material만 받아 실제 draw 수행

이 계층은 가능하면 “다시 수학을 하지 않는” 쪽이 좋습니다.

### 20.2 왜 이 구조가 좋은가

- node animation과 skinning이 같은 기준좌표를 사용
- 스키닝 전용 보정 코드가 제출기 곳곳에 흩어지지 않음
- CPU/GPU skinning이 같은 입력을 공유
- 디버깅 시 어느 계층에서 틀어졌는지 빨리 찾을 수 있음

---

## 21. PrismCore 같은 엔진에 바로 적용할 때의 체크리스트

### 21.1 파서 체크리스트

- `.gltf`, `.glb` 둘 다 지원하는가
- `data:` URI를 디코딩하는가
- `bufferView.byteStride`를 처리하는가
- `accessor.normalized`를 처리하는가
- `matrix` 노드를 읽는가
- `inverseBindMatrices`가 없을 때 identity fallback이 있는가
- `JOINTS_0`, `WEIGHTS_0` 타입을 정확히 읽는가

### 21.2 애니메이션 체크리스트

- `STEP`, `LINEAR`, `CUBICSPLINE`을 구분하는가
- rotation은 `slerp` 기반인가
- `CUBICSPLINE` tangent에 `deltaTime`을 적용하는가
- 애니메이션이 없는 TRS 성분은 기본값 유지하는가

### 21.3 스키닝 체크리스트

- `JOINTS_0`가 `skin.joints` 인덱스 공간을 쓰는가
- 비조인트 중간 부모 노드를 반영하는가
- 최종 skinning matrix가 메쉬 인스턴스 기준으로 계산되는가
- draw 시 mesh world를 중복 적용하지 않는가
- CPU와 GPU가 같은 최종 행렬 정의를 쓰는가

### 21.4 재질/렌더 체크리스트

- `baseColorFactor` 기본값이 흰색인가
- `alphaMode`를 실제 투명도 분기에 반영하는가
- `doubleSided`에 따라 culling을 제어하는가
- 텍스처 알파 채널 존재만으로 투명 재질 취급하지 않는가

### 21.5 디버그 체크리스트

- 로드된 문서별 스킨/애니메이션 개수를 볼 수 있는가
- 현재 어떤 clip이 선택됐는지 볼 수 있는가
- 현재 CPU/GPU 스키닝 경로를 볼 수 있는가
- 문제 인스턴스의 sample 식별자를 로그로 알 수 있는가

---

## 22. 공식 샘플을 볼 때 기억해야 하는 점

공식 샘플은 서로 다른 함정을 테스트합니다.

예:

- `RiggedSimple`: 기본 스키닝 확인용
- `RiggedFigure`: 계층/행렬/스키닝 해석 오류가 잘 드러남
- `Fox`: 스키닝 + 텍스처 + 렌더링 상태 문제까지 함께 드러날 수 있음

실무 팁:

- 단순 샘플 하나만 맞는다고 구현이 끝난 것이 아님
- 서로 성격이 다른 샘플 3개 이상으로 확인해야 안정적

---

## 23. 결론

glTF 스키닝 구현에서 가장 중요한 것은 “파일을 읽는 것”보다 “같은 문서 그래프 기준으로 같은 좌표계를 끝까지 유지하는 것”입니다.

핵심 요약:

- 파싱은 공통으로 하고, 정적/스키닝 모델을 파일 단계에서 분리하지 않는 것이 좋음
- `bufferView`, `accessor`, `normalized`, `matrix`, `inverseBindMatrices`를 정확히 해석해야 함
- 애니메이션은 rotation 보간과 `CUBICSPLINE` 규칙을 특히 조심해야 함
- 스키닝은 `skin.joints` 인덱스 공간과 메쉬 인스턴스 기준 최종 행렬이 핵심
- node world, skeleton pose, mesh skinning, draw transform은 같은 공통 pose 프레임을 공유해야 함
- 재질의 `alphaMode`, `doubleSided`, 텍스처 알파 채널은 스키닝 문제와 별개로 분리해서 봐야 함

정리하면, 안정적인 glTF 구현은 다음 세 줄로 요약됩니다.

- 파싱 규칙을 정확히 지킨다.
- 좌표계 계산을 공통 프레임으로 통합한다.
- CPU/GPU/렌더 제출이 같은 최종 의미를 공유하게 만든다.

---

## 24. 참고 자료

다음 자료는 모두 공식 Khronos 계열 자료입니다.

- glTF 2.0 Specification: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
- Khronos glTF Tutorials - Scenes and Nodes: https://github.khronos.org/glTF-Tutorials/gltfTutorial/gltfTutorial_004_ScenesNodes.html
- Khronos glTF Tutorials - Buffers, BufferViews, Accessors: https://github.khronos.org/glTF-Tutorials/gltfTutorial/gltfTutorial_005_BuffersBufferViewsAccessors.html
- Khronos glTF Tutorials - Animations: https://github.khronos.org/glTF-Tutorials/gltfTutorial/gltfTutorial_007_Animations.html
- Khronos glTF Tutorials - Skins: https://github.khronos.org/glTF-Tutorials/gltfTutorial/gltfTutorial_020_Skins.html
- KhronosGroup glTF specification repository: https://github.com/KhronosGroup/glTF/tree/main/specification/2.0

이 문서는 위 공식 자료의 규칙을 구현 관점으로 재정리한 것입니다.
