import { GENERATION_ROMAN } from "../constants/pokemon";

interface BentoCardProps {
  title: React.ReactNode;
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
}

export function BentoCard({ title, subtitle, className, children }: BentoCardProps) {
  return (
    <section className={`bento-card ${className ?? ""}`}>
      <header className="bento-card-header">
        <h2 className="bento-card-title">{title}</h2>
        {subtitle ? <span>{subtitle}</span> : null}
      </header>
      <div className="bento-card-body">{children}</div>
    </section>
  );
}

export function generationLabel(generation: number): string {
  return `Gen ${GENERATION_ROMAN[generation] ?? generation}`;
}
