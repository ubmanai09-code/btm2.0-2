import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

type ErrorBoundaryState = {
  hasError: boolean;
  errorMessage: string;
  errorStack: string;
};

class AppErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
    errorStack: '',
  };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : String(error || 'Unknown runtime error'),
      errorStack: error instanceof Error ? String(error.stack || '') : '',
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('App runtime error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{padding: 24, fontFamily: 'system-ui, sans-serif'}}>
          <h1 style={{marginBottom: 8}}>App crashed while rendering</h1>
          <p style={{marginBottom: 12}}>Open browser console for full stack trace.</p>
          <pre style={{whiteSpace: 'pre-wrap', background: '#f5f5f5', padding: 12, borderRadius: 8}}>
            {this.state.errorMessage}
          </pre>
          {this.state.errorStack ? (
            <pre style={{whiteSpace: 'pre-wrap', background: '#f5f5f5', padding: 12, borderRadius: 8, marginTop: 12}}>
              {this.state.errorStack}
            </pre>
          ) : null}
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);
