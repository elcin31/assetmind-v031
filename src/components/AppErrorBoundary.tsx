import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { failed: boolean; message: string | null }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, message: null };

  static getDerivedStateFromError(error: unknown): State {
    return {
      failed: true,
      message: error instanceof Error ? error.message : 'Unexpected application error',
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[AssetMind render error]', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="app">
        <section className="card" role="alert">
          <span className="eyebrow">RECOVERY MODE</span>
          <h1>Интерфейс не смог отрисоваться</h1>
          <p className="notice">Данные аккаунта не удалялись. Перезагрузите приложение. Если ошибка повторится, экспортируйте backup после восстановления доступа и проверьте console/runtime logs.</p>
          {this.state.message && <p className="caption">{this.state.message}</p>}
          <button className="btn btn-primary" type="button" onClick={() => window.location.reload()}>Перезагрузить</button>
        </section>
      </main>
    );
  }
}
