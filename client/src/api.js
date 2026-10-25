// Tiny wrapper around the server API. Every module imports from here.

async function request(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  state: () => request('GET', '/state'),

  // Welfare calls
  call: (id, mode = 'auto') => request('POST', `/cases/${id}/call`, { mode }),
  text: (id, mode = 'auto') => request('POST', `/cases/${id}/text`, { mode }),
  callContact: (id, mode = 'auto') => request('POST', `/cases/${id}/call-contact`, { mode }),
  reply: (callId, text) => request('POST', `/calls/${callId}/reply`, { text }),
  hangUp: (callId) => request('POST', `/calls/${callId}/hangup`),
  startRound: (limit) => request('POST', '/rounds/start', limit ? { limit } : {}),
  stopRound: () => request('POST', '/rounds/stop'),
  simulateInbound: (opts) => request('POST', '/inbound/simulate', opts),

  // Dispatcher actions
  assign: (id, responderId) => request('POST', `/cases/${id}/assign`, { responderId }),
  release: (id) => request('POST', `/cases/${id}/release`),
  markSafe: (id) => request('POST', `/cases/${id}/safe`),
  reopen: (id) => request('POST', `/cases/${id}/reopen`),
  addNote: (id, text) => request('POST', `/cases/${id}/notes`, { text }),

  applyZoneReport: (report) => request('POST', '/zone-report', report),
  reset: () => request('POST', '/reset'),
};
