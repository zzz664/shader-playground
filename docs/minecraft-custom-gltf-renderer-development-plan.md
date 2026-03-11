# 마인크래프트 커스텀 glTF 렌더링 엔진 개발 계획

## 문서 목적

이 문서는 [`docs/gltf/gltf-parsing-and-skinning-research.md`](./gltf-parsing-and-skinning-research.md),
[`docs/gltf/prismcore-gltf-spec-gap-checklist.md`](./prismcore-gltf-spec-gap-checklist.md),
그리고 `docs/custom-system/` 계열 문서에서 정리된 기존 조사 결과를 바탕으로,
마인크래프트 클라이언트 위에 "엔진 수준"의 커스텀 glTF 렌더링 시스템을 구현하기 위한 통합 개발 계획을 정의합니다.

여기서 목표로 하는 시스템은 단순한 모델 로더가 아닙니다.
Unity/Unreal의 renderer처럼 다음을 하나의 런타임 계약으로 묶는 전용 렌더링 엔진 계층입니다.

- 자산 파싱
- 자산 검증/정규화
- 장면 그래프 평가
- 애니메이션 재생
- 스키닝
- morph target
- 재질/텍스처 해석
- 렌더 제출
- 디버깅/리로드/회귀 검증

핵심 목표는 "보이는 수준으로 대충 동작"이 아니라, glTF 2.0 코어 기능을 안정적으로 처리하고,
잘못된 입력은 조용히 무시하지 않고 명시적으로 진단하며,
CPU 경로와 GPU 경로가 동일한 결과 의미를 공유하는 구조를 만드는 것입니다.

---

## 1. 현재 문서 기준 출발점

기존 문서에서 이미 확보된 사실은 다음과 같습니다.

- `.gltf` / `.glb` 컨테이너 해석, `data:` URI, `bufferView` 기반 이미지, `byteStride`, `normalized`, `CUBICSPLINE`, quaternion `slerp` 등 glTF 핵심 난점은 이미 분석됨
- glTF 런타임의 핵심 위험은 "파싱" 자체보다 `node world`, `skeleton pose`, `mesh skinning`, `draw transform` 간 좌표계 불일치에 있음
- 현재 PrismCore 계열 설계는 공통 pose 프레임 중심 구조가 맞는 방향이며, 스키닝은 반드시 메쉬 인스턴스 기준 최종 행렬을 공유해야 함
- 현재 스펙 갭은 주로 `sparse accessor`, `morph target`, `JOINTS_1/WEIGHTS_1`, non-triangle primitive, raw `matrix` 보존, 정밀 sampler/material 해석, 실제 GPU 스키닝 활성화에 집중되어 있음

즉, 이번 계획은 "처음부터 다시 생각하는 문서"가 아니라,
이미 정리된 분석을 기반으로 "실제 엔진 수준의 구현 순서와 구조"를 고정하는 문서입니다.

---

## 2. 목표 품질 기준

이 엔진은 다음 기준을 충족해야 합니다.

### 2.1 기능 완전성 기준

최소 기준은 "캐릭터 한 개가 보인다"가 아닙니다.
`glTF 2.0 core` 기준으로 다음은 런타임 계약에 포함합니다.

- `.gltf`, `.glb`
- scenes / nodes / meshes / materials / textures / images / samplers / skins / animations / accessors
- `matrix` 노드와 TRS 노드 동시 지원
- `STEP`, `LINEAR`, `CUBICSPLINE`
- `JOINTS_n`, `WEIGHTS_n`
- morph target geometry 및 `weights` 애니메이션
- `sparse accessor`
- non-triangle primitive의 명시 지원 또는 안전한 변환/거부
- material alpha/culling/sampler 정책의 일관된 반영

### 2.2 안정성 기준

- 지원하지 않는 기능은 조용히 무시하지 않고, 자산 식별자와 함께 명시 실패 처리
- 파서와 런타임 계산 경로는 입력 검증을 반드시 수행
- CPU 스키닝과 GPU 스키닝은 같은 최종 skinning matrix 정의를 사용
- 리소스 리로드 후에도 캐시, GPU 리소스, 인스턴스 상태가 재구축 가능해야 함

### 2.3 디버깅 가능성 기준

