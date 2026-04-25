interface Props {
  status: "idle" | "loading" | "error";
  message?: string;
}

export function StatusBanner({ status, message }: Props) {
  if (status === "idle") {
    return (
      <div className="status-banner status-idle">
        Enter a drug or compound above to generate mechanistic hypotheses.
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="status-banner status-loading" role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        Analyzing drug and generating hypotheses…
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="status-banner status-error" role="alert">
        <strong>Error:</strong> {message ?? "Something went wrong. Check the backend is running."}
      </div>
    );
  }

  return null;
}

export function StreamingBanner({ count }: { count: number }) {
  return (
    <div className="status-banner status-loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {count === 0
        ? "Fetching literature and scoring hypotheses…"
        : `Fetching literature… ${count} hypothesis${count === 1 ? "" : "es"} ready`}
    </div>
  );
}
