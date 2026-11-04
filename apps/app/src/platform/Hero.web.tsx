import "./hero.css";

/** The pick screen's picture: one Story frame whose cells rearrange through a few layouts (still with reduced motion). */
export function Hero() {
  return (
    <div className="hero" aria-hidden="true">
      {[1, 2, 3, 4].map((n) => (
        <span key={n} className={`hero-cell hero-cell-${n}`} />
      ))}
    </div>
  );
}
