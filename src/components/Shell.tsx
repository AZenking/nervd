import { useState } from 'react';
import { useApp } from '../store/app';
import { LogViewer } from './LogViewer';
import { SettingsView } from './SettingsView';
import { Sidebar } from './Sidebar';
import { TracePane } from './TracePane';
import { WorkitemDetail } from './WorkitemDetail';

export function Shell() {
  const { settings, connection } = useApp();
  const [showSettings, setShowSettings] = useState(false);

  if (showSettings) {
    return (
      <>
        <div className="topbar">
          <span className="brand">nervd</span>
          <span className="meta">设置</span>
          <span className="spacer" />
          <button className="btn btn-sm" onClick={() => setShowSettings(false)}>返回工作台</button>
        </div>
        <div className="settings-wrap"><SettingsView embedded /></div>
      </>
    );
  }

  return (
    <>
      <div className="topbar">
        <span className="brand">nervd</span>
        <span className="meta">
          org:{settings?.organizationId ? settings.organizationId.slice(0, 10) + '…' : '—'}
        </span>
        <span className="meta" style={{ color: connection === 'ok' ? 'var(--sig-ok)' : connection === 'fail' ? 'var(--sig-fail)' : undefined }}>
          {connection === 'ok' ? '● LINK OK' : connection === 'fail' ? '● LINK FAIL' : '● …'}
        </span>
        <span className="meta">{settings?.allowWriteOps ? 'RW' : 'RO'}</span>
        <span className="spacer" />
        <button className="btn btn-sm" onClick={() => setShowSettings(true)}>设置</button>
      </div>
      <div className="workspace">
        <Sidebar />
        <WorkitemDetail />
        <TracePane />
      </div>
      <LogViewer />
      <ToastHost />
    </>
  );
}

function ToastHost() {
  const toast = useApp((s) => s.toast);
  if (!toast) return null;
  return <div className={`toast ${toast.kind}`}>{toast.text}</div>;
}
