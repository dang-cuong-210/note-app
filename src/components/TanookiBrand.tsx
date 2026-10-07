/** Asset slots remain neutral until approved production artwork is supplied. */
export function TanookiBrand() {
  return <div className="tanooki-brand">
    <div className="tanooki-logo-slot" aria-label="Logo tạm thời: đang chờ tài nguyên Tanooki chính thức">Logo tạm thời</div>
    <span className="tanooki-wordmark">Tanooki</span>
  </div>;
}

export function TanookiLoading({ children }: { children: React.ReactNode }) {
  return <div className="tanooki-loading" role="status">
    <TanookiBrand /><p>{children}</p>
  </div>;
}
