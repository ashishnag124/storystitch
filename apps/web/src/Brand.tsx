/** The logo: a 9:16 Story frame split into cells, like a collage. */
export function Logo() {
  return (
    <svg className="logo" viewBox="0 0 16 28" aria-hidden="true">
      <rect x="1" y="1" width="14" height="26" rx="3" fill="var(--coral)" />
      <rect x="1" y="1" width="14" height="12" rx="3" fill="var(--accent)" />
      <rect x="8.5" y="14.5" width="6.5" height="12.5" rx="2" fill="var(--pink)" />
    </svg>
  );
}

/** The pick screen's picture: one Story frame whose cells rearrange through a few layouts (still with reduced motion). */
export function LayoutHero() {
  return (
    <div className="hero" aria-hidden="true">
      {[1, 2, 3, 4].map((n) => (
        <span key={n} className={`hero-cell hero-cell-${n}`} />
      ))}
    </div>
  );
}
