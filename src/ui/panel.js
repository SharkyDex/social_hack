// Side panel: disaster controls + the live zone severity list.
// Pure DOM, no framework — keeps this independent of the Three.js code so
// the UI owner can rework styling without touching the simulation.

export function createPanel(root, { onSelectDisaster, onStart, onReset }) {
  root.innerHTML = `
    <h1>City Disaster Sim</h1>
    <div class="controls">
      <label>Disaster
        <select id="disaster-select">
          <option value="earthquake">Earthquake</option>
        </select>
      </label>
      <div class="buttons">
        <button id="start-btn">Start</button>
        <button id="reset-btn">Reset</button>
      </div>
    </div>
    <div class="legend">
      <span class="dot critical"></span> Critical
      <span class="dot dangerous"></span> Dangerous
      <span class="dot moderate"></span> Moderate
      <span class="dot safe"></span> Safe
    </div>
    <div class="legend facilities">
      🏥 Hospital (7) &nbsp; 🏫 School (5) &nbsp; 🎓 College (4) &nbsp; 🩺 Special care (9)
    </div>
    <div class="status" id="status"></div>
    <div class="summary" id="summary"></div>
    <ol class="zone-list" id="zone-list"></ol>
  `;

  const select = root.querySelector('#disaster-select');
  select.addEventListener('change', () => onSelectDisaster(select.value));
  root.querySelector('#start-btn').addEventListener('click', onStart);
  root.querySelector('#reset-btn').addEventListener('click', onReset);

  const listEl = root.querySelector('#zone-list');
  const summaryEl = root.querySelector('#summary');
  const statusEl = root.querySelector('#status');

  function setStatus(text) {
    statusEl.textContent = text || '';
    statusEl.style.display = text ? 'block' : 'none';
  }
  const order = { critical: 0, dangerous: 1, moderate: 2, safe: 3 };

  function update(zones) {
    const counts = { critical: 0, dangerous: 0, moderate: 0, safe: 0 };
    for (const z of zones) counts[z.severity]++;
    summaryEl.textContent =
      `${counts.critical} critical · ${counts.dangerous} dangerous · ` +
      `${counts.moderate} moderate · ${counts.safe} safe (of ${zones.length} zones)`;

    const sorted = [...zones].sort((a, b) => order[a.severity] - order[b.severity] || b.score - a.score);
    const SHOWN = 12;
    const shown = sorted.slice(0, SHOWN);
    const remaining = zones.length - shown.length;
    listEl.innerHTML = shown
      .map(
        (z) => `
        <li class="${z.severity}">
          <span class="label">${z.label}</span>
          <span class="tag">${z.severity}</span>
          <span class="meta">${z.hasHospital ? '🏥 ' : ''}${!z.hospitalReachable ? 'cut off · ' : ''}pop ${z.population}</span>
        </li>`
      )
      .join('') + (remaining > 0 ? `<li class="more">+ ${remaining} more zone${remaining === 1 ? '' : 's'} not shown</li>` : '');
  }

  return { update, select, setStatus };
}
