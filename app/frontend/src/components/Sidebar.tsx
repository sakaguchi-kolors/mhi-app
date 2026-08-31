import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import type { Me } from '../api';
import { routes, screenFromPath } from '../routes';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { path: routes.parts, label: '部品一覧', icon: '☰' },
  { path: routes.heatmap, label: '工程ヒートマップ', icon: '▦' },
  { path: routes.watch, label: '要ウォッチ', icon: '👁' },
  { path: routes.troubles, label: '困りごと', icon: '⚠' },
  { path: routes.ingest, label: 'データ取込', icon: '↓', adminOnly: true },
  { path: routes.owners, label: '担当者', icon: '👤', adminOnly: true },
  { path: routes.masters, label: 'マスタ管理', icon: '⚙', adminOnly: true },
];

const LS_KEY = 'mhi_sidebar_collapsed';

export function Sidebar({
  admin,
  me,
  asof,
  troubleCount,
  watchCount,
  onLogout,
}: {
  admin: boolean;
  me: Me;
  asof: string;
  troubleCount: number;
  watchCount: number;
  onLogout: () => void;
}) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(LS_KEY) === '1');
  const location = useLocation();
  const screen = screenFromPath(location.pathname);

  useEffect(() => {
    localStorage.setItem(LS_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  const items = NAV.filter((n) => !n.adminOnly || admin);

  const isActive = (path: string) => {
    if (path === routes.parts) return screen === 'parts' || screen === 'detail';
    if (path === routes.watch) return screen === 'watch';
    if (path === routes.masters) return screen === 'masters';
    return location.pathname === path;
  };

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="sidebar-head">
        <div className="brand">
          <h1>{collapsed ? '部品' : <>部品進捗システム <span>（仮称）</span></>}</h1>
          {!collapsed && asof && <p>データ基準日 <b>{asof}</b></p>}
        </div>
        <button
          type="button"
          className="sidebar-toggle"
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? 'メニューを展開' : 'メニューを折りたたむ'}
          aria-label={collapsed ? 'メニューを展開' : 'メニューを折りたたむ'}
        >
          {collapsed ? '»' : '«'}
        </button>
      </div>

      <nav className="nav-group">
        {items.map((n) => (
          <NavLink
            key={n.path}
            to={n.path}
            className={() => `nav-btn${isActive(n.path) ? ' active' : ''}`}
            title={collapsed ? n.label : undefined}
          >
            <span className="nav-icon" aria-hidden>
              {n.icon}
              {collapsed && n.path === routes.troubles && troubleCount > 0 && (
                <span className="nav-badge nav-badge-icon">{troubleCount > 99 ? '99+' : troubleCount}</span>
              )}
              {collapsed && n.path === routes.watch && watchCount > 0 && (
                <span className="nav-badge nav-badge-icon">{watchCount > 99 ? '99+' : watchCount}</span>
              )}
            </span>
            <span className="nav-label">
              {n.label}
              {!collapsed && n.path === routes.troubles && troubleCount > 0 && (
                <span className="nav-badge">{troubleCount > 99 ? '99+' : troubleCount}</span>
              )}
              {!collapsed && n.path === routes.watch && watchCount > 0 && (
                <span className="nav-badge">{watchCount > 99 ? '99+' : watchCount}</span>
              )}
            </span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-foot">
        <div className="sidebar-user" title={me.email}>
          <span className="sidebar-user-icon" aria-hidden>●</span>
          {!collapsed && (
            <div className="sidebar-user-text">
              <strong>{me.displayName}</strong>
              <span>{me.role}</span>
            </div>
          )}
        </div>
        <button
          type="button"
          className="nav-btn logout-btn"
          onClick={onLogout}
          title={collapsed ? 'ログアウト' : undefined}
        >
          <span className="nav-icon" aria-hidden>⎋</span>
          <span className="nav-label">ログアウト</span>
        </button>
      </div>
    </aside>
  );
}
