import { useEffect, useRef } from 'react';
import { useApp } from '../store/app';

export function LogViewer() {
  const { logView, closeLogs } = useApp();
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [logView?.text]);
  if (!logView) return null;
  return (
    <div className="logview-overlay" onClick={closeLogs}>
      <div className="logview" onClick={(e) => e.stopPropagation()}>
        <div className="logview-head">
          <span className="grow">{logView.title}</span>
          <button className="btn btn-sm" onClick={closeLogs}>关闭</button>
        </div>
        <div className="logview-body" ref={bodyRef}>{logView.text}</div>
      </div>
    </div>
  );
}
