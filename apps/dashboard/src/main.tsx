import React from "react";
import ReactDOM from "react-dom/client";
import RestoredDashboardApp from "./RestoredDashboardApp";
import "./styles.css";
import "./guide.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RestoredDashboardApp />
  </React.StrictMode>
);
