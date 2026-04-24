import type { PubMedAbstract, ReactomePathway } from "../types";

interface Props {
  abstracts: PubMedAbstract[];
  pathways: ReactomePathway[];
}

export function EvidenceSection({ abstracts, pathways }: Props) {
  return (
    <div className="evidence-section">
      <div className="evidence-group">
        <h4>PubMed Literature</h4>
        {abstracts.length === 0 ? (
          <p className="empty-note">No supporting abstracts retrieved.</p>
        ) : (
          <ul className="pubmed-list">
            {abstracts.map((a) => (
              <li key={a.pmid}>
                <details>
                  <summary>
                    <a href={a.url} target="_blank" rel="noopener noreferrer">
                      {a.title}
                    </a>
                    <span className="pmid-tag">PMID {a.pmid}</span>
                  </summary>
                  <p className="abstract-text">{a.abstract}</p>
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="evidence-group">
        <h4>Reactome Pathways</h4>
        {pathways.length === 0 ? (
          <p className="empty-note">No pathway data retrieved.</p>
        ) : (
          <ul className="pathway-list">
            {pathways.map((p) => (
              <li key={p.pathway_id}>
                <a href={p.url} target="_blank" rel="noopener noreferrer">
                  {p.name}
                </a>
                <span className="pathway-id">{p.pathway_id}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
