import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Shell } from './components/Shell';
import { SettingsView } from './components/SettingsView';
import { useApp } from './store/app';
import type { PipelineRunEvent } from './types';

export default function App() {
  const { booting, settings, init, setToast, loadPipelines } = useApp();

  useEffect(() => {
    void init();
  }, []);

  useEffect(() => {
    const un = listen<PipelineRunEvent>('pipeline-run-finished', (e) => {
      const { pipelineName, runId, status } = e.payload;
      setToast({ text: `${pipelineName} #${runId} → ${status}`, kind: status === 'SUCCESS' ? 'ok' : status === 'FAIL' ? 'fail' : 'info' });
      void loadPipelines();
    });
    return () => {
      void un.then((f) => f());
    };
  }, []);

  if (booting) {
    return (
      <>
        <div className="topbar"><span className="brand">nervd</span></div>
        <div className="empty">booting…</div>
      </>
    );
  }

  const needSetup = !settings?.hasPat || !settings?.organizationId || !settings?.defaultSpaceIdentifier;
  return needSetup ? <SettingsView /> : <Shell />;
}
