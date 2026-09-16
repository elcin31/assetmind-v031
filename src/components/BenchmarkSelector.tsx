import { useId } from "react";
import type { BenchmarkSymbol } from "../types/analytics";
export function BenchmarkSelector({
  value,
  onChange,
}: {
  value: BenchmarkSymbol;
  onChange: (v: BenchmarkSymbol) => void;
}) {
  const id = useId();
  return (
    <label className="benchmark-selector" htmlFor={id}>
      Эталон сравнения
      <select
        id={id}
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value as BenchmarkSymbol)}
      >
        {["SPY", "QQQ", "DIA", "IWM"].map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
    </label>
  );
}