- 로드된 문서, scene, animation clip, skin, morph target 개수를 확인 가능해야 함
- 현재 인스턴스가 어떤 animation clip, CPU/GPU skinning 경로를 사용하는지 확인 가능해야 함
- bone matrix, inverse bind, 최종 skinning matrix, draw world matrix를 프레임 단위로 덤프 가능해야 함

### 2.4 회귀 방지 기준

- Khronos 샘플 기반 자동 회귀 테스트 세트 구축
- 파서 단위 테스트, pose evaluator 단위 테스트, golden image 기반 렌더 회귀 테스트 구축
- 신규 기능 도입 시 기존 샘플이 깨지지 않는지 반드시 검증

---

## 3. 핵심 설계 원칙

### 3.1 외부 포맷과 내부 런타임 포맷을 분리한다

glTF는 입력 표준이지, 내부 상태 구조가 아닙니다.
엔진은 glTF JSON 구조를 직접 들고 렌더링하지 않고, 검증과 정규화를 거친 내부 런타임 자산으로 변환해야 합니다.

권장 내부 포맷:

- `RuntimeSceneAsset`
- `RuntimeNodeAsset`
- `RuntimeMeshAsset`
- `RuntimePrimitiveAsset`
- `RuntimeMaterialAsset`
- `RuntimeTextureAsset`
- `RuntimeSamplerAsset`
- `RuntimeSkinAsset`
- `RuntimeAnimationClipAsset`
- `RuntimeMorphTargetAsset`

### 3.2 파싱 계층과 런타임 평가 계층을 분리한다

- 파싱 계층: 파일 해석, 참조 연결, 검증, 정규화
- 런타임 계층: 인스턴스 상태, 애니메이션 시간, 포즈 계산, skinning, 드로우 제출

이 둘이 섞이면, 디버깅 시 "파일 문제"와 "프레임 계산 문제"를 분리할 수 없습니다.

### 3.3 pose 프레임을 단일 진실 원본으로 유지한다

매 프레임 다음은 반드시 같은 평가 프레임을 공유해야 합니다.

- node local / world
- skeleton joint global
- morph weight state
- mesh instance skinning matrix
- draw transform

이 원칙이 깨지면, 정적 메시는 멀쩡한데 스키닝만 깨지는 구조가 반복됩니다.

### 3.4 지원 범위 밖 기능은 명시적으로 거절한다

특정 기능을 당장 구현하지 못하더라도,
"조용히 무시해서 대충 보여주는" 방식은 엔진 품질을 망칩니다.

반드시 다음 중 하나로 처리합니다.

- 완전 지원
- 안전한 fallback
- 명시적 hard fail

### 3.5 마인크래프트 제약은 렌더 백엔드에서 흡수한다

glTF 의미론과 Minecraft 렌더링 제약은 다릅니다.
이 차이를 파서나 애니메이션 계산기에 섞지 말고, 렌더 백엔드 계층에서 흡수해야 합니다.

대표 제약:

- `MultiBufferSource` / `RenderType` consumer 수명 규칙
- 클라이언트 전용 렌더링
- 리소스 리로드 시 GPU 리소스 재생성
- Minecraft 렌더 패스와 투명 정렬 정책

---

## 4. 목표 엔진 아키텍처

## 4.1 계층 구조

다음 8개 서브시스템으로 분리합니다.

### A. glTF Import Subsystem

역할:

- `.gltf` / `.glb` 읽기
- JSON 및 바이너리 청크 해석
- `buffer`, `bufferView`, `accessor`, `image`, `texture`, `sampler` 복원
- 인덱스 연결 및 원본 문서 그래프 생성

출력:

- `RawGltfDocument`

이 단계는 스펙을 최대한 충실히 읽는 계층입니다.

### B. Validation and Normalization Subsystem

역할:

- 필수 필드 검증
- 참조 무결성 검증
- `componentType`, `type`, `count`, stride 범위 검증
- `normalized`, column-major, `matrix`/TRS 정책 해석
- unsupported extension / unsupported feature 정책 적용

출력:

- 검증된 `ValidatedGltfDocument`

이 단계의 책임은 "조용히 고쳐서 넘어가기"가 아니라 "정확히 읽고 정확히 거부하기"입니다.

### C. Asset Compilation Subsystem

역할:

