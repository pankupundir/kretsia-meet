import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const ProtectedRoute = ({ children }) => {
  const { user, setRedirect } = useAuth();
  const location = useLocation();

  if (!user) {
    // Store the current URL before redirecting to login
    setRedirect(location.pathname + location.search);
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default ProtectedRoute;
