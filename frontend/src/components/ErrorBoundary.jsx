import React from 'react';
import { AlertOctagon, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('GEO-SHIELD Boundary caught error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-navy-950 text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-navy-900 border border-red-500/50 rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <AlertOctagon className="w-8 h-8" />
              <div>
                <h2 className="text-base font-bold text-white">Application Exception Caught</h2>
                <p className="text-xs text-slate-400">GEO-SHIELD Runtime Recovery Console</p>
              </div>
            </div>

            <div className="p-3 bg-navy-950 rounded border border-slate-800 text-xs font-mono text-red-300 overflow-x-auto">
              {this.state.error?.toString()}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <span className="text-[11px] text-slate-400">
                SRMIST Ideathon Fault Recovery
              </span>
              <button
                onClick={() => window.location.reload()}
                className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reload Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
