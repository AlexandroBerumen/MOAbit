import { useState } from "react";
import type { SuggestedExperiment, Protocol } from "../types";
import { apiClient } from "../api/client";

interface Props {
  experiments: SuggestedExperiment[];
  drugName: string;
  mechanism: string;
}

const TIER_LABEL: Record<SuggestedExperiment["tier"], string> = {
  functional_rescue: "Functional Rescue",
  reproducibility: "Reproducibility",
  mechanistic: "Mechanistic",
};

type CardState =
  | { status: "idle" }
  | { status: "form"; observations: string; prior_literature: string }
  | { status: "loading"; observations: string; prior_literature: string }
  | { status: "done"; protocol: Protocol; observations: string; prior_literature: string }
  | { status: "error"; message: string; observations: string; prior_literature: string };

function ProtocolForm({
  initialObservations,
  initialLiterature,
  onGenerate,
  onCancel,
}: {
  initialObservations: string;
  initialLiterature: string;
  onGenerate: (observations: string, prior_literature: string) => void;
  onCancel: () => void;
}) {
  const [observations, setObservations] = useState(initialObservations);
  const [literature, setLiterature] = useState(initialLiterature);

  return (
    <div className="protocol-form">
      <div className="protocol-form-field">
        <label className="protocol-form-label">Observations <span className="protocol-form-optional">(optional)</span></label>
        <textarea
          className="protocol-form-textarea"
          rows={3}
          placeholder="e.g. 40% reduction in cell viability at 1 µM; resistance emerging after 6 months of treatment"
          value={observations}
          onChange={(e) => setObservations(e.target.value)}
        />
      </div>
      <div className="protocol-form-field">
        <label className="protocol-form-label">Background &amp; Prior Literature <span className="protocol-form-optional">(optional)</span></label>
        <textarea
          className="protocol-form-textarea"
          rows={4}
          placeholder="Paste abstracts, IC50 data, known biology — anything that should inform the protocol"
          value={literature}
          onChange={(e) => setLiterature(e.target.value)}
        />
      </div>
      <div className="protocol-form-actions">
        <button className="protocol-generate-btn" type="button" onClick={() => onGenerate(observations, literature)}>
          Generate Protocol
        </button>
        <button className="protocol-cancel-btn" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function ProtocolPanel({ protocol }: { protocol: Protocol }) {
  return (
    <div className="protocol-panel">
      <div className="protocol-header">
        <h4 className="protocol-title">{protocol.title}</h4>
        <span className="protocol-duration">{protocol.duration}</span>
      </div>
      <p className="protocol-overview">{protocol.overview}</p>

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
              <p>{s.description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="protocol-section">
        <h5>Expected Results</h5>
        <p>{protocol.expected_results}</p>
      </section>

      <section className="protocol-section">
        <h5>Troubleshooting</h5>
        <ul className="protocol-troubleshooting">
          {protocol.troubleshooting.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      </section>

      {protocol.safety_notes && (
        <section className="protocol-section protocol-safety">
          <h5>Safety</h5>
          <p>{protocol.safety_notes}</p>
        </section>
      )}
    </div>
  );
}

function ExperimentCard({
  exp,
  index,
  drugName,
  mechanism,
}: {
  exp: SuggestedExperiment;
  index: number;
  drugName: string;
  mechanism: string;
}) {
  const [state, setState] = useState<CardState>({ status: "idle" });
  const [panelOpen, setPanelOpen] = useState(false);

  function handleProtocolBtn() {
    if (state.status === "idle") {
      setState({ status: "form", observations: "", prior_literature: "" });
      setPanelOpen(true);
      return;
    }
    if (state.status === "form") {
      setState({ status: "idle" });
      setPanelOpen(false);
      return;
    }
    // done/error/loading — toggle panel visibility
    setPanelOpen((o) => !o);
  }

  async function handleGenerate(observations: string, prior_literature: string) {
    setState({ status: "loading", observations, prior_literature });
    try {
      const res = await apiClient.generateProtocol({
        drug_name: drugName,
        mechanism,
        experiment: exp,
        observations,
        prior_literature,
      });
      setState({ status: "done", protocol: res.protocol, observations, prior_literature });
    } catch (err) {
      setState({ status: "error", message: (err as Error).message, observations, prior_literature });
    }
  }

  function handleRegenerate() {
    const obs = state.status !== "idle" && state.status !== "form" ? state.observations : "";
    const lit = state.status !== "idle" && state.status !== "form" ? state.prior_literature : "";
    setState({ status: "form", observations: obs, prior_literature: lit });
    setPanelOpen(true);
  }

  const btnLabel = (() => {
    if (state.status === "loading") return "Generating…";
    if (state.status === "form") return "Cancel";
    if (panelOpen) return "Hide Protocol";
    return "Protocol";
  })();

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
        <button
          className={`protocol-btn ${panelOpen ? "protocol-btn-active" : ""}`}
          onClick={handleProtocolBtn}
          disabled={state.status === "loading"}
        >
          {btnLabel}
        </button>
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
        <div className="exp-field">
          <span className="exp-label">Cell Line</span>
          <span className="exp-value">{exp.cell_line}</span>
        </div>
        <div className="exp-field">
          <span className="exp-label">Replicates</span>
          <span className="exp-value">{exp.replicates}</span>
        </div>
        <div className="exp-field exp-field-full">
          <span className="exp-label">Controls</span>
          <span className="exp-value">
            {exp.controls.join(" · ")}
          </span>
        </div>
        <div className="exp-field exp-field-full">
          <span className="exp-label">Rationale</span>
          <span className="exp-value exp-rationale">{exp.rationale}</span>
        </div>
      </div>

      {panelOpen && (
        <div className="exp-protocol">
          {state.status === "form" && (
            <ProtocolForm
              initialObservations={state.observations}
              initialLiterature={state.prior_literature}
              onGenerate={handleGenerate}
              onCancel={() => { setState({ status: "idle" }); setPanelOpen(false); }}
            />
          )}
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

export function ExperimentList({ experiments, drugName, mechanism }: Props) {
  if (experiments.length === 0) {
    return <p className="empty-note">No experiments suggested.</p>;
  }

  return (
    <div className="experiment-list">
      {experiments.map((exp, i) => (
        <ExperimentCard
          key={i}
          exp={exp}
          index={i}
          drugName={drugName}
          mechanism={mechanism}
        />
      ))}
    </div>
  );
}
