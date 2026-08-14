import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import AuthPage from "./pages/AuthPage";
import GamePage from "./pages/GamePage";

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
        path="/landscape-3d"
        element={
          <Suspense fallback={<div className="boot-screen">Building terrain…</div>}>
            <LandscapePage />
          </Suspense>
        }
      />
      <Route
        path="/"
        element={
          <Protected>
            <GamePage />
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
