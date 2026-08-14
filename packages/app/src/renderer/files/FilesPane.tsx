import { useEffect, useRef, useState } from 'react'
import { randomUUID } from '../uuid'

type Props = {
  agentId: string
  searchFocusToken?: number
}

async function api(body: Record<string, unknown>) {
  return window.openbot.request({ id: randomUUID(), ...body })
}

export function FilesPane({ agentId, searchFocusToken = 0 }: Props) {
  const [files, setFiles] = useState<string[]>([])
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [preview, setPreview] = useState<string>('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void (async () => {
      const res = await api({ type: 'agent.files', agentId })
      if (res.ok && Array.isArray(res.files)) setFiles(res.files as string[])
    })()
  }, [agentId])

  useEffect(() => {
    if (searchFocusToken > 0) searchRef.current?.focus()
  }, [searchFocusToken])

  const visible = files.filter((f) => !filter || f.toLowerCase().includes(filter.toLowerCase()))

  const openFile = async (path: string) => {
    setSelected(path)
    const res = await api({ type: 'agent.readFile', agentId, path })
    if (res.ok && typeof res.text === 'string') setPreview(res.text)
    else setPreview('')
  }

  return (
    <div className="files-pane" data-testid="files-pane">
      <input
        ref={searchRef}
        className="files-search"
        data-testid="files-search"
        placeholder="Search files"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        aria-label="Search files"
      />
      <div className="files-list" data-testid="files-list">
        {visible.map((f) => (
          <button
            key={f}
            type="button"
            className={selected === f ? 'file-row selected' : 'file-row'}
            data-testid={`file-row-${f}`}
            onClick={() => void openFile(f)}
          >
            {f}
          </button>
        ))}
      </div>
      {selected ? (
        <pre className="files-preview" data-testid="files-preview">
          {preview}
        </pre>
      ) : null}
    </div>
  )
}
