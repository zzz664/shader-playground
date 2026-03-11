import type { ChangeEvent } from 'react'
import type { ModelAsset } from '../../shared/types/modelAsset'

interface ModelImportPanelProps {
  modelAsset: ModelAsset | null
  modelLoadError: string | null
  isUploadingModel: boolean
  onModelUpload: (files: File[]) => Promise<void>
  onModelClear: () => void
}

export function ModelImportPanel({
  modelAsset,
  modelLoadError,
  isUploadingModel,
  onModelUpload,
  onModelClear,
}: ModelImportPanelProps) {
  const handleModelFileChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const nextFiles = event.target.files ? Array.from(event.target.files) : []
    if (nextFiles.length === 0) {
      return
    }

    try {
      await onModelUpload(nextFiles)
    } finally {
      event.target.value = ''
    }
  }

  return (
    <section className="model-import-panel">
      <div className="model-import-panel__header">
        <p className="panel__eyebrow">FBX Import</p>
        {modelAsset ? (
          <button
            type="button"
            className="viewport-controls__reset"
            onClick={onModelClear}
          >
            Clear
          </button>
        ) : null}
      </div>

      <label className="texture-slot">
        <span>
          {isUploadingModel
            ? 'FBX를 불러오는 중입니다.'
            : 'FBX와 관련 텍스처를 업로드'}
        </span>
        <input
          type="file"
          accept=".fbx,image/png,image/jpeg,image/webp"
          multiple
          onChange={handleModelFileChange}
          disabled={isUploadingModel}
        />
      </label>

      {modelAsset ? (
        <dl className="model-import-panel__facts">
          <div>
            <dt>파일</dt>
            <dd>{modelAsset.name}</dd>
          </div>
          <div>
            <dt>메시</dt>
            <dd>{modelAsset.meshCount}</dd>
          </div>
          <div>
            <dt>정점</dt>
            <dd>{modelAsset.vertices.length / 8}</dd>
          </div>
          <div>
            <dt>삼각형</dt>
            <dd>{Math.floor(modelAsset.indices.length / 3)}</dd>
          </div>
        </dl>
      ) : (
        <p className="model-import-panel__empty">
          업로드한 FBX가 없으면 기본 geometry preview를 사용합니다.
        </p>
      )}

      {modelAsset?.warningMessages.length ? (
        <ul className="model-import-panel__warnings">
          {modelAsset.warningMessages.map((warningMessage) => (
            <li key={warningMessage}>{warningMessage}</li>
          ))}
        </ul>
      ) : null}

      {modelLoadError ? (
        <p className="model-import-panel__error">{modelLoadError}</p>
      ) : null}
    </section>
  )
}
