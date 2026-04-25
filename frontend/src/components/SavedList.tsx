import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiClient } from "../api/client";
import type { SavedHypothesis, SavedProtocol } from "../types";
import { HypothesisCard } from "./HypothesisCard";

const TIER_LABELS = {
  functional_rescue: "Functional Rescue",
  reproducibility: "Reproducibility",
  mechanistic: "Mechanistic",
} as const;

interface TherapeuticGroup {
  key: string;
  slug: string;
  items: SavedHypothesis[];
  protocolCount: number;
  previewProtocol: SavedProtocol | null;
}

function slugifyDrugName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getSavedItemPreview(item: SavedHypothesis) {
  const experiment = item.selected_protocols[0]?.experiment ?? item.hypothesis.suggested_experiments[0];

  return {
    assay: experiment?.assay_type || "Saved hypothesis",
    endpoint: experiment?.primary_endpoint || "No endpoint available",
  };
}

function buildTherapeuticGroups(items: SavedHypothesis[]): TherapeuticGroup[] {
  const groups = new Map<string, SavedHypothesis[]>();

  items.forEach((item) => {
    const key = item.drug_name.trim() || "Unlabeled therapeutic";
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  });

  return Array.from(groups.entries())
    .map(([key, groupItems]) => {
      const sortedItems = [...groupItems].sort((a, b) => (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));
      const previewProtocol = sortedItems
        .flatMap((item) => item.selected_protocols)
        .find((protocol) => Boolean(protocol.experiment.assay_type || protocol.experiment.primary_endpoint)) ?? null;

      return {
        key,
        slug: slugifyDrugName(key),
        items: sortedItems,
        protocolCount: sortedItems.reduce((sum, item) => sum + item.selected_protocols.length, 0),
        previewProtocol,
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function SavedList() {
  const [items, setItems] = useState<SavedHypothesis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { therapeuticSlug } = useParams();

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

  const groups = useMemo(() => buildTherapeuticGroups(items), [items]);
  const activeGroup = therapeuticSlug
    ? groups.find((group) => group.slug === therapeuticSlug) ?? null
    : null;

  if (loading) return <div className="status-banner status-loading"><span className="spinner" />Loading saved hypotheses…</div>;
  if (error) return <div className="status-banner status-error">Error: {error}</div>;

  if (items.length === 0) {
    return (
      <div className="saved-list">
        <div className="status-banner status-idle">
          No saved hypotheses yet. Generate some hypotheses and click "Save" on the ones you want to keep.
        </div>
      </div>
    );
  }

  if (therapeuticSlug) {
    if (!activeGroup) {
      return (
        <div className="saved-list">
          <div className="status-banner status-error">That therapeutic was not found in your saved library.</div>
          <Link to="/saved" className="saved-back-link">Back to saved therapeutics</Link>
        </div>
      );
    }

    return (
      <div className="saved-list">
        <div className="saved-detail-header">
          <Link to="/saved" className="saved-back-link">← Back to saved therapeutics</Link>
          <h2 className="saved-detail-title">{activeGroup.key}</h2>
          <p className="saved-detail-meta">
            {activeGroup.items.length} saved hypothesis{activeGroup.items.length === 1 ? "" : "es"}
            {activeGroup.protocolCount > 0 ? ` • ${activeGroup.protocolCount} protocol${activeGroup.protocolCount === 1 ? "" : "s"}` : ""}
          </p>
        </div>
        <div className="saved-group-list">
          {activeGroup.items.map((item) => (
            <SavedItem key={item.id} item={item} onDelete={handleDelete} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="saved-list">
      <div className="saved-therapeutic-grid">
        {groups.map((group) => (
          <Link key={group.slug} to={`/saved/${group.slug}`} className="saved-therapeutic-card">
            <div className="saved-therapeutic-card-top">
              <h3 className="saved-therapeutic-card-title">{group.key}</h3>
              <span className="saved-therapeutic-card-count">
                {group.items.length} saved hypothesis{group.items.length === 1 ? "" : "es"}
              </span>
            </div>
            {group.previewProtocol ? (
              <div className="saved-therapeutic-preview">
                <div className="saved-protocol-focus-block saved-protocol-focus-assay">
                  <span className="saved-protocol-focus-label">Assay</span>
                  <span className="saved-protocol-focus-value">{group.previewProtocol.experiment.assay_type}</span>
                </div>
                <div className="saved-protocol-focus-block saved-protocol-focus-endpoint">
                  <span className="saved-protocol-focus-label">Endpoint</span>
                  <span className="saved-protocol-focus-value">{group.previewProtocol.experiment.primary_endpoint}</span>
                </div>
              </div>
            ) : (
              <p className="saved-therapeutic-fallback">
                Open this therapeutic to view saved hypotheses and protocols.
              </p>
            )}
          </Link>
        ))}
      </div>
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
  const preview = getSavedItemPreview(item);

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
          <div className="saved-item-title-block">
            <span className="saved-drug-name">{preview.assay}</span>
            <span className="saved-item-endpoint">{preview.endpoint}</span>
            <span className="saved-date">
              Saved{" "}
              {new Date(item.created_at).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
        </div>
        <button
          className="delete-btn"
          onClick={() => onDelete(item.id)}
          type="button"
        >
          Remove
        </button>
      </div>
      {item.selected_protocols.length > 0 && (
        <SavedProtocols protocols={item.selected_protocols} />
      )}
      <details className="saved-hypothesis-toggle">
        <summary>View hypothesis context</summary>
        <HypothesisCard
          hypothesis={item.hypothesis}
          drugName={item.drug_name}
          allowSave={false}
          showNumber={false}
        />
      </details>
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

function SavedProtocols({ protocols }: { protocols: SavedProtocol[] }) {
  return (
    <section className="saved-protocols">
      <h4 className="saved-protocols-title">Saved Protocols ({protocols.length})</h4>
      <div className="saved-protocols-list">
        {protocols.map((item) => (
          <article key={item.experiment_index} className="saved-protocol-card">
            <div className="saved-protocol-card-header">
              <span className="saved-protocol-step">{TIER_LABELS[item.experiment.tier]}</span>
              <span className={`tier-badge tier-badge-${item.experiment.tier}`}>
                {item.protocol.duration}
              </span>
            </div>
            <div className="saved-protocol-focus">
              <div className="saved-protocol-focus-block saved-protocol-focus-assay">
                <span className="saved-protocol-focus-label">Assay</span>
                <span className="saved-protocol-focus-value">{item.experiment.assay_type}</span>
              </div>
              <div className="saved-protocol-focus-block saved-protocol-focus-endpoint">
                <span className="saved-protocol-focus-label">Endpoint</span>
                <span className="saved-protocol-focus-value">{item.experiment.primary_endpoint}</span>
              </div>
            </div>
            <div className="saved-protocol-meta">
              <span>{item.protocol.title}</span>
              <span>{item.experiment.cell_line}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