- 검증된 glTF 문서를 런타임 자산으로 컴파일
- CPU 친화 메모리 구조 생성
- GPU 업로드 단위 분할
- scene/node/skin/animation/morph/material 관계 보존

출력:

- `RuntimeGltfAssetBundle`

이 단계에서 외부 포맷 의존성이 런타임에서 제거됩니다.

### D. Runtime Scene Subsystem

역할:

- scene 인스턴스 생성/파괴
- node hierarchy 인스턴스화
- 인스턴스별 transform state 보관
- scene root 선택, attach point 관리

출력:

- `SceneInstance`
- `NodeInstance`
- `RenderableInstance`

### E. Animation Runtime Subsystem

역할:

- clip time 계산
- channel sampling
- `STEP`, `LINEAR`, `CUBICSPLINE` 평가
- partial override(TRS 일부만 덮는 경우) 처리
- state machine / layering / blending
- morph `weights` 채널 상태 계산

출력:

- `AnimationPoseFrame`

### F. Skinning and Deformation Subsystem

역할:

- skeleton joint global 계산
- mesh instance 기준 최종 skinning matrix 계산
- morph target 적용
- CPU skinning / GPU skinning 공통 데이터 생성

출력:

- `SkeletonPoseFrame`
- `MeshDeformationFrame`
- `GpuSkinningPalette`

주의:

- morph -> skinning -> node transform 순서를 고정
- CPU/GPU가 동일한 최종 행렬 의미를 공유

### G. Material and Shader Subsystem

역할:

- glTF material 의미를 엔진 재질 계약으로 변환
- `alphaMode`, `alphaCutoff`, `doubleSided`, texture binding, sampler 정책 반영
- Minecraft RenderType 및 셰이더 파이프라인 결정
- 향후 PBR 단순화/확장 지점을 분리

출력:

- `ResolvedMaterialInstance`
- `RenderPipelineKey`

### H. Render Submission Subsystem

역할:

- 최종 `RenderableInstance`를 draw packet으로 변환
- 불투명/컷아웃/반투명 패스 분기
- 정렬 및 배치
- `MultiBufferSource` 규칙을 지키는 실제 정점 제출

출력:

- 실제 Minecraft 렌더 호출

이 계층은 "이미 계산된 결과를 소비"해야 하며,
애니메이션/스키닝 수학을 다시 수행하면 안 됩니다.

---

## 4.2 런타임 프레임 실행 순서

매 프레임 업데이트는 다음 순서로 고정합니다.

1. 입력/게임 상태로 animation state 결정
2. clip time 계산
3. animation channel 샘플링
4. node local transform 확정
5. node world matrix 계산
6. morph weight 상태 계산
7. skeleton joint global 계산
8. mesh instance 기준 최종 skinning matrix 계산
9. morph deformation 적용
10. CPU skinning 또는 GPU palette 업로드 데이터 생성
11. material resolve
12. draw packet 생성
13. 렌더 패스 제출

이 순서는 문서로만 두지 말고 코드 구조와 테스트도 같은 순서를 강제해야 합니다.

---

## 5. glTF 기능별 구현 계약

## 5.1 컨테이너 및 바이너리

필수 지원:

- `.gltf`
- `.glb`
- 외부 `uri`
- `data:` URI
- `bufferView` 기반 이미지

필수 검증:

- `.glb` `magic`, `version`, `length`
- JSON/BIN 청크 순서와 길이
- 상대 경로 및 리소스 네임스페이스 정책

## 5.2 Accessor 계층

필수 지원:

- 모든 core `componentType`
- `SCALAR` / `VECn` / `MATn`
- `byteStride`
- `normalized`
- `sparse accessor`

필수 원칙:

- `bufferView.byteOffset + accessor.byteOffset`는 항상 합산
- `JOINTS_*`는 정수 경로 유지
- `WEIGHTS_*`, `COLOR_*`, `TEXCOORD_*`는 `normalized` 반영
- `MAT4`는 column-major 기준으로 해석

## 5.3 Geometry 및 Primitive

필수 지원:

- `POSITION`
- `NORMAL`
- `TANGENT`
- `COLOR_0`
- `TEXCOORD_n`
- `JOINTS_n`
- `WEIGHTS_n`

primitive 모드 정책:

