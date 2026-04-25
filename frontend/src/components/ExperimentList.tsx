import { Fragment, useMemo, useState } from "react";
import type { Hypothesis, SuggestedExperiment, Protocol, PubMedAbstract, ProtocolSourcePublication } from "../types";
import { apiClient } from "../api/client";
import { useAuthContext } from "../context/AuthContext";

interface Props {
  hypothesis: Hypothesis;
  experiments: SuggestedExperiment[];
  drugName: string;
  mechanism: string;
  allowSave?: boolean;
}

const TIER_LABEL: Record<SuggestedExperiment["tier"], string> = {
  functional_rescue: "Functional Rescue",
  reproducibility: "Reproducibility",
  mechanistic: "Mechanistic",
};

function getExperimentPublicationsMap(
  experiments: SuggestedExperiment[],
  abstracts: PubMedAbstract[],
): Map<number, PubMedAbstract[]> {
  const byPmid = new Map(abstracts.map((abstract) => [abstract.pmid, abstract] as const));
  const assignments = new Map<number, PubMedAbstract[]>();

  experiments.forEach((experiment, index) => {
    const directMatches = (experiment.supporting_pmids ?? [])
      .map((pmid) => byPmid.get(pmid))
      .filter((abstract): abstract is PubMedAbstract => Boolean(abstract));

    if (directMatches.length > 0) {
      assignments.set(index, directMatches);
    }
  });

  return assignments;
}

type CardState =
  | { status: "idle" }
  | { status: "loading"; observations: string; prior_literature: string }
  | { status: "done"; protocol: Protocol; observations: string; prior_literature: string }
  | { status: "error"; message: string; observations: string; prior_literature: string };

