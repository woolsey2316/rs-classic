const SKILL_LABELS = {
  attack: "Attack",
  defense: "Defense",
  strength: "Strength",
  hits: "Hits",
  ranged: "Ranged",
  prayer: "Prayer",
  magic: "Magic",
  cooking: "Cooking",
  woodcutting: "Woodcutting",
  fletching: "Fletching",
  fishing: "Fishing",
  firemaking: "Firemaking",
  crafting: "Crafting",
  smithing: "Smithing",
  mining: "Mining",
  herblaw: "Herblaw",
  agility: "Agility",
  thieving: "Thieving",
};

export default function SkillsPanel({ skills, totalLevel }) {
  return (
    <section className="panel skills-panel">
      <header className="panel-header">
        <h2>Skills</h2>
        <span className="total-level">Total {totalLevel ?? 0}</span>
      </header>
      <ul className="skills-grid">
        {(skills || []).map((skill) => {
          const next = skill.xp_for_next;
          const currentFloor = skill.xp_for_level ?? 0;
          const progress =
            next == null
              ? 100
              : Math.min(
                  100,
                  ((skill.xp - currentFloor) / Math.max(1, next - currentFloor)) * 100,
                );
          return (
            <li key={skill.name} className="skill-row" title={`${skill.xp.toLocaleString()} xp`}>
              <span className="skill-name">{SKILL_LABELS[skill.name] || skill.name}</span>
              <span className="skill-level">{skill.level}</span>
              <div className="skill-bar">
                <div className="skill-bar-fill" style={{ width: `${progress}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
