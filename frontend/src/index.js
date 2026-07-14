import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import { getCurrentUser } from "./lib/api";
import Landing from "./pages/LandingPage";
import Login from "./pages/LoginPage";
import Register from "./pages/RegisterPage";
import HomePage from "./pages/HomePage";
import CreateTripPage from "./pages/CreateTripPage";
import ItineraryPage from "./pages/ItineraryPage";
import BudgetPage from "./pages/BudgetPage";
import ResetPassword from "./pages/ResetPassword";
import ProfilePage from "./pages/ProfilePage";
import AccountRecoveryPage from "./pages/AccountRecoveryPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import GroupPage from "./pages/GroupPage";
import AboutPage from "./pages/AboutPage";
import ContactPage from "./pages/ContactPage";
import SettingsPage from "./pages/SettingsPage";
import { Toaster } from "sonner";
import { applyPreferenceEffects } from "./lib/preferences";
import SessionTimeoutGuard from "./components/SessionTimeoutGuard";

// Apply saved preferences (e.g. reduced motion) before the app renders.
applyPreferenceEffects();

function ProtectedRoute({ children }) {
  const currentUser = getCurrentUser();

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <BrowserRouter>
    <SessionTimeoutGuard />
    <Toaster position="top-center" richColors closeButton />
    <Routes>
  <Route path="/" element={<Landing />} />
  <Route path="/login" element={<Login />} />
  <Route path="/register" element={<Register />} />
  <Route path="/reset-password" element={<ResetPassword />} />
  <Route path="/account-recovery" element={<AccountRecoveryPage />} />
  <Route path="/change-password" element={<ChangePasswordPage />} />
  <Route path="/homepage"element={<ProtectedRoute><HomePage /></ProtectedRoute>}/>
  <Route path="/trips/new"element={<ProtectedRoute><CreateTripPage /></ProtectedRoute>}/>
  <Route path="/trips/:tripId/edit"element={<ProtectedRoute><CreateTripPage /></ProtectedRoute>}/>
  <Route path="/trips/:id"element={<ProtectedRoute><ItineraryPage /></ProtectedRoute>}/>
  <Route path="/trips/:id/budget"element={<ProtectedRoute><BudgetPage /></ProtectedRoute>}/>
  <Route path="/profile"element={<ProtectedRoute><ProfilePage /></ProtectedRoute>}/>
  <Route path="/group"element={<ProtectedRoute><GroupPage /></ProtectedRoute>}/>
  <Route path="/trips/:tripId/group"element={<ProtectedRoute><GroupPage /></ProtectedRoute>}/>
  <Route path="/about" element={<AboutPage />} />
  <Route path="/contact" element={<ContactPage />} />
  <Route path="/settings"element={<ProtectedRoute><SettingsPage /></ProtectedRoute>}/>
</Routes>
  </BrowserRouter>
);
