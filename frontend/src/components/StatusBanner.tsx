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
        Fetching literature and generating hypotheses — this takes 20–40 seconds…
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
