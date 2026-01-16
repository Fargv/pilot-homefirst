import React, { useState } from "react";

const API = import.meta.env.VITE_API_URL;

export default function App() {
  const [msg, setMsg] = useState("—");

  async function ping() {
    setMsg("Llamando al backend...");
    const r = await fetch(`${API}/health`);
    const data = await r.json();
    setMsg(JSON.stringify(data, null, 2));
  }

  return (
    <div style={{ fontFamily: "system-ui", padding: 24, maxWidth: 900 }}>
      <h1>Piloto HomeFirst 🧪</h1>
      <p>Backend: <code>{API}</code></p>

      <button onClick={ping} style={{ padding: "10px 14px", cursor: "pointer" }}>
        Probar /health
      </button>

      <pre style={{ marginTop: 16, background: "#111", color: "#0f0", padding: 12, borderRadius: 8 }}>
        {msg}
      </pre>
    </div>
  );
}
