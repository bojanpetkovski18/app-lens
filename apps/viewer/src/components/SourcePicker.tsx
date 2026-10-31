import type { ManifestSource } from '../sources';

interface SourcePickerProps {
  sources: ManifestSource[];
  value: string;
  onChange: (key: string) => void;
}

export function SourcePicker({ sources, value, onChange }: SourcePickerProps) {
  const groups = [...new Set(sources.map((source) => source.group))];
  return (
    <div className="al-picker">
      <label>
        <span className="al-sr-only">Manifest</span>
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          {groups.map((group) => (
            <optgroup key={group} label={group}>
              {sources.filter((source) => source.group === group).map((source) => (
                <option key={source.key} value={source.key}>{source.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
    </div>
  );
}
