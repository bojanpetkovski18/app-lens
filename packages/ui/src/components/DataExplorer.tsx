import { displayOf, getEntityFields, type Dataset, type Manifest } from '@app-lens/core';
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { humanize } from '../util';
import { FieldValue } from './FieldValue';

export interface DataFocus {
  entity: string;
  id?: string;
}

interface DataExplorerProps {
  manifest: Manifest;
  dataset: Dataset;
  focus: DataFocus | null;
  onFocus: (focus: DataFocus) => void;
  onNewData: () => void;
}

const MAX_COLUMNS = 6;
const PAGE_SIZE = 50;

export function DataExplorer({ manifest, dataset, focus, onFocus, onNewData }: DataExplorerProps) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const names = Object.keys(manifest.entities);
  const entityName = focus && manifest.entities[focus.entity] ? focus.entity : names[0];
  const entity = entityName ? manifest.entities[entityName] : undefined;

  // Reset during render so the search of the previous data type is never applied to the next one.
  const [shownEntity, setShownEntity] = useState(entityName);
  if (shownEntity !== entityName) {
    setShownEntity(entityName);
    setQuery('');
    setPage(0);
  }

  const records = useMemo(() => (entityName ? dataset[entityName] ?? [] : []), [dataset, entityName]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return records;
    return records.filter((record) => Object.values(record).some((value) => String(value ?? '').toLowerCase().includes(needle)));
  }, [records, query]);

  const focusedId = focus?.id;
  useEffect(() => {
    if (!focusedId) return;
    const index = filtered.findIndex((record) => record.id === focusedId);
    if (index >= 0) setPage(Math.floor(index / PAGE_SIZE));
  }, [focusedId, filtered]);

  if (!entityName || !entity) return <p className="al-muted">This app has no data types yet.</p>;

  const fields = getEntityFields(entity);
  const columns = fields.slice(0, MAX_COLUMNS);
  const selected = focusedId ? records.find((record) => record.id === focusedId) : undefined;
  const openRef = (target: string, id: string) => onFocus({ entity: target, id });
  const lastPage = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1);
  const start = Math.min(page, lastPage) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  const onRowKey = (event: KeyboardEvent<HTMLTableRowElement>, id: string) => {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    onFocus({ entity: entityName, id });
  };

  return (
    <div className="al-explorer">
      <nav className="al-entity-list" aria-label="Data types">
        <div className="al-eyebrow">Data types</div>
        {names.map((name) => (
          <button key={name} type="button" aria-current={name === entityName ? 'true' : undefined} onClick={() => onFocus({ entity: name })}>
            <span>{manifest.entities[name]?.label ?? name}</span>
            <span className="al-tab-count">{dataset[name]?.length ?? 0}</span>
          </button>
        ))}
      </nav>

      <div className="al-explorer-main">
        <div className="al-toolbar">
          <div>
            <h2>{entity.label ?? entityName}</h2>
            {entity.description ? <p className="al-muted">{entity.description}</p> : null}
          </div>
          <div className="al-row">
            <input
              className="al-input"
              type="search"
              placeholder="Search records"
              aria-label={`Search ${entity.label ?? entityName}`}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
            />
            <button type="button" className="al-btn" onClick={onNewData}>New sample data</button>
          </div>
        </div>

        <div className="al-table-wrap">
          <table className="al-table al-table-hover">
            <thead>
              <tr>{columns.map(([name]) => <th key={name} scope="col">{humanize(name)}</th>)}</tr>
            </thead>
            <tbody>
              {visible.map((record) => (
                <tr
                  key={record.id}
                  tabIndex={0}
                  className={record.id === selected?.id ? 'is-selected' : undefined}
                  onClick={() => onFocus({ entity: entityName, id: record.id })}
                  onKeyDown={(event) => onRowKey(event, record.id)}
                >
                  {columns.map(([name, spec]) => (
                    <td key={name}>
                      <FieldValue value={record[name]} spec={spec} manifest={manifest} dataset={dataset} onOpenRef={openRef} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 ? <p className="al-muted al-empty">No records match your search.</p> : null}
        </div>

        {filtered.length > PAGE_SIZE ? (
          <div className="al-pager">
            <button type="button" className="al-btn al-btn-ghost" aria-label="Previous page" disabled={start === 0} onClick={() => setPage(start / PAGE_SIZE - 1)}>
              Previous
            </button>
            <span className="al-muted al-num">{start + 1}–{start + visible.length} of {filtered.length}</span>
            <button type="button" className="al-btn al-btn-ghost" aria-label="Next page" disabled={start / PAGE_SIZE >= lastPage} onClick={() => setPage(start / PAGE_SIZE + 1)}>
              Next
            </button>
          </div>
        ) : null}
      </div>

      {selected ? (
        <aside className="al-card al-detail" aria-label="Record details">
          <div className="al-eyebrow">Record details</div>
          <h3>{displayOf(manifest, entityName, selected)}</h3>
          <dl className="al-fields">
            {fields.map(([name, spec]) => (
              <div key={name}>
                <dt>{humanize(name)}</dt>
                <dd><FieldValue value={selected[name]} spec={spec} manifest={manifest} dataset={dataset} onOpenRef={openRef} /></dd>
              </div>
            ))}
          </dl>
        </aside>
      ) : null}
    </div>
  );
}
