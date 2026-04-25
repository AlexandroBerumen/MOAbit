import { type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuthContext } from "./context/AuthContext";
import { useHypotheses } from "./hooks/useHypotheses";
import { AuthPage } from "./components/AuthPage";
import { HypothesisList } from "./components/HypothesisList";
import { InputForm } from "./components/InputForm";
import { NavBar } from "./components/NavBar";
import { SavedList } from "./components/SavedList";
import { StatusBanner } from "./components/StatusBanner";
import "./App.css";

function HomePage() {
  const { state, submit } = useHypotheses();
  const busy = state.status === "loading" || (state.status === "results" && !state.complete);

  return (
    <main className="app-main">
      <InputForm onSubmit={submit} isLoading={busy} />

      {(state.status === "idle" || state.status === "loading" || state.status === "error") && (
        <StatusBanner
          status={state.status === "idle" ? "idle" : state.status === "loading" ? "loading" : "error"}
          message={state.status === "error" ? state.message : undefined}
        />
      )}

      {state.status === "results" && (
        <HypothesisList
          hypotheses={state.hypotheses}
          drugName={state.drug_name}
          drugOverview={state.drug_overview ?? undefined}
          llmProvider={state.llm_provider}
          disclaimer={state.disclaimer}
          streaming={!state.complete}
        />
      )}
    </main>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { state } = useAuthContext();
  if (state.status === "idle" || state.status === "loading") return null;
  if (state.status === "unauthed") return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { state } = useAuthContext();
  return (
    <>
      <NavBar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route
          path="/login"
          element={
            state.status === "authed" ? <Navigate to="/" replace /> : <AuthPage />
          }
        />
        <Route
          path="/saved"
          element={
            <ProtectedRoute>
              <main className="app-main">
                <SavedList />
              </main>
            </ProtectedRoute>
          }
        />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="app">
          <AppRoutes />
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}
