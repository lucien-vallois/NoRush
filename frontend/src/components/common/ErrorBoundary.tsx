import React from "react";
import { withTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: React.ReactNode;
  t: (key: string) => string;
}

interface State {
  hasError: boolean;
}

/**
 * Evita a tela branca total: um erro de render ou de import dinâmico
 * (ex.: módulo de página que falhou ao carregar) fica contido nesta
 * fronteira, com ação de recarregar — o resto do console permanece vivo.
 */
class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    console.error("ErrorBoundary capturou:", error);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      const { t } = this.props;
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6">
          <div className="card w-full max-w-md">
            <div className="card-content flex flex-col items-center py-10 text-center">
              <AlertTriangle className="mb-3 h-10 w-10 text-red-500" />
              <p className="mb-1 font-semibold text-foreground">
                {t("common.pageErrorTitle")}
              </p>
              <p className="mb-4 max-w-sm text-sm text-muted-foreground">
                {t("common.pageErrorDesc")}
              </p>
              <button
                onClick={this.handleReload}
                className="btn btn-primary"
              >
                {t("common.pageErrorAction")}
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default withTranslation()(ErrorBoundary);
