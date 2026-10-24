import { CONFIG } from '../config.js';

// Builds the zone report: one entry per zone with just its zone number and
// severity level. Nothing else — population and other per-person data live in
// a separate dataset keyed on the same zone number.
export function buildZoneReport(zones, disasterName) {
  const entries = zones
    .slice()
    .sort((a, b) => a.id - b.id)
    .map((z) => ({
      zone: z.id,
      severity: z.severity,
    }));

  return {
    disaster: disasterName,
    generatedAt: new Date().toISOString(),
    zones: entries,
  };
}

// Counts zones by severity — used for the on-screen summary, not written to
// the file.
export function countSeverities(zones) {
  const counts = { critical: 0, dangerous: 0, moderate: 0, safe: 0 };
  for (const z of zones) counts[z.severity] = (counts[z.severity] || 0) + 1;
  return counts;
}

// Saves the report. Under `npm run dev`, POSTs it to the dev server, which
// writes it into the project at reports/zone_severity_<disaster>.json (see
// vite.config.js). If that endpoint isn't available (e.g. a production
// build with no dev server), falls back to a browser download so the data
// is never lost. Returns a short description of where it went.
export async function saveZoneReport(report) {
  try {
    const res = await fetch('/api/save-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });
    if (res.ok) {
      const { path } = await res.json();
      return { mode: 'file', path };
    }
  } catch (_err) {
    // dev endpoint not reachable — fall through to download
  }
  downloadZoneReport(report);
  return { mode: 'download', path: `zone_severity_${report.disaster}.json` };
}

// Fallback: browser download of the report as a .json file.
export function downloadZoneReport(report) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `zone_severity_${report.disaster}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
