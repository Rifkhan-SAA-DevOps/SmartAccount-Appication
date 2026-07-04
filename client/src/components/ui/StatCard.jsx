export default function StatCard({ title, value, subtitle, tone = 'purple' }) {
  return (
    <div className={`stat-card tone-${tone}`}>
      <div>
        <span>{title}</span>
        <strong>{value}</strong>
        {subtitle && <small>{subtitle}</small>}
      </div>
      <div className="stat-orb" />
    </div>
  );
}
