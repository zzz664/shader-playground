import type { ModelAsset } from '../../shared/types/modelAsset'
import type { TextureAsset } from '../../shared/types/textureAsset'

interface AssetBrowserPanelProps {
  modelAsset: ModelAsset | null
  textureAssets: TextureAsset[]
  usedTextureIds: Set<string>
  onDeleteTexture: (assetId: string) => void
  onClearModel: () => void
}

export function AssetBrowserPanel({
  modelAsset,
  textureAssets,
  usedTextureIds,
  onDeleteTexture,
  onClearModel,
}: AssetBrowserPanelProps) {
  return (
    <section className="asset-browser-panel">
      <div className="asset-browser-panel__header">
        <div>
          <p className="panel__eyebrow">Assets</p>
          <h2>Asset Browser</h2>
        </div>
        <span className="status-chip status-chip--ready">{textureAssets.length + (modelAsset ? 1 : 0)}개</span>
      </div>

      <div className="asset-browser-panel__section">
        <div className="asset-browser-panel__section-header">
          <strong>모델</strong>
          {modelAsset ? (
            <button type="button" className="viewport-controls__reset" onClick={onClearModel}>
              모델 제거
            </button>
          ) : null}
        </div>

        {modelAsset ? (
          <article className="asset-card">
            <strong>{modelAsset.name}</strong>
            <p>메쉬 {modelAsset.meshCount}개 / 삼각형 {Math.floor(modelAsset.indices.length / 3)}개</p>
            <p>활성 모델</p>
          </article>
        ) : (
          <p className="asset-browser-panel__empty">현재 활성 모델이 없습니다.</p>
        )}
      </div>

      <div className="asset-browser-panel__section">
        <div className="asset-browser-panel__section-header">
          <strong>텍스처</strong>
          <span>{textureAssets.length}개</span>
        </div>

        {textureAssets.length > 0 ? (
          <div className="asset-browser-panel__list">
            {textureAssets.map((asset) => (
              <article key={asset.id} className="asset-card asset-card--texture">
                <img src={asset.previewUrl} alt={asset.fileName} />
                <div>
                  <strong>{asset.fileName}</strong>
                  <p>
                    {asset.width} x {asset.height}
                  </p>
                  <p>{usedTextureIds.has(asset.id) ? '사용 중' : '미사용'}</p>
                  <p>{asset.sourceKind === 'model' ? '모델 텍스처' : '수동 업로드'}</p>
                </div>
                <button
                  type="button"
                  className="viewport-controls__reset"
                  onClick={() => onDeleteTexture(asset.id)}
                >
                  삭제
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p className="asset-browser-panel__empty">등록된 텍스처가 없습니다.</p>
        )}
      </div>
    </section>
  )
}
