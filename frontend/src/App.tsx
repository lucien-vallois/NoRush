import React, { lazy, Suspense, useEffect, useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
import { WebSocketProvider } from "./contexts/WebSocketContext";

// Layout Components
import Layout from "./components/layout/Layout";
import LoadingSpinner from "./components/common/LoadingSpinner";
import ErrorBoundary from "./components/common/ErrorBoundary";
import { subscribeUnitSystem } from "./i18n/units.ts";

// Pages
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Tanks = lazy(() => import("./pages/Tanks"));
const Sensors = lazy(() => import("./pages/Sensors"));
const Readings = lazy(() => import("./pages/Readings"));
const Alerts = lazy(() => import("./pages/Alerts"));
const GaugeReport = lazy(() => import("./pages/GaugeReport"));
import Login from "./pages/Login";
const Profile = lazy(() => import("./pages/Profile"));

// Protected Route Component
import ProtectedRoute from "./components/auth/ProtectedRoute";

function App() {
  // Troca de unidades (ft/bbl ⇄ m/L) → redesenha a árvore com os valores
  // convertidos; os formatadores leem o store de unidades no render.
  const [, setUnitsTick] = useState(0);
  useEffect(() => subscribeUnitSystem(() => setUnitsTick((t) => t + 1)), []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <WebSocketProvider>
          <Router>
            <ErrorBoundary>
            <div className="App min-h-screen bg-background text-foreground">
              <Suspense
                fallback={
                  <div className="flex min-h-[60vh] items-center justify-center">
                    <LoadingSpinner />
                  </div>
                }
              >
                <Routes>
                  {/* Public Routes */}
                  <Route path="/login" element={<Login />} />

                  {/* Protected Routes */}
                  <Route
                    path="/"
                    element={
                      <ProtectedRoute>
                        <Layout />
                      </ProtectedRoute>
                    }
                  >
                    <Route
                      index
                      element={<Navigate to="/dashboard" replace />}
                    />
                    <Route path="dashboard" element={<Dashboard />} />
                    <Route path="tanks" element={<Tanks />} />
                    <Route path="sensors" element={<Sensors />} />
                    <Route path="readings" element={<Readings />} />
                    <Route path="alerts" element={<Alerts />} />
                    <Route path="gauge-report" element={<GaugeReport />} />
                    <Route path="profile" element={<Profile />} />
                  </Route>

                  {/* Catch all route */}
                  <Route
                    path="*"
                    element={<Navigate to="/dashboard" replace />}
                  />
                </Routes>
              </Suspense>
            </div>
            </ErrorBoundary>
          </Router>
        </WebSocketProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
