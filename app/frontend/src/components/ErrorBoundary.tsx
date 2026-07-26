import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { error: Error | null; }

// 想定外のレンダリング例外で白画面にならないための最小の防御。
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  componentDidCatch(error: Error, info: unknown) {
    console.error('UI error:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: 'sans-serif', color: '#1f2a44' }}>
          <h2 style={{ color: '#d64545' }}>画面の描画でエラーが発生しました</h2>
          <p style={{ color: '#66758f' }}>再読み込みで復帰する場合があります。続く場合は下記メッセージを開発者へ。</p>
          <pre style={{ background: '#fdecec', border: '1px solid #f7b7b7', borderRadius: 8, padding: 12, whiteSpace: 'pre-wrap' }}>
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <button onClick={() => location.reload()}
            style={{ background: '#16324f', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', cursor: 'pointer' }}>
            再読み込み
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
