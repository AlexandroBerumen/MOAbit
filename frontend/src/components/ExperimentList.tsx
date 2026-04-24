import type { SuggestedExperiment } from "../types";

interface Props {
  experiments: SuggestedExperiment[];
}

const TIER_LABEL: Record<SuggestedExperiment["tier"], string> = {
  functional_rescue: "Functional Rescue",
  reproducibility: "Reproducibility",
  mechanistic: "Mechanistic",
};

export function ExperimentList({ experiments }: Props) {
  if (experiments.length === 0) {
    return <p className="empty-note">No experiments suggested.</p>;
  }

  return (
    <div className="experiment-list">
      <table>
        <thead>
          <tr>
            <th>Priority</th>
            <th>Assay</th>
            <th>Endpoint</th>
            <th>Measure</th>
            <th>Cell Line</th>
            <th>Controls</th>
            <th>Replicates</th>
            <th>Rationale</th>
          </tr>
        </thead>
        <tbody>
          {experiments.map((exp, i) => (
            <tr key={i} className={`tier-${exp.tier}`}>
              <td>
                <span className={`tier-badge tier-badge-${exp.tier}`}>
                  {TIER_LABEL[exp.tier]}
                </span>
              </td>
              <td>{exp.assay_type}</td>
              <td className="endpoint">{exp.primary_endpoint}</td>
              <td>
                <span className={`measure-tag measure-${exp.measurement_type}`}>
                  {exp.measurement_type}
                </span>
              </td>
              <td>{exp.cell_line}</td>
              <td>
                <ul className="controls-list">
                  {exp.controls.map((c, j) => (
                    <li key={j}>{c}</li>
                  ))}
                </ul>
              </td>
              <td className="replicates">{exp.replicates}</td>
              <td className="rationale">{exp.rationale}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
