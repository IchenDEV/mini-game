import React from "react";
import ReactDOM from "react-dom/client";
import { ArcadeApp } from "./arcade/ArcadeApp";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ArcadeApp />
  </React.StrictMode>,
);
