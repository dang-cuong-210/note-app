import { useEffect, useState } from 'react';

export function TanookiMark() {
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );

  useEffect(() => {
    const root = document.documentElement;
    const updateTheme = () => setIsDark(root.classList.contains('dark'));
    const observer = new MutationObserver(updateTheme);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    updateTheme();
    return () => observer.disconnect();
  }, []);

  return <picture className="tanooki-mark">
    {isDark
      ? <img src="/brand/tanooki-mark-dark.png" width="1254" height="1254" alt="" />
      : <><source srcSet="/brand/tanooki-mark.svg" type="image/svg+xml" /><img src="/brand/tanooki-mark.png" width="1254" height="1254" alt="" /></>}
  </picture>;
}

export function TanookiBrand() {
  return <div className="tanooki-brand">
    <TanookiMark />
    <span className="tanooki-wordmark">Tanooki</span>
  </div>;
}

export function TanookiLoading({ children }: { children: React.ReactNode }) {
  return <div className="tanooki-loading" role="status">
    <TanookiBrand /><p>{children}</p>
  </div>;
}
