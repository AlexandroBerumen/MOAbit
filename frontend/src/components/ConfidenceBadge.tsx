interface Props {
  score: number;
}

export function ConfidenceBadge({ score }: Props) {
  const level = score <= 3 ? "low" : score <= 6 ? "medium" : "high";
  const label = score <= 3 ? "Low" : score <= 6 ? "Moderate" : "High";

  return (
    <span className={`confidence-badge confidence-${level}`} title={`Confidence: ${label}`}>
      {score}/10
    </span>
  );
}
