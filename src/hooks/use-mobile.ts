import * as React from 'react';

/** shadcn sidebar 依赖的移动端断点检测（桌面 Tauri 下恒为 false，仅作防御） */
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
