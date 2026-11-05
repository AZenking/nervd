import * as React from 'react';

/** sidebar 响应式断点检测（<768px 视为移动端；桌面 Tauri 下恒为 false，仅作防御） */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)');
    const onChange = () => {
      setIsMobile(window.innerWidth < 768);
    };
    mql.addEventListener('change', onChange);
    setIsMobile(window.innerWidth < 768);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return !!isMobile;
}
