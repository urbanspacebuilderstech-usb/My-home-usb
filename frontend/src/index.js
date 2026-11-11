import React from "react";
import ReactDOM from "react-dom/client";
// DayPicker base styles, global because several date filters (Cashbook, PM,
// Sr SE, DLR…) render <DayPicker>. Nov 11 2026 — loaded BEFORE index.css:
// its .rdp-button_reset {background:none; color:inherit} has the same
// weight as a Tailwind class, so when it came last (from App.js) it wiped
// the filters' bg-amber-600 / text-white and picked days showed no colour.
import "react-day-picker/dist/style.css";
import "@/index.css";
import App from "@/App";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
