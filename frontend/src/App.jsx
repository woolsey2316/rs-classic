import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import AuthPage from "./pages/AuthPage";

const LandscapePage = lazy(() => import("./pages/LandscapePage"));

function Protected({ children }) {
  const { token, loading } = useAuth();
  if (loading) {
    return <div className="boot-screen">Loading adventure…</div>;
  }
  if (!token) {
    return <Navigate to="/auth" replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route
        path="/"
        element={
          <Protected>
            <Suspense fallback={<div className="boot-screen">Building terrain…</div>}>
              <LandscapePage />
            </Suspense>
          </Protected>
        }
      />
      <Route path="/landscape-3d" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
