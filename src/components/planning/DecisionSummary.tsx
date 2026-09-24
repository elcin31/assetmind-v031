export function DecisionSummary({ lines }: { lines: string[] }) {
  return (
    <section className="decision-summary" aria-label="Decision Summary">
      <h3>Влияние решения</h3>
      <ul>
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
