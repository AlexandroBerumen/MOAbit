import { useHypotheses } from "./hooks/useHypotheses";
import { InputForm } from "./components/InputForm";
import { HypothesisList } from "./components/HypothesisList";
import { StatusBanner } from "./components/StatusBanner";
import "./App.css";

export default function App() {
  const { state, submit } = useHypotheses();

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>MOAbit</h1>
          <p className="tagline">Mechanism-of-action hypothesis generator</p>
        </div>
      </header>

      <main className="app-main">
        <InputForm
          onSubmit={submit}
          isLoading={state.status === "loading"}
        />

        {state.status !== "success" && (
          <StatusBanner
            status={state.status}
            message={state.status === "error" ? state.message : undefined}
          />
        )}

        {state.status === "success" && (
          <HypothesisList
            hypotheses={state.data.hypotheses}
            drugName={state.data.drug_name}
            drugOverview={state.data.drug_overview}
            llmProvider={state.data.llm_provider}
            disclaimer={state.data.disclaimer}
          />
        )}
      </main>
    </div>
  );
}
