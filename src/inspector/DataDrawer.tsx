import { useState } from 'react';
import type { MockRow } from '../types/tree';
import { useProject } from '../store/useProject';
import { useUi } from '../store/useUi';

/** Screen-local content editor; values remain primitive and writes are undoable. */
export function DataDrawer({
  screenId,
  dataKey,
  onClose,
}: {
  screenId: string;
  dataKey: string;
  onClose: () => void;
}) {
  const rows = useProject(
    (s) => s.doc.screens.find((screen) => screen.id === screenId)?.mockData?.[dataKey],
  );
  const save = useProject((s) => s.setDataRows);
  const [fieldNames, setFieldNames] = useState<Record<number, string>>({});
  const write = (next: MockRow[]) => {
    if (!save(screenId, dataKey, next))
      useUi.getState().toast('Could not save those rows.', 'warn');
  };
  const data = rows || [];
  const change = (index: number, key: string, value: string | number | boolean) =>
    write(data.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  return (
    <section className="data-drawer" aria-label={`Data rows for ${dataKey}`}>
      <header className="data-drawer-head">
        <strong>
          {dataKey} · {data.length} rows
        </strong>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
          Close
        </button>
      </header>
      {!data.length && (
        <p className="field-hint">
          No rows yet — add one
          <br />
          Ask muse to fill it
        </p>
      )}
      {data.map((row, index) => (
        <div className="data-row" key={index}>
          <div className="data-row-head">
            <strong>Row {index + 1}</strong>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() =>
                write([...data.slice(0, index + 1), { ...row }, ...data.slice(index + 1)])
              }
            >
              Duplicate
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => write(data.filter((_, i) => i !== index))}
            >
              Delete
            </button>
          </div>
          {Object.entries(row).map(([key, value]) => (
            <label className="data-row-field" key={key}>
              <span>{key}</span>
              {typeof value === 'boolean' ? (
                <select
                  className="select"
                  aria-label={`Row ${index + 1} ${key}`}
                  value={String(value)}
                  onChange={(event) => change(index, key, event.target.value === 'true')}
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input
                  className="input"
                  aria-label={`Row ${index + 1} ${key}`}
                  type={typeof value === 'number' ? 'number' : 'text'}
                  value={String(value)}
                  onChange={(event) =>
                    change(
                      index,
                      key,
                      typeof value === 'number' && event.target.value !== ''
                        ? Number(event.target.value)
                        : event.target.value,
                    )
                  }
                />
              )}
            </label>
          ))}
          <div className="data-add-field">
            <input
              className="input"
              aria-label={`New field name for row ${index + 1}`}
              placeholder="New field"
              value={fieldNames[index] || ''}
              onChange={(event) =>
                setFieldNames({ ...fieldNames, [index]: event.target.value })
              }
            />
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => {
                const name = (fieldNames[index] || '').trim();
                if (
                  name &&
                  !Object.hasOwn(row, name) &&
                  !['__proto__', 'constructor', 'prototype'].includes(name)
                ) {
                  change(index, name, '');
                  setFieldNames({ ...fieldNames, [index]: '' });
                }
              }}
            >
              Add field
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-sm btn-secondary"
        onClick={() => {
          const template = data[0];
          const empty: MockRow = {};
          for (const [key, value] of Object.entries(template || { label: '' }))
            empty[key] =
              typeof value === 'number' ? 0 : typeof value === 'boolean' ? false : '';
          write([...data, empty]);
        }}
      >
        Add row
      </button>
    </section>
  );
}
