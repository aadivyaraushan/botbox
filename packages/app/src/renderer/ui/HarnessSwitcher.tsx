import claudeLogo from '../../assets/harness/claude-code.svg?raw'
import codexLogo from '../../assets/harness/codex.svg?raw'

type Props = {
  harness: 'claude-code' | 'codex'
  disabled?: boolean
  onChange: (h: 'claude-code' | 'codex') => void
}

export function HarnessSwitcher({ harness, disabled, onChange }: Props) {
  return (
    <div className="harness-switcher" data-testid="harness-switcher">
      <button
        type="button"
        className={`harness-chip ${harness === 'claude-code' ? 'selected' : ''}`}
        disabled={disabled}
        title={disabled ? 'Wait until this turn finishes.' : 'Claude Code'}
        aria-label="Claude Code"
        onClick={() => onChange('claude-code')}
        dangerouslySetInnerHTML={{ __html: claudeLogo }}
      />
      <button
        type="button"
        className={`harness-chip ${harness === 'codex' ? 'selected' : ''}`}
        disabled={disabled}
        title={disabled ? 'Wait until this turn finishes.' : 'Codex'}
        aria-label="Codex"
        onClick={() => onChange('codex')}
        dangerouslySetInnerHTML={{ __html: codexLogo }}
      />
    </div>
  )
}
