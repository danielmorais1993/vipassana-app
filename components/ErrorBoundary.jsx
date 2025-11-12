import React from "react";

/**
 * Simple ErrorBoundary that prevents the whole app from crashing.
 * Use it to wrap risky components while debugging.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // log to console (you can send to a logging service)
    console.error("ErrorBoundary caught:", error, info);
    this.setState({ info });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-red-50 rounded">
          <h3 className="text-lg font-semibold text-red-700">Algo deu errado ao abrir a meditação</h3>
          <p className="text-sm mt-2 text-red-600">Verifique o console para detalhes técnicos.</p>
          <details className="mt-2 text-xs">
            <summary>Mostrar erro</summary>
            <pre className="whitespace-pre-wrap text-left">{String(this.state.error?.stack || this.state.error)}</pre>
            <pre className="whitespace-pre-wrap text-left">{JSON.stringify(this.state.info, null, 2)}</pre>
          </details>
          <div className="mt-3">
            <button onClick={() => this.setState({ hasError: false, error: null, info: null })} className="px-3 py-2 rounded bg-emerald-600 text-white">Tentar novamente</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
