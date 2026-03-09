interface ProjectPanelProps {
  isDirty: boolean
  lastSavedAt: string | null
  projectStatusMessage: string | null
  onSave: () => void
  onLoad: () => Promise<void>
  onExport: () => void
  onImport: (file: File) => Promise<void>
  onClearStored: () => void
}

export function ProjectPanel({
  isDirty,
  lastSavedAt,
  projectStatusMessage,
  onSave,
  onLoad,
  onExport,
  onImport,
  onClearStored,
}: ProjectPanelProps) {
  return (
    <section className="project-panel">
      <div className="project-panel__header">
        <div>
          <p className="panel__eyebrow">Project</p>
          <h2>저장 / 불러오기</h2>
        </div>
        <span className={`status-chip ${isDirty ? 'status-chip--error' : 'status-chip--ready'}`}>
          {isDirty ? '변경됨' : '동기화됨'}
        </span>
      </div>

      <div className="project-panel__actions">
        <button type="button" className="viewport-controls__reset" onClick={onSave}>
          로컬 저장
        </button>
        <button type="button" className="viewport-controls__reset" onClick={() => void onLoad()}>
          로컬 불러오기
        </button>
        <button type="button" className="viewport-controls__reset" onClick={onExport}>
          JSON 내보내기
        </button>
        <label className="texture-slot project-panel__import">
          <input
            type="file"
            accept="application/json"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (!file) {
                return
              }

              void onImport(file)
              event.currentTarget.value = ''
            }}
          />
          <span>JSON 가져오기</span>
        </label>
        <button type="button" className="viewport-controls__reset" onClick={onClearStored}>
          저장본 삭제
        </button>
      </div>

      <dl className="project-panel__facts">
        <div>
          <dt>최근 저장</dt>
          <dd>{lastSavedAt ?? '-'}</dd>
        </div>
        <div>
          <dt>상태</dt>
          <dd>{projectStatusMessage ?? '대기 중'}</dd>
        </div>
      </dl>
    </section>
  )
}