function ProtocolPanel({ protocol }: { protocol: Protocol }) {
  const publicationUrlByPmid = useMemo(
    () => new Map(protocol.source_publications.map((publication) => [publication.pmid, publication.url] as const)),
    [protocol.source_publications],
  );

  function renderTextWithPmidLinks(text: string) {
    const parts = text.split(/(PMID\s+\d+)/g);

    return parts.map((part, index) => {
      const match = part.match(/^PMID\s+(\d+)$/);
      if (!match) {
        return <Fragment key={`${part}-${index}`}>{part}</Fragment>;
      }

      const pmid = match[1];
      const url = publicationUrlByPmid.get(pmid) ?? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;

      return (
        <a key={`${pmid}-${index}`} href={url} target="_blank" rel="noopener noreferrer">
          {part}
        </a>
      );
    });
  }

  return (
    <div className="protocol-panel">
      <div className="protocol-header">
        <h4 className="protocol-title">{protocol.title}</h4>
        <span className="protocol-duration">{protocol.duration}</span>
      </div>
      <p className="protocol-overview">{renderTextWithPmidLinks(protocol.overview)}</p>

      {protocol.source_publications.length > 0 && (
        <section className="protocol-section">
          <h5>Source Publications</h5>
          <ul className="protocol-materials">
            {protocol.source_publications.map((publication) => (
              <li key={publication.pmid}>
                <a href={publication.url} target="_blank" rel="noopener noreferrer">
                  {publication.title}
                </a>{" "}
                <span className="pmid-tag">PMID {publication.pmid}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="protocol-section">
        <h5>Materials</h5>
        <ul className="protocol-materials">
          {protocol.materials.map((m, i) => <li key={i}>{m}</li>)}
        </ul>
      </section>

      <section className="protocol-section">
        <h5>Steps</h5>
        <ol className="protocol-steps">
          {protocol.steps.map((s) => (
            <li key={s.step_number} className="protocol-step">
              <strong>{s.title}</strong>
              <p>{renderTextWithPmidLinks(s.description)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="protocol-section">
        <h5>Expected Results</h5>
        <p>{renderTextWithPmidLinks(protocol.expected_results)}</p>
      </section>

      <section className="protocol-section">
        <h5>Troubleshooting</h5>
        <ul className="protocol-troubleshooting">
          {protocol.troubleshooting.map((t, i) => <li key={i}>{renderTextWithPmidLinks(t)}</li>)}
        </ul>
      </section>

      {protocol.safety_notes && (
        <section className="protocol-section protocol-safety">
          <h5>Safety</h5>
          <p>{renderTextWithPmidLinks(protocol.safety_notes)}</p>
        </section>
      )}
    </div>
  );
}

function ExperimentCard({
  hypothesis,
  exp,
  index,
  drugName,
  mechanism,
  allowSave,
}: {
  hypothesis: Hypothesis;
  exp: SuggestedExperiment;
  index: number;
  drugName: string;
  mechanism: string;
  allowSave: boolean;
}) {
  const { state: authState } = useAuthContext();
  const isAuthed = authState.status === "authed";
  const [state, setState] = useState<CardState>({ status: "idle" });
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedForSave, setSelectedForSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const experimentPublications = getExperimentPublicationsMap(
    hypothesis.suggested_experiments,
    hypothesis.pubmed_abstracts,
  ).get(index) ?? [];
  const protocolSourcePublications: ProtocolSourcePublication[] = experimentPublications.map((abstract) => ({
    pmid: abstract.pmid,
    title: abstract.title,
    url: abstract.url,
  }));

  async function generateProtocol(observations = "", prior_literature = "") {
    setPanelOpen(true);
    setState({ status: "loading", observations, prior_literature });
    try {
      const res = await apiClient.generateProtocol({
        drug_name: drugName,
        mechanism,
        experiment: exp,
        observations,
        prior_literature,
        source_publications: protocolSourcePublications,
      });
      setState({ status: "done", protocol: res.protocol, observations, prior_literature });
    } catch (err) {
      setState({ status: "error", message: (err as Error).message, observations, prior_literature });
    }
  }

  function handleProtocolBtn() {
    if (state.status === "idle") {
      void generateProtocol();
      return;
    }

    if (state.status === "error") {
      void generateProtocol(state.observations, state.prior_literature);
      return;
    }

    setPanelOpen((o) => !o);
  }

  function handleRegenerate() {
    const obs = state.status !== "idle" ? state.observations : "";
    const lit = state.status !== "idle" ? state.prior_literature : "";
    void generateProtocol(obs, lit);
  }

  const btnLabel = (() => {
    if (state.status === "loading") return "Generating…";
    if (panelOpen) return "Hide Protocol";
    return "Protocol";
  })();

  function toggleSelectedProtocol() {
    if (state.status !== "done") return;
    setSelectedForSave((current) => !current);
  }

  async function handleSaveExperiment() {
    if (!allowSave || !isAuthed || saving || saved) return;

    const hypothesisToSave: Hypothesis = {
      ...hypothesis,
      suggested_experiments: [exp],
    };

    const selectedProtocols =
      selectedForSave && state.status === "done"
        ? [{
            experiment_index: 0,
            experiment: exp,
            protocol: state.protocol,
            observations: state.observations,
            prior_literature: state.prior_literature,
          }]
        : [];

    setSaving(true);
    try {
      await apiClient.saveHypothesis({
        drug_name: drugName,
        hypothesis: hypothesisToSave,
        selected_protocols: selectedProtocols,
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`exp-card exp-card-${exp.tier}`}>
      <div className="exp-card-header">
        <div className="exp-card-header-left">
          <span className="exp-step">#{index + 1}</span>
          <span className={`tier-badge tier-badge-${exp.tier}`}>
            {TIER_LABEL[exp.tier]}
          </span>
          <span className={`measure-tag measure-${exp.measurement_type}`}>
            {exp.measurement_type}
          </span>
        </div>
        <div className="exp-card-header-actions">
          {allowSave && isAuthed ? (
            <button
              className={`save-btn exp-save-btn ${saved ? "save-btn-saved" : ""}`}
              onClick={handleSaveExperiment}
              disabled={saving || saved}
              title={saved ? "Saved to your library" : "Save this suggested experiment"}
              type="button"
            >
              {saving ? "Saving…" : saved ? "✓ Saved" : "Save Experiment"}
            </button>
          ) : allowSave ? (
            <span className="save-hint" title="Log in to save experiments">
              Login to save
            </span>
          ) : null}
          <button
            className={`protocol-btn ${panelOpen ? "protocol-btn-active" : ""}`}
            onClick={handleProtocolBtn}
            disabled={state.status === "loading"}
          >
            {btnLabel}
          </button>
        </div>
      </div>

      <div className="exp-card-body">
        <div className="exp-field exp-field-full">
          <span className="exp-label">Assay</span>
          <span className="exp-value exp-assay">{exp.assay_type}</span>
        </div>
        <div className="exp-field exp-field-full">
          <span className="exp-label">Endpoint</span>
          <span className="exp-value exp-endpoint">{exp.primary_endpoint}</span>
        </div>
        <div className="exp-field exp-field-full">
          <span className="exp-label">Rationale</span>
          <span className="exp-value exp-rationale">{exp.rationale}</span>
        </div>
        {experimentPublications.length > 0 && (
          <div className="exp-field exp-field-full">
            <span className="exp-label">Related Publications</span>
            <div className="exp-publications">
              {experimentPublications.map((abstract) => (
                <a
                  key={abstract.pmid}
                  className="exp-publication-link"
                  href={abstract.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={abstract.title}
                >
                  {abstract.title}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {panelOpen && (
        <div className="exp-protocol">
          {state.status === "loading" && (
            <div className="protocol-loading">Generating protocol…</div>
          )}
          {state.status === "error" && (
            <>
              <div className="protocol-error">{state.message}</div>
              <button className="protocol-cancel-btn" type="button" onClick={handleRegenerate}>Try again</button>
            </>
          )}
          {state.status === "done" && (
            <>
              <ProtocolPanel protocol={state.protocol} />
              <button
                className={`protocol-generate-btn ${selectedForSave ? "protocol-generate-btn-selected" : ""}`}
                type="button"
                onClick={toggleSelectedProtocol}
              >
                {selectedForSave ? "Included when saving hypothesis" : "Include when saving hypothesis"}
              </button>
              <button className="protocol-cancel-btn protocol-regenerate-btn" type="button" onClick={handleRegenerate}>
                Regenerate with different context
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function ExperimentList({ hypothesis, experiments, drugName, mechanism, allowSave = true }: Props) {
  if (experiments.length === 0) {
    return <p className="empty-note">No experiments suggested.</p>;
  }

  return (
    <div className="experiment-list">
      {experiments.map((exp, i) => (
        <ExperimentCard
          key={i}
          hypothesis={hypothesis}
          exp={exp}
          index={i}
          drugName={drugName}
          mechanism={mechanism}
          allowSave={allowSave}
        />
      ))}
    </div>
  );
}
