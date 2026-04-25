import { useEffect, useRef, useState } from "react";
import { apiClient } from "../api/client";
import type { SavedHypothesis } from "../types";
import { HypothesisCard } from "./HypothesisCard";

export function SavedList() {
  const [items, setItems] = useState<SavedHypothesis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .getSaved()
      .then(setItems)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: number) {
    await apiClient.deleteSaved(id);
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  if (loading) return <div className="status-banner status-loading"><span className="spinner" />Loading saved hypotheses…</div>;
  if (error)   return <div className="status-banner status-error">Error: {error}</div>;

  return (
    <div className="saved-list">
      <h2 className="saved-list-title">Saved Hypotheses</h2>
      {items.length === 0 && (
        <div className="status-banner status-idle">
          No saved hypotheses yet. Generate some hypotheses and click "Save" on the ones you want to keep.
        </div>
      )}
      {items.map((item) => (
        <SavedItem key={item.id} item={item} onDelete={handleDelete} />
      ))}
    </div>
  );
}

function SavedItem({
  item,
  onDelete,
}: {
  item: SavedHypothesis;
  onDelete: (id: number) => void;
}) {
  const [notes, setNotes] = useState(item.notes);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleNotesChange(value: string) {
    setNotes(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      apiClient.updateNotes(item.id, { notes: value }).catch(() => {});
    }, 600);
  }

  return (
    <div className="saved-item">
      <div className="saved-item-meta">
        <div className="saved-item-info">
          <span className="saved-drug-name">{item.drug_name}</span>
          <span className="saved-date">
            {new Date(item.created_at).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
        <button
          className="delete-btn"
          onClick={() => onDelete(item.id)}
          type="button"
        >
          Remove
        </button>
      </div>
      <HypothesisCard hypothesis={item.hypothesis} drugName={item.drug_name} />
      <div className="saved-notes">
        <label htmlFor={`notes-${item.id}`} className="saved-notes-label">
          Notes
        </label>
        <textarea
          id={`notes-${item.id}`}
          value={notes}
          onChange={(e) => handleNotesChange(e.target.value)}
          placeholder="Add a note about this hypothesis…"
          rows={3}
          className="saved-notes-input"
        />
      </div>
    </div>
  );
}
