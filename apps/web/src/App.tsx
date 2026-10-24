import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import SignIn from "./pages/SignIn";
import Dashboard from "./pages/Dashboard";
import ProjectEditor from "./pages/ProjectEditor";

function Guarded({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <main style={{ margin: "3rem auto", color: "var(--text-muted)" }}>Loading…</main>;
  if (!session) return <Navigate to="/signin" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/signin" element={<SignIn />} />
          <Route
            path="/"
            element={
              <Guarded>
                <Dashboard />
              </Guarded>
            }
          />
          <Route
            path="/projects/:id"
            element={
              <Guarded>
                <ProjectEditor />
              </Guarded>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
