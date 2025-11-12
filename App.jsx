// src/VipassanaApp.jsx
import React, { useState, useEffect, useRef } from "react";
import GuidedAudioPlayer from './components/GuidedAudioPlayer';
import { useTimerStore } from "./stores/timerStore"; // zustand store
// Note: ensure `src/stores/timerStore.js` exists and `npm install zustand` was run.

/* ---------- Helpers: unique id + dedupe ---------- */


function genId(prefix = "") {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return prefix + crypto.randomUUID();
    }
  } catch (e) {}
  return prefix + `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function dedupeById(arr = []) {
  const map = new Map();
  for (const item of (arr || [])) {
    if (!item) continue;
    if (!item.id) item.id = genId("m-");
    if (!map.has(item.id)) map.set(item.id, item);
  }
  return Array.from(map.values());
}
/* ------------------------------------------------- */

export default function VipassanaApp() {
  // mounted guard to avoid setState after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // --- Persistent simple state (localStorage-backed) with dedupe
  const [userName, setUserName] = useState(() => {
    try {
      return localStorage.getItem("vip_userName") || "Praticante";
    } catch {
      return "Praticante";
    }
  });


  const [onboardingDone, setOnboardingDone] = useState(() => {
    try {
      return localStorage.getItem("vip_onboard") === "1";
    } catch {
      return false;
    }
  });

  const [view, setView] = useState("dashboard");

  const [sessions, setSessions] = useState(() => {
    try {
      const raw = localStorage.getItem("vip_sessions");
      const parsed = raw ? JSON.parse(raw) : [];
      return dedupeById(parsed);
    } catch {
      return [];
    }
  });

  const [diary, setDiary] = useState(() => {
    try {
      const raw = localStorage.getItem("vip_diary");
      const parsed = raw ? JSON.parse(raw) : [];
      return dedupeById(parsed);
    } catch {
      return [];
    }
  });

  // aiNotes persisted optionally (if you used storage previously)
  const [aiNotes, setAiNotes] = useState(() => {
    try {
      const raw = localStorage.getItem("vip_aiNotes");
      const parsed = raw ? JSON.parse(raw) : [];
      return dedupeById(parsed);
    } catch {
      return [];
    }
  });

  // persist basic app data to localStorage
  useEffect(() => { try { localStorage.setItem("vip_sessions", JSON.stringify(sessions)); } catch {} }, [sessions]);
  useEffect(() => { try { localStorage.setItem("vip_diary", JSON.stringify(diary)); } catch {} }, [diary]);
  useEffect(() => { try { localStorage.setItem("vip_aiNotes", JSON.stringify(aiNotes)); } catch {} }, [aiNotes]);
  useEffect(() => { try { localStorage.setItem("vip_onboard", onboardingDone ? "1" : "0"); } catch {} }, [onboardingDone]);
  useEffect(() => { try { localStorage.setItem("vip_userName", userName); } catch {} }, [userName]);
  const finalizingRef = useRef(false);

  const initialSessionSecRef = useRef(20 * 60); // store initial seconds for session finalization
  const [retreatMode, setRetreatMode] = useState(false);
  const [selectedMeditation, setSelectedMeditation] = useState("Anapana - Respiração");

  // audio sources: stable reference
  const guidedAudios = React.useMemo(() => [
    { id: "anapana-1", title: "Anapana - Foco na Respiração (10m)", src: '/audios/anapana.mp3' },
    { id: "scan-1", title: "Scan Corporal - Vipassana (20m)", src: "/audios/vipassana.mp3" },
    { id: "metta-1", title: "Metta Bhavana - Amor e Bondade (15m)", src: "/audios/metabavana.mp3" },
  ], []);

  // object URL cache (kept if you later use remote fetching)
  const objectUrlCacheRef = useRef({});
  const lastObjectUrlRef = useRef(null);

  const [useApi, setUseApi] = useState(() => {
    try {
      return localStorage.getItem("vip_useApi") === "1";
    } catch {
      return false;
    }
  });
  const [apiUrl, setApiUrl] = useState(() => {
    try {
      return localStorage.getItem("vip_apiUrl") || "";
    } catch {
      return "";
    }
  });
  const [apiKey, setApiKey] = useState(() => {
    try {
      return localStorage.getItem("vip_apiKey") || "";
    } catch {
      return "";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("vip_useApi", useApi ? "1" : "0");
      localStorage.setItem("vip_apiUrl", apiUrl);
      localStorage.setItem("vip_apiKey", apiKey);
    } catch {}
  }, [useApi, apiUrl, apiKey]);

  // ---------------------------
  // Robust API helper and finalize logic
  // ---------------------------
  async function sendReflectionToApi(payload) {
    if (!useApi || !apiUrl) return null;
    try {
      const headers = { "Content-Type": "application/json" };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

      const res = await fetch(apiUrl, { method: "POST", headers, body: JSON.stringify(payload) });
      const contentType = res.headers.get("content-type") || "";

      if (!res.ok) {
        const txt = await res.text().catch(() => "<failed to read body>");
        console.error("sendReflectionToApi: upstream returned non-OK:", res.status, txt);
        return null;
      }

      if (contentType.includes("application/json")) {
        try {
          return await res.json();
        } catch (jsonErr) {
          console.warn("sendReflectionToApi: parse json failed, returning raw text", jsonErr);
          const txt = await res.text().catch(() => null);
          return txt ? { text: String(txt) } : null;
        }
      } else {
        const txt = await res.text().catch(() => null);
        return txt ? { text: String(txt) } : null;
      }
    } catch (err) {
      console.error("sendReflectionToApi: network/error:", err && (err.message || err));
      return null;
    }
  }

  // ---------------------------
  // Timer API wrappers (use Zustand store)
  // ---------------------------
  function startTimer(minutes = 20) {
    const secs = Math.max(1, Math.round(minutes * 60));
    initialSessionSecRef.current = secs;
    if (useTimerStore && useTimerStore.getState) {
      useTimerStore.getState().start(secs);
    } else {
      console.warn("startTimer: timer store not found");
    }
  }

  async function stopTimerLocal(endSession = false) {
  // avoid re-entrancy
  if (finalizingRef.current) {
    console.warn("stopTimerLocal: already finalizing, ignoring duplicate call");
    return;
  }
  finalizingRef.current = true;

  try {
    // take snapshot from store
    const store = useTimerStore && useTimerStore.getState ? useTimerStore.getState() : { secondsLeft: 0, running: false, snapshot: () => ({ secondsLeft: 0, running: false }) };
    const snap = store.snapshot ? store.snapshot() : { secondsLeft: store.secondsLeft ?? 0, running: store.running ?? false };
    const secsNow = snap.secondsLeft ?? 0;
    const initial = initialSessionSecRef.current || 20 * 60;
    const elapsed = Math.max(0, initial - secsNow);

    // stop the timer in store only if it's running (avoid triggering redundant store updates)
    try {
      if (useTimerStore && useTimerStore.getState) {
        const st = useTimerStore.getState();
        if (st.running) st.stop(endSession);
      }
    } catch (err) {
      console.error("stopTimerLocal: failed to stop store", err);
    }

    // finalize session if asked and there's elapsed time
    if (endSession && elapsed > 0) {
      const minutes = Math.max(1, Math.round(elapsed / 60));
      const newSession = {
        id: genId("sess-"),
        date: new Date().toISOString(),
        minutes,
        type: selectedMeditation,
      };

      // update local sessions (synchronous)
      setSessions((s) => [newSession, ...s].slice(0, 200));

      // perform API call and aiNotes update asynchronously
      (async () => {
        try {
          const payload = { meditationType: selectedMeditation, minutes };
          const apiResponse = await sendReflectionToApi(payload);

          if (!mountedRef.current) {
            console.warn("stopTimerLocal: component unmounted before API response, skipping state updates");
            return;
          }

          if (apiResponse && apiResponse.text) {
            const reflection = {
              title: apiResponse.title || `Reflexão pós-sessão — ${selectedMeditation}`,
              minutes,
              text: apiResponse.text,
              date: new Date().toISOString(),
            };
            setAiNotes((n) => [{ ...reflection, id: genId("ai-") }, ...n]);
          } else {
            const reflection = mockAiReflect(selectedMeditation, minutes);
            setAiNotes((n) => [{ ...reflection, id: genId("ai-") }, ...n]);
          }
        } catch (err) {
          console.error("finalize session error", {
            message: err?.message ?? String(err),
            stack: err?.stack ?? "<no stack>",
            selectedMeditation,
            apiUrl,
          });
          if (mountedRef.current) {
            const reflection = mockAiReflect(selectedMeditation, minutes);
            setAiNotes((n) => [{ ...reflection, id: genId("ai-") }, ...n]);
          }
        }
      })();
    }
  } finally {
    // small delay guard: keep finalizingRef true a short moment to avoid immediate re-entry from sync updates
    setTimeout(() => { finalizingRef.current = false; }, 50);
  }
}

  // ---------------------------
  // Simple helpers and mocks
  // ---------------------------
  function addDiaryEntry(text) {
    if (!text) return null;
    const entry = { id: genId("diary-"), date: new Date().toISOString(), text };
    setDiary((d) => [entry, ...d]);
    return entry;
  }

  function mockAiReflect(meditationType, minutes) {
    const patterns = [
      "Você percebeu alguma resistência hoje?",
      "Onde a atenção se dispersou?",
      "Qual sensação no corpo chamou mais atenção?",
      "Houve raiva, apego ou aversão — como respondeu?",
    ];
    const pick = patterns[Math.floor(Math.random() * patterns.length)];
    return {
      title: `Reflexão pós-sessão — ${meditationType}`,
      minutes,
      text: `${pick} (sessão de ${minutes} min). Tente observar com curiosidade e sem julgamento.`,
      date: new Date().toISOString(),
    };
  }

  function totalMeditationMinutes() {
    return sessions.reduce((acc, s) => acc + (s.minutes || 0), 0);
  }

  function daysLogged() {
    const days = new Set(sessions.map((s) => new Date(s.date).toDateString()));
    return days.size;
  }

  function toggleRetreat() {
    const next = !retreatMode;
    setRetreatMode(next);
    setView(next ? "retreat" : "dashboard");
  }

  // ---------------------------
  // UI components
  // ---------------------------
  function Header() {
    return (
      <header className="flex items-center justify-between p-4 rounded-b-2xl" style={{ background: 'linear-gradient(90deg, #2f855a 0%, #2b6cb0 100%)', color: 'white' }}>
        <div>
          <h1 className="text-xl font-semibold">Caminho Vipassana</h1>
          <p className="text-sm opacity-90">Olá, {userName} — progresso consciente.</p>
        </div>
        <nav className="flex gap-2">
          <button onClick={() => setView("dashboard") } className="px-3 py-2 rounded-lg bg-emerald-700 text-white text-sm shadow-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-emerald-300">Dashboard</button>
          <button onClick={() => setView("meditate") } className="px-3 py-2 rounded-lg bg-emerald-700 text-white text-sm shadow-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-emerald-300">Meditar</button>
          <button onClick={() => setView("diary") } className="px-3 py-2 rounded-lg bg-emerald-700 text-white text-sm shadow-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-emerald-300">Diário</button>
        </nav>
      </header>
    );
  }

  function StatCard({ label, value }) {
    return (
      <div className="bg-white p-4 rounded-lg shadow-sm">
        <div className="text-xs text-emerald-600">{label}</div>
        <div className="text-xl font-bold">{value}</div>
      </div>
    );
  }

  function Dashboard() {
    const total = totalMeditationMinutes();
    const days = daysLogged();
    const last = sessions[0];
    return (
      <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="col-span-2 bg-white p-6 rounded-2xl shadow">
          <h2 className="text-lg font-semibold text-emerald-700">Progresso</h2>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <StatCard label="Minutos totais" value={`${total} min`} />
            <StatCard label="Dias logados" value={`${days}`} />
            <StatCard label="Última sessão" value={last ? `${last.minutes} min` : "—"} />
          </div>

          <div className="mt-6">
            <h3 className="font-medium">Sessões recentes</h3>
            <ul className="mt-3 space-y-2 max-h-48 overflow-auto">
              {sessions.map((s) => (
                <li key={s.id} className="flex justify-between p-2 rounded-md hover:bg-gray-50">
                  <div>
                    <div className="text-sm">{s.type}</div>
                    <div className="text-xs opacity-80">{new Date(s.date).toLocaleString()}</div>
                  </div>
                  <div className="font-semibold">{s.minutes}m</div>
                </li>
              ))}
              {!sessions.length && <li className="text-sm opacity-70">Nenhuma sessão ainda — comece hoje.</li>}
            </ul>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow">
          <h3 className="font-medium text-emerald-700">Reflexões</h3>
          <div className="mt-3 space-y-3 max-h-72 overflow-auto">
            {aiNotes.map((n) => (
              <div key={n.id} className="p-3 border rounded bg-gray-50">
                <div className="text-xs opacity-80">{new Date(n.date).toLocaleString()}</div>
                <div className="font-semibold mt-1">{n.title}</div>
                <div className="text-sm mt-2">{n.text}</div>
              </div>
            ))}
            {!aiNotes.length && <div className="text-sm opacity-70">As reflexões aparecerão aqui após cada sessão.</div>}
          </div>

          <div className="mt-4">
            <button onClick={async () => {
              const payload = { meditationType: 'Prática de atenção', minutes: 10 };
              const apiResp = await sendReflectionToApi(payload);
              if (apiResp && apiResp.text) {
                const reflection = { title: apiResp.title || 'Reflexão exemplo', minutes: 10, text: apiResp.text, date: new Date().toISOString() };
                setAiNotes((n) => [{ ...reflection, id: genId("ai-") }, ...n]);
              } else {
                const r = mockAiReflect('Prática de atenção', 10);
                setAiNotes((n) => [{ ...r, id: genId("ai-") }, ...n]);
              }
            }} className="w-full px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm shadow-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-emerald-300">Gerar reflexão de exemplo</button>
          </div>
        </div>
      </div>
    );
  }

  // Meditate subscribes only to the timer slices it needs
  function Meditate() {
    let secondsLeft, running;
    try {
      secondsLeft = useTimerStore((s) => s.secondsLeft);
      running = useTimerStore((s) => s.running);
    } catch (hookErr) {
      console.error("Meditate hook error:", hookErr);
      return (
        <div className="p-6 bg-yellow-50 rounded">
          <h3 className="text-lg font-semibold text-yellow-700">Problema ao iniciar o temporizador</h3>
          <p className="text-sm mt-2">Verifique se o arquivo <code>src/stores/timerStore.js</code> existe e se o pacote <code>zustand</code> está instalado.</p>
          <p className="text-xs mt-2">Erro: {String(hookErr.message || hookErr)}</p>
        </div>
      );
    }

    const minutes = secondsLeft > 0 ? Math.ceil(secondsLeft / 60) : Math.ceil(initialSessionSecRef.current / 60);

   useEffect(() => {
  try {
    // only trigger finalization if store indicates timer finished and we are not already finalizing
    const st = useTimerStore && useTimerStore.getState ? useTimerStore.getState() : null;
    const snap = st && st.snapshot ? st.snapshot() : { secondsLeft, running };
    if (!finalizingRef.current && snap.secondsLeft === 0 && snap.running === false) {
      stopTimerLocal(true);
    }
  } catch (err) {
    console.error("Meditate effect error (finalize):", err);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [running, secondsLeft]);


    return (
      <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-white p-6 rounded-2xl shadow space-y-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h2 className="text-lg font-semibold text-emerald-700">Meditação — {selectedMeditation}</h2>
              <p className="text-sm opacity-80">Sessões guiadas curtas e temporizador.</p>
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              <label htmlFor="meditation-select" className="sr-only">Selecionar meditação</label>
              <select
                id="meditation-select"
                name="meditation-select"
                value={selectedMeditation}
                onChange={(e) => setSelectedMeditation(e.target.value)}
                className="w-full md:w-auto p-2 border rounded"
                aria-label="Selecionar meditação"
              >
                <option>Anapana - Respiração</option>
                <option>Scan corporal (Vipassana)</option>
                <option>Metta Bhavana (Amor)</option>
                <option>Silêncio guiado (Retiro)</option>
              </select>

              <button className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm shadow-sm hover:opacity-90 focus:outline-none" onClick={() => startTimer(20)}>Iniciar 20m</button>
            </div>
          </div>

          <div className="text-center">
            <div className="text-6xl font-mono">{String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:{String(secondsLeft % 60).padStart(2, "0")}</div>
            <div className="mt-3 flex flex-col sm:flex-row justify-center gap-2">
              {!running && <button onClick={() => startTimer(10)} className="px-3 py-2 rounded-lg bg-emerald-500 text-white text-sm shadow-sm hover:opacity-90">Iniciar 10m</button>}
              {running && <button onClick={() => stopTimerLocal(true)} className="px-3 py-2 rounded-lg bg-red-500 text-white text-sm shadow-sm hover:opacity-90">Parar</button>}
              <button onClick={() => { const txt = typeof prompt === 'function' ? prompt("Escreva uma pequena intenção para esta sessão:") : "Intenção simples"; addDiaryEntry(txt || "Intenção simples"); }} className="px-3 py-2 rounded-lg bg-amber-500 text-white text-sm shadow-sm hover:opacity-90">Definir Intenção</button>
            </div>
          </div>

          <div>
            <h4 className="font-medium">Guias rápidos</h4>
            <ol className="list-decimal pl-6 mt-2 text-sm opacity-90 space-y-1">
              <li>Posicione-se confortável, costas eretas, olhos suavemente fechados.</li>
              <li>Observe a respiração sem forçar (Anapana).</li>
              <li>Quando surgir distração, note e retorne à respiração.</li>
            </ol>
          </div>
        </div>

        <aside className="md:col-span-1">
          <GuidedAudioPlayer tracks={guidedAudios} />
        </aside>
      </div>
    );
  }

  function DiaryView() {
    const [text, setText] = useState("");
    return (
      <div className="p-6">
        <div className="bg-white p-6 rounded-2xl shadow">
          <h2 className="text-lg font-semibold text-emerald-700">Diário</h2>
          <p className="text-sm opacity-80">Escreva reflexões após práticas ou quando desejar.</p>
          <label htmlFor="diary-entry" className="sr-only">Diário</label>
          <textarea id="diary-entry" name="diary-entry" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} rows={6} className="w-full mt-3 p-2 border rounded" placeholder="Hoje eu observei..." />
          <div className="mt-3 flex gap-2">
            <button onClick={() => { if (text.trim()) { addDiaryEntry(text.trim()); setText(""); } }} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm shadow-sm">Salvar Entrada</button>
            <button onClick={async () => { const apiResp = await sendReflectionToApi({ meditationType: 'Diário', minutes: 0 }); if (apiResp && apiResp.text) { setText(apiResp.text); } else { setText(mockAiReflect('Diário', 0).text); } }} className="px-3 py-2 rounded-lg bg-emerald-500 text-white text-sm shadow-sm">Sugerir reflexão</button>
          </div>

          <div className="mt-6">
            <h4 className="font-medium">Entradas recentes</h4>
            <ul className="mt-3 space-y-2 max-h-72 overflow-auto">
              {diary.map((d) => (
                <li key={d.id} className="p-3 border rounded bg-gray-50">
                  <div className="text-xs opacity-80">{new Date(d.date).toLocaleString()}</div>
                  <div className="mt-1">{d.text}</div>
                </li>
              ))}
              {!diary.length && <li className="text-sm opacity-70">Nenhuma entrada — comece a registrar suas observações.</li>}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  function ProgressView() {
    const total = totalMeditationMinutes();
    const days = daysLogged();
    const levels = ["Disciplina", "Atenção", "Sabedoria", "Equanimidade", "Companhia", "Realização"];
    const currentLevel = Math.min(levels.length - 1, Math.floor(total / 300));
    return (
      <div className="p-6">
        <div className="bg-white p-6 rounded-2xl shadow">
          <h2 className="text-lg font-semibold text-emerald-700">Mapa da Jornada</h2>
          <p className="text-sm opacity-80">Níveis estimados com base no tempo de prática.</p>
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="text-3xl font-bold">{total}</div>
              <div className="text-sm opacity-80">minutos totais • {days} dias</div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              {levels.map((l, i) => (
                <div key={l} className={`p-4 rounded-lg ${i <= currentLevel ? "bg-gradient-to-r from-amber-100 to-amber-50" : "bg-gray-50"}`}>
                  <div className="text-sm opacity-80">Nível {i + 1}</div>
                  <div className="font-semibold">{l}</div>
                  <div className="text-xs opacity-70 mt-2">{i === currentLevel ? "Seu nível atual — continue cultivando" : ""}</div>
                </div>
              ))}
            </div>

            <div className="mt-4">
              <h4 className="font-medium">Meta recomendada</h4>
              <div className="text-sm mt-1">Pratique 20–40 minutos por dia por 30 dias para avançar um nível.</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function RetreatView() {
    return (
      <div className="p-6">
        <div className="bg-white p-6 rounded-2xl shadow">
          <h2 className="text-lg font-semibold text-emerald-700">Modo Retiro</h2>
          <p className="text-sm opacity-80">Silêncio simulado: foco em 3 sessões por dia.</p>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            {[30, 20, 40].map((m, idx) => (
              <div key={idx} className="p-4 border rounded">
                <div className="font-semibold">Sessão {idx + 1}</div>
                <div className="text-sm opacity-80">{m} minutos</div>
                <div className="mt-3 flex gap-2">
                  <button className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm shadow-sm" onClick={() => { setSelectedMeditation('Silêncio guiado (Retiro)'); startTimer(m); }}>Iniciar</button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <p className="text-sm">Dica: mantenha um diário breve após cada sessão para reforçar insights.</p>
            <div className="mt-3 flex gap-2">
              <button onClick={() => toggleRetreat()} className="px-3 py-2 rounded-lg bg-emerald-500 text-white text-sm shadow-sm">Sair do Retiro</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function SettingsView() {
    const [name, setName] = useState(userName);
    const [localApiUrl, setLocalApiUrl] = useState(apiUrl);
    const [localApiKey, setLocalApiKey] = useState(apiKey);
    const [localUseApi, setLocalUseApi] = useState(useApi);

    return (
      <div className="p-6">
        <div className="bg-white p-6 rounded-2xl shadow space-y-4">
          <h2 className="text-lg font-semibold text-emerald-700">Configurações</h2>
          <div>
            <label htmlFor="settings-username" className="text-sm">Seu nome</label>
            <input id="settings-username" name="settings-username" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-2 border rounded mt-1" />
            <div className="mt-2 flex gap-2">
              <button className="px-3 py-2 rounded bg-emerald-600 text-white text-sm" onClick={() => { setUserName(name); }}>Salvar</button>
            </div>
          </div>

          <div className="mt-4">
            <h4 className="font-medium">Integração de Reflexões (API)</h4>
            <label className="text-sm">Usar API externa</label>
            <div className="mt-2 flex items-center gap-2">
              <input type="checkbox" checked={localUseApi} onChange={(e) => setLocalUseApi(e.target.checked)} />
              <div className="text-sm opacity-80">Ativar envio das sessões para uma API que retorna reflexões.</div>
            </div>

            <label htmlFor="settings-apiurl" className="text-sm mt-3">API URL</label>
            <input id="settings-apiurl" name="settings-apiurl" autoComplete="off" value={localApiUrl} onChange={(e) => setLocalApiUrl(e.target.value)} className="w-full p-2 border rounded mt-1" placeholder="https://seu-backend.example.com/api/reflect" />

            <label htmlFor="settings-apikey" className="text-sm mt-3">Chave (opcional)</label>
            <input id="settings-apikey" name="settings-apikey" autoComplete="off" value={localApiKey} onChange={(e) => setLocalApiKey(e.target.value)} className="w-full p-2 border rounded mt-1" placeholder="Bearer key" />

            <div className="mt-3 flex gap-2">
              <button className="px-3 py-2 rounded bg-emerald-600 text-white text-sm" onClick={() => { setUseApi(localUseApi); setApiUrl(localApiUrl); setApiKey(localApiKey); }}>Salvar Integração</button>
              <button className="px-3 py-2 rounded bg-red-400 text-white text-sm" onClick={() => { setUseApi(false); setApiUrl(""); setApiKey(""); setLocalUseApi(false); setLocalApiUrl(""); setLocalApiKey(""); try { localStorage.removeItem('vip_apiKey'); localStorage.removeItem('vip_apiUrl'); localStorage.removeItem('vip_useApi'); } catch {} }}>Desativar</button>
            </div>

            <div className="mt-2 text-xs opacity-70">Observação: para privacidade, armazene apenas chaves sem expor tokens públicos. Em produção, prefira um backend que mantenha a chave segura.</div>
          </div>

          <div className="mt-4">
            <button className="px-3 py-2 rounded bg-red-500 text-white text-sm" onClick={() => { try { localStorage.clear(); } catch {} window.location.reload(); }}>Resetar App (apagar dados)</button>
          </div>
        </div>
      </div>
    );
  }

  function Onboarding() {
    const [name, setName] = useState(userName);
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-6">
        <div className="bg-white p-6 rounded-2xl w-full max-w-2xl">
          <h2 className="text-xl font-semibold text-emerald-700">Bem-vindo ao Caminho Vipassana</h2>
          <p className="mt-2 text-sm opacity-80">Este protótipo guia sua prática diária com meditações, diário, reflexões automáticas e áudios guiados.</p>
          <div className="mt-4">
            <label htmlFor="onboard-username" className="text-sm">Como devo chamá-lo?</label>
            <input id="onboard-username" name="onboard-username" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-2 border rounded mt-1" />
          </div>
          <div className="mt-4 flex gap-2 justify-end">
            <button className="px-3 py-2 rounded bg-emerald-600 text-white text-sm" onClick={() => { setUserName(name); setOnboardingDone(true); }}>Começar Jornada</button>
          </div>
        </div>
      </div>
    );
  }

  if (!onboardingDone) {
    return <Onboarding />;
  }

  return (
    <div className="min-h-screen p-6" style={{ background: `linear-gradient(180deg,#f0fdf4 0%, #ffffff 80%), url("data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0%" stop-color="#2f855a" stop-opacity="0.04"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0.02"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><g fill="#2f855a" fill-opacity="0.06"><path d="M10 80 C 40 10, 65 10, 95 80 S 150 150, 180 80"/><path d="M300 150 C 330 80, 355 80, 385 150 S 440 230, 470 150"/></g></svg>')}")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'center top', backgroundSize: 'cover' }}>
      <div className="max-w-6xl mx-auto">
        <Header />

        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-6">
          <aside className="md:col-span-1 bg-white p-4 rounded-2xl shadow sticky top-6">
            <div className="flex flex-col gap-2">
              <div className="text-sm opacity-80">Menu</div>
              <button className="w-full text-left p-2 rounded hover:bg-gray-50 text-sm" onClick={() => setView('dashboard')}>Dashboard</button>
              <button className="w-full text-left p-2 rounded hover:bg-gray-50 text-sm" onClick={() => setView('meditate')}>Meditar</button>
              <button className="w-full text-left p-2 rounded hover:bg-gray-50 text-sm" onClick={() => setView('diary')}>Diário</button>
              <button className="w-full text-left p-2 rounded hover:bg-gray-50 text-sm" onClick={() => setView('progress')}>Mapa da Jornada</button>
              <button className="w-full text-left p-2 rounded hover:bg-gray-50 text-sm" onClick={() => { toggleRetreat(); }}>Modo Retiro</button>
              <button className="w-full text-left p-2 rounded hover:bg-gray-50 text-sm" onClick={() => setView('settings')}>Configurações</button>

              <div className="mt-4 border-t pt-4">
                <div className="text-xs opacity-70">Dica rápida</div>
                <div className="text-sm mt-2 opacity-90">Comece com 10–20 minutos por dia. Consistência &gt; duração.</div>
              </div>
            </div>
          </aside>

          <main className="md:col-span-3">
            {view === 'dashboard' && <Dashboard />}
            {view === 'meditate' && <Meditate />}
            {view === 'diary' && <DiaryView />}
            {view === 'progress' && <ProgressView />}
            {view === 'retreat' && retreatMode && <RetreatView />}
            {view === 'settings' && <SettingsView />}
          </main>
        </div>

        <footer className="mt-8 text-center text-xs opacity-70">Protótipo — recurso educativo. Em produção recomenda-se um backend para proteger chaves e hospedar áudios.</footer>
      </div>
    </div>
  );
}
