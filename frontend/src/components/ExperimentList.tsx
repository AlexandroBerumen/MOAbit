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

type ProtocolState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; protocol: Protocol }
  | { status: "error"; message: string };

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
  const [state, setState] = useState<ProtocolState>({ status: "idle" });
  const [open, setOpen] = useState(false);

  async function handleProtocol() {
    if (state.status === "done") {
      setOpen((o) => !o);
      return;
    }
    setOpen(true);
    setState({ status: "loading" });
    try {
      const res = await apiClient.generateProtocol({ drug_name: drugName, mechanism, experiment: exp });
      setState({ status: "done", protocol: res.protocol });
    } catch (err) {
      setState({ status: "error", message: (err as Error).message });
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
        <button
          className={`protocol-btn ${open ? "protocol-btn-active" : ""}`}
          onClick={handleProtocol}
          disabled={state.status === "loading"}
        >
          {state.status === "loading" ? "Generating…" : open ? "Hide Protocol" : "Protocol"}
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

      {open && (
        <div className="exp-protocol">
          {state.status === "loading" && (
            <div className="protocol-loading">Generating protocol…</div>
          )}
          {state.status === "error" && (
            <div className="protocol-error">{state.message}</div>
          )}
          {state.status === "done" && <ProtocolPanel protocol={state.protocol} />}
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
