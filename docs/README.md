# 문서 구조 안내

`docs` 폴더의 문서는 성격이 비슷한 것끼리 아래처럼 정리한다.

## 루트 문서

프로젝트의 기준 문서는 루트에 유지한다.

- `codex_working_rules.md`
- `shader_playground_guide.md`
- `shader_playground_development_plan.md`
- `shader_playground_wbs.md`

이 문서들은 작업 기준과 전체 프로젝트 범위를 정의하므로 경로를 고정한다.

## `editor/`

에디터, 인스펙터 메타데이터, CodeMirror 전환 검토 문서를 둔다.

- `codemirror6_migration_plan.md`
- `codemirror6_migration_review.md`
- `codemirror6_poc_plan.md`
- `codemirror6_poc_result.md`
- `inspector_comment_metadata_guide.md`

## `performance/`

성능 점검과 최적화 관련 문서를 둔다.

- `performance_audit.md`

## `gltf/`

glTF, glb, 마인크래프트 커스텀 glTF 렌더러 관련 조사 문서를 둔다.

- `gltf-parsing-and-skinning-research.md`
- `gltf_glb_webgl_research.md`
- `minecraft-custom-gltf-renderer-development-plan.md`

## `features/replay_wrap_transform/`

셰이더 재생, 텍스처 반복, 블렌드, 모델 기즈모 관련 문서를 둔다.

- `replay_wrap_transform_research.md`
- `replay_wrap_transform_development_plan.md`
- `replay_wrap_transform_wbs.md`
- `replay_wrap_transform_sprint_plan.md`

## 정리 원칙

- 프로젝트 전체 기준 문서는 루트에 둔다.
- 특정 기능의 조사, 계획, WBS, 스프린트 문서는 같은 하위 폴더에 둔다.
- 실험성 조사 문서는 관련 기술 폴더로 모은다.
- 새 문서를 추가할 때도 같은 주제의 기존 폴더가 있으면 그 폴더를 우선 사용한다.
