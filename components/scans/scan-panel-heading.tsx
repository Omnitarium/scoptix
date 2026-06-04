/** Section title style aligned with Summary tab cards (e.g. Findings by Type Top 10). */
export const scanPanelEyebrowClass =
  "text-[10px] font-semibold uppercase tracking-[0.2em] text-accent";

export function ScanPanelHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div>
      <h2 className={scanPanelEyebrowClass}>{title}</h2>
      {description ? <p className="mt-1 text-[12px] text-muted">{description}</p> : null}
    </div>
  );
}
