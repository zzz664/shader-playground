import type { ModelAsset } from '../../shared/types/modelAsset'
import type { TextureAsset, TextureWrapMode } from '../../shared/types/textureAsset'

interface AssetBrowserPanelProps {
  modelAsset: ModelAsset | null
  textureAssets: TextureAsset[]
  usedTextureIds: Set<string>
  onDeleteTexture: (assetId: string) => void
  onTextureWrapChange: (
    assetId: string,
    wrapAxis: 'wrapS' | 'wrapT',
    wrapMode: TextureWrapMode,
  ) => void
  onClearModel: () => void
}

export function AssetBrowserPanel({
  modelAsset,
  textureAssets,
  usedTextureIds,
  onDeleteTexture,
  onTextureWrapChange,
  onClearModel,
}: AssetBrowserPanelProps) {
  return (
    <section className="asset-browser-panel">
      <div className="asset-browser-panel__header">
        <p className="panel__eyebrow">Assets</p>
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
            <p>
              메시 {modelAsset.meshCount}개 / 삼각형 {Math.floor(modelAsset.indices.length / 3)}개
            </p>
            <p>현재 모델 프리뷰에 사용 중입니다.</p>
          </article>
        ) : (
          <p className="asset-browser-panel__empty">현재 등록된 모델이 없습니다.</p>
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
                  <div className="asset-card__wrap-grid">
                    <label>
                      <span>Wrap S</span>
                      <select
                        value={asset.wrapS}
                        onChange={(event) =>
                          onTextureWrapChange(
                            asset.id,
                            'wrapS',
                            event.target.value as TextureWrapMode,
                          )
                        }
                      >
                        <option value="repeat">Repeat</option>
                        <option value="clamp">Clamp</option>
                        <option value="mirror">Mirror</option>
                      </select>
                    </label>
                    <label>
                      <span>Wrap T</span>
                      <select
                        value={asset.wrapT}
                        onChange={(event) =>
                          onTextureWrapChange(
                            asset.id,
                            'wrapT',
                            event.target.value as TextureWrapMode,
                          )
                        }
                      >
                        <option value="repeat">Repeat</option>
                        <option value="clamp">Clamp</option>
                        <option value="mirror">Mirror</option>
                      </select>
                    </label>
                  </div>
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