- `TRIANGLES`는 직접 렌더
- strip/fan/line 계열은 전용 변환기 또는 전용 렌더 경로 구현
- 초기 단계에 미완성이면 "명시적 거부 + 자산 로그"로 처리

## 5.4 Node / Scene / Transform

필수 지원:

- scene 루트 선택
- parent-child hierarchy
- TRS (`T * R * S`)
- raw `matrix`

중요 규칙:

- `matrix`는 TRS로 분해만 해 저장하지 말고 원형을 보존해야 함
- runtime은 최종 local matrix를 공통 계약으로 사용
- quaternion은 `(x, y, z, w)` 기준으로 처리

## 5.5 Animation

필수 지원:

- `STEP`
- `LINEAR`
- `CUBICSPLINE`
- `translation`, `rotation`, `scale`, `weights`

중요 규칙:

- `rotation`은 shortest-path `slerp`
- hemisphere alignment 적용
- `CUBICSPLINE`은 tangent에 segment duration 반영
- 애니메이션이 덮지 않는 성분은 노드 기본값 유지

## 5.6 Skinning

필수 지원:

- `skin.joints`
- `inverseBindMatrices` 및 identity fallback
- 비조인트 중간 부모 체인 반영
- `JOINTS_1+`, `WEIGHTS_1+`
- 정점당 influence 수 확장 처리

중요 규칙:

- `JOINTS_*`는 `skin.joints` 인덱스 공간을 사용
- 최종 skinning matrix는 메쉬 인스턴스 기준으로 계산
- CPU/GPU가 같은 행렬 정의를 공유
- draw 단계에서 mesh world를 이중 적용하지 않음

## 5.7 Morph Target

필수 지원:

- primitive `targets`
- position/normal/tangent delta
- mesh 기본 weights
- node/animation `weights`

중요 규칙:

- morph는 skinning 이전 적용
- morph target 미지원 상태에서 `weights` 채널만 샘플링하는 반쪽 구현은 허용하지 않음

## 5.8 Material / Texture / Sampler

필수 지원:

- `baseColorFactor`
- `baseColorTexture`
- `metallicRoughness`
- `normalTexture`
- `occlusionTexture`
- `emissiveTexture`
- `alphaMode`
- `alphaCutoff`
- `doubleSided`
- `wrapS`, `wrapT`, `magFilter`, `minFilter`

중요 규칙:

- 텍스처 알파 채널 존재만으로 투명 재질 취급 금지
- `alphaMode`가 실제 패스 분기를 결정
- `doubleSided`가 culling 정책을 결정
- sampler 단순화는 허용하더라도 결과 차이를 문서화하고 테스트해야 함

## 5.9 Extension 정책

권장 정책:

- core 2.0은 완전 지원 목표
- extension은 화이트리스트 기반 단계 지원
- `extensionsRequired`에 미지원 항목이 있으면 hard fail
- `extensionsUsed`만 있고 비핵심이면 제한적 fallback 가능

1차 우선 후보:

- `KHR_texture_transform`
- `KHR_materials_unlit`

2차 후보:

- 압축/전송 최적화 계열 extension

---

## 6. 마인크래프트 통합 설계

## 6.1 클라이언트 전용 렌더링

렌더링과 변형 계산은 전부 클라이언트에서 수행합니다.
서버는 다음만 책임집니다.

- 어떤 자산을 재생할지
- 어떤 animation state를 시작/중지할지
- 어떤 시각 파라미터를 사용할지

서버가 메시 변형, bone 계산, 셰이더 파라미터 계산을 직접 하지 않도록 구조를 고정합니다.

## 6.2 RenderType / BufferSource 규칙

기존 문서에서 확인된 것처럼, `MultiBufferSource`는 `RenderType`별 consumer 수명 관리가 매우 중요합니다.

강제 규칙:

- 같은 `RenderType` 정점은 가능한 한 연속으로 즉시 기록
- 다른 `RenderType` consumer를 오래 보관하지 않음
- 제출기 내부에서 consumer 수명을 명시적으로 통제

이 규칙을 어기면 `IllegalStateException: Not building!` 계열 크래시가 반복됩니다.

## 6.3 리소스 리로드

리소스 리로드는 예외 처리 항목이 아니라 엔진의 기본 기능입니다.

필수 항목:

- CPU asset cache 재구축
- GPU buffer / texture 재생성
- material/pipeline cache 무효화
- 기존 인스턴스의 asset handle 재바인딩

권장 방식:

- `prepare/apply` 2단계 구조
- parse/validate 단계와 실제 적용 단계 분리

## 6.4 디버그 오버레이와 개발자 콘솔

최소한 다음은 실시간 확인 가능해야 합니다.

- 현재 로드된 glTF asset 수
- scene instance 수
- active animation clip
- CPU/GPU skinning 여부
- primitive 수 / draw packet 수
- morph target 활성 개수
- 최근 실패한 자산 식별자와 실패 원인

---

## 7. 개발 단계

## Phase 0. 계약 고정

목표:

- 내부 런타임 데이터 모델 정의
- 서브시스템 경계 정의
- 오류 정책, 로그 정책, 디버그 정책 고정

완료 기준:

- 자산/인스턴스/포즈/스키닝/재질 데이터 구조 문서화
- 신규 기능이 어느 계층에 들어가야 하는지 명확해짐

## Phase 1. 정합성 파서

목표:

- `.gltf` / `.glb` 파서 완성
- accessor / image / sampler / material core 해석 완성
- `sparse accessor` 및 raw `matrix` 처리 완성

완료 기준:

- 파싱 단계에서 잘못된 자산을 정확히 차단
- Khronos 기본 샘플을 파일 레벨에서 안정적으로 로드

## Phase 2. 런타임 자산 컴파일러와 캐시

목표:

- `RawGltfDocument` -> `RuntimeGltfAssetBundle` 컴파일
- asset registry / handle / reload 체계 구축

완료 기준:

- 같은 자산의 다중 인스턴스가 파싱 없이 재사용
- 리로드 시 CPU/GPU 캐시가 재구축

## Phase 3. 정적 렌더링 경로

목표:

- 정적 mesh, hierarchy, material, texture 렌더링
- opaque/mask/blend 패스 분기
- RenderType 안전 제출 구조 확보

완료 기준:

- 정적 glTF 자산이 world에 안정적으로 렌더
- `doubleSided`, `alphaMode`의 기본 의미가 반영

## Phase 4. 애니메이션 런타임

목표:

- clip sampling
- pose frame 계산
- state machine / blend 1차 구현

완료 기준:

- TRS 애니메이션 샘플이 공식 기대값과 일치
- `STEP`, `LINEAR`, `CUBICSPLINE` 회귀 테스트 통과

## Phase 5. 스켈레톤 및 CPU 스키닝

목표:

- skeleton pose
- mesh instance 기준 skinning matrix
- CPU deformation

완료 기준:

- `RiggedSimple`, `RiggedFigure`, `Fox` 계열 샘플이 형상 붕괴 없이 재생
- bind pose / animated pose 모두 일관됨

## Phase 6. Morph Target 및 고급 속성

목표:

- morph target geometry
- `weights` 채널의 실제 변형
- `TANGENT`, `COLOR_0`, `TEXCOORD_1+`, `JOINTS_1+`, `WEIGHTS_1+`

완료 기준:

- 표정/세부 변형이 포함된 자산 재생
- 고급 리깅 자산에서 4개 초과 influence 처리

## Phase 7. GPU 스키닝

목표:

- joint palette 업로드
- shader 입력 계약 완성
- CPU/GPU 선택 및 fallback 구현

완료 기준:

- 동일 자산에서 CPU/GPU 결과 차이가 허용 오차 내
- 디버그 UI에서 활성 경로 확인 가능

## Phase 8. 머티리얼/셰이더 확장

목표:

- sampler 정밀도 개선
- material 해석 확장
- 향후 VFX / custom material과 공존 가능한 구조 확보

완료 기준:

- glTF 재질 의미와 Minecraft 렌더 경로 간 차이가 문서화되고 테스트됨

## Phase 9. 프로덕션 하드닝

목표:

- 성능 계측
- 메모리 사용량 점검
- 에러 메시지 정리
- 장시간 세션/리로드/멀티 인스턴스 안정화

완료 기준:

- 리소스 리로드 반복 시 누수/깨짐 없음
- 대량 인스턴스에서도 프레임 드롭 원인 계측 가능

---

## 8. 테스트 및 검증 전략

## 8.1 공식 샘플 회귀 세트

