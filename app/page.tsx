const highlights = [
  ["One clear view", "Keep the costs that matter in one quiet, focused place."],
  ["Local by default", "Your expense data starts in a SQLite file on your machine."],
  ["Built to grow", "A clean foundation for recording expenses when that workflow arrives."],
];

export default function Home() {
  return <main>
    <nav aria-label="Primary navigation"><a className="wordmark" href="#top">Ledger<span>.</span></a><span className="nav-label">Expense tracker</span></nav>
    <section className="hero" id="top">
      <p className="eyebrow">A simpler money habit</p><h1>See where your money goes.</h1>
      <p className="intro">Ledger is a private, expense-only tracker designed to make everyday spending easier to notice.</p>
      <div className="status" role="status"><span className="status-dot" aria-hidden="true" />Your local tracker is ready to set up</div>
    </section>
    <section className="highlights" aria-label="What Ledger offers">
      {highlights.map(([title, description], index) => <article className="highlight" key={title}><span className="number">0{index + 1}</span><h2>{title}</h2><p>{description}</p></article>)}
    </section>
  </main>;
}
