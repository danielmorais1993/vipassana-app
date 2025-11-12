const [view, setView] = useState("dashboard");


export default function Header() {
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