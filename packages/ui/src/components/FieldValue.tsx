import { displayOf, type Dataset, type FieldSpec, type Manifest, type Scalar } from '@app-lens/core';
import type { CSSProperties } from 'react';
import { formatDate, formatMoney, hue, recordIndex } from '../util';

export function Badge({ value }: { value: string }) {
  return <span className="al-badge" style={{ '--al-hue': hue(value) } as CSSProperties}>{value}</span>;
}

interface FieldValueProps {
  value: Scalar | undefined;
  spec: FieldSpec | undefined;
  manifest: Manifest;
  dataset: Dataset;
  onOpenRef?: (entity: string, id: string) => void;
}

export function FieldValue({ value, spec, manifest, dataset, onOpenRef }: FieldValueProps) {
  if (value === null || value === undefined || value === '') return <span className="al-muted">—</span>;

  switch (spec?.kind) {
    case 'ref': {
      const target = spec.target ?? '';
      const record = recordIndex(dataset[target] ?? []).get(String(value));
      const label = record ? displayOf(manifest, target, record) : String(value);
      return record && onOpenRef ? (
        <button
          type="button"
          className="al-link"
          onClick={(event) => {
            event.stopPropagation();
            onOpenRef(target, record.id);
          }}
        >
          {label}
        </button>
      ) : (
        <span>{label}</span>
      );
    }
    case 'enum':
      return <Badge value={String(value)} />;
    case 'money':
      return <span className="al-num">{formatMoney(Number(value), manifest.app.currency)}</span>;
    case 'percent': {
      const percent = Math.min(100, Math.max(0, Number(value)));
      return (
        <span className="al-percent">
          <span className="al-percent-bar"><span style={{ width: `${percent}%` }} /></span>
          <span className="al-num">{String(value)}%</span>
        </span>
      );
    }
    case 'date':
      return <span>{formatDate(String(value))}</span>;
    case 'datetime':
      return <span>{formatDate(String(value), true)}</span>;
    case 'bool':
      return <span>{value ? 'Yes' : 'No'}</span>;
    case 'int':
    case 'float':
      return <span className="al-num">{String(value)}</span>;
    case 'id':
    case 'seq':
      return <code className="al-code">{String(value)}</code>;
    default:
      return <span>{String(value)}</span>;
  }
}
