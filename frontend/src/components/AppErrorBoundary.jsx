import React from "react";

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("[app] uncaught render error", {
      message: error?.message || String(error),
      stack: error?.stack || null,
      componentStack: info?.componentStack || null
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-error-fallback">
          <div className="app-error-fallback-card">
            <h1>Algo ha fallado</h1>
            <p>La app no pudo renderizar esta pantalla. Puedes recargar e intentarlo de nuevo.</p>
            <button type="button" className="kitchen-button" onClick={this.handleReload}>
              Recargar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
