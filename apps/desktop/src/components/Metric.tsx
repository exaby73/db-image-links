type MetricProps = {
  label: string;
  value: number;
};

export function Metric({ label, value }: MetricProps) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
