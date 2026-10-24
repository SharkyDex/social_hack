export function formatPhone(e164) {
  if (!e164) return '—';
  const d = String(e164).replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : e164;
}

export function timeAgo(iso, now = Date.now()) {
  if (!iso) return null;
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}

export function clock(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export const STATUS = {
  not_contacted: { label: 'Not contacted', tone: 'muted' },
  in_progress: { label: 'Contacting…', tone: 'info' },
  no_answer: { label: 'No answer', tone: 'warn' },
  unreachable: { label: 'Unreachable', tone: 'danger' },
  needs_help: { label: 'Needs help', tone: 'danger' },
  reached: { label: 'Reached', tone: 'info' },
  reached_ok: { label: 'Reached — OK', tone: 'ok' },
  responder_assigned: { label: 'Responder assigned', tone: 'violet' },
  safe: { label: 'Safe', tone: 'ok' },
};

export const CALL_STATUS = {
  dialing: 'Dialing',
  ringing: 'Ringing',
  sending: 'Sending text',
  forwarding: 'Forwarding to 911',
  in_progress: 'Live',
  completed: 'Completed',
  no_answer: 'No answer',
  canceled: 'Canceled',
  failed: 'Failed',
};

export const firstName = (n = '') => n.split(' ')[0];