최소 회귀 세트:

- `RiggedSimple`
- `RiggedFigure`
- `Fox`
- 정적 hierarchy 샘플
- morph target 샘플
- `CUBICSPLINE` 애니메이션 샘플

목적:

- 스키닝, 계층, 재질, sampler, morph, 애니메이션 보간을 분리 검증

## 8.2 단위 테스트

필수 단위 테스트 영역:

- `.glb` 청크 파서
- accessor stride / normalized / sparse 처리
- quaternion `slerp`
- `CUBICSPLINE` evaluator
- skinning matrix 조합
- morph -> skinning 순서

## 8.3 시각 회귀 테스트

방법:

- 기준 카메라, 기준 포즈, 기준 프레임을 고정
- 렌더 결과를 golden image와 비교

대상:

- 정적 메시
- alpha/culling
- 스키닝
- morph
- GPU skinning

## 8.4 실패 우선 정책

테스트에서 다음은 즉시 실패 처리합니다.

- 조용한 fallback으로 인한 시각 불일치
- CPU/GPU 결과 의미 불일치
- bind pose와 animated pose 간 기준좌표 불일치
- 리로드 후 캐시 핸들 오염

---

## 9. 주요 위험과 대응

### 위험 1. 기능을 파서만 추가하고 런타임 적용을 누락

예:

- `weights` 채널은 읽지만 morph는 적용하지 않음

대응:

- "파싱 지원"과 "런타임 의미 지원"을 문서와 테스트에서 분리 관리

### 위험 2. raw `matrix`를 다시 TRS 전용 구조로 축소

대응:

- 내부 노드 계약에 raw matrix 보존 필드를 강제
- 분해는 최적화 경로이지 유일 경로가 아니어야 함

### 위험 3. 스키닝과 draw transform의 이중 적용

대응:

- 메쉬 인스턴스 기준 최종 행렬 정의를 코드 레벨로 고정
- 제출기에서 추가 수학 금지

### 위험 4. CPU와 GPU 경로가 다른 결과를 만듦

대응:

- 공통 palette 생성기를 단일 진실 원본으로 사용
- CPU/GPU 모두 같은 데이터에서 파생

### 위험 5. Minecraft 백엔드 제약이 상위 계층으로 새어 나감

대응:

- `RenderType`, `MultiBufferSource` 특수 처리는 제출기 계층에 한정
- 파서/애니메이터/스키너는 Minecraft API를 직접 알지 않도록 유지

---

## 10. 완료 판정 기준

다음 조건을 만족할 때 이 엔진을 "실사용 가능한 커스텀 glTF 렌더링 엔진"으로 판정합니다.

1. glTF 2.0 core 자산을 파싱 단계에서 정확히 검증하고, 미지원 기능을 조용히 무시하지 않는다.
2. 정적 메시, 계층 메시, 애니메이션 메시, 스키닝 메시, morph 메시를 같은 런타임 계약으로 처리한다.
3. `matrix`, `CUBICSPLINE`, `sparse accessor`, `JOINTS_1+`, `WEIGHTS_1+`, morph target을 포함한 핵심 난점을 처리한다.
4. CPU 스키닝과 GPU 스키닝이 같은 자산에서 동일 의미의 결과를 낸다.
5. 리소스 리로드 이후에도 자산 캐시와 인스턴스가 안정적으로 복구된다.
6. Khronos 회귀 세트와 내부 golden image 회귀 테스트를 지속적으로 통과한다.

---

## 11. 최종 정리

이 계획의 핵심은 "glTF를 읽는 기능"을 만드는 것이 아닙니다.
마인크래프트 위에 다음 특성을 가진 전용 렌더링 엔진 계층을 세우는 것입니다.

- 스펙 기반 파싱
- 엔진형 런타임 데이터 모델
- 단일 pose 프레임 중심 평가
- morph + skinning + material + render submission의 일관된 파이프라인
- Minecraft 제약을 흡수하는 전용 백엔드
- 회귀 테스트와 디버그 도구를 포함한 운영 가능한 구조

즉, 목표는 "모델이 보이는 수준"이 아니라,
"캐릭터, 장비, 몹, 이펙트가 같은 런타임 계약 위에서 안정적으로 움직이고 렌더링되는 glTF 엔진"입니다.
