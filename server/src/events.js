// Live updates to every open dashboard via Server-Sent Events.
// The browser opens one long request to /api/events and receives
// small JSON messages whenever a case, call or responder changes.

const clients = new Set();

export function sseHandler(req, res) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('retry: 2000\n\n');
  clients.add(res);
  req.on('close', () => clients.delete(res));
}

export function broadcast(type, data) {
  const msg = `data: ${JSON.stringify({ type, data })}\n\n`;
  for (const res of clients) res.write(msg);
}

// Keep proxies (and ngrok) from closing idle connections.
setInterval(() => {
  for (const res of clients) res.write(': ping\n\n');
}, 25000).unref();
