export function TanookiMark() {
  return <picture className="tanooki-mark">
    <source srcSet="/brand/tanooki-mark.svg" type="image/svg+xml" />
    <img src="/brand/tanooki-mark.png" width="1254" height="1254" alt="" />
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
