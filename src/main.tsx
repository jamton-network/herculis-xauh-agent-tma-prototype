import browserProcess from "process";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { SwapProvider } from "./live/SwapContext";
import "./styles.css";

if (!("process" in globalThis)) Object.assign(globalThis, { process: browserProcess });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SwapProvider>
      <App />
    </SwapProvider>
  </React.StrictMode>,
);
