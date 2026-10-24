// Buttons to simulate a call coming IN (an unregistered person calling for help).
// Real routing: ring 911 first, AI intake only if no operator answers.
import { useState } from 'react';
import { api } from '../../api.js';

export default function InboundControls() {
  const [open, setOpen] = useState(false);
  const go = (opts) => {
    setOpen(false);
    api.simulateInbound(opts);
  };
  return (
    <div className="menu-wrap">
      <button className="btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Simulate incoming call ▾
      </button>
      {open && (
        <div className="menu" role="menu">
          <button onClick={() => go({ mode: 'auto' })}>
            <strong>911 busy → AI intake</strong>
            <span>AI plays both sides</span>
          </button>
          <button onClick={() => go({ mode: 'interactive' })}>
            <strong>911 busy → AI intake, you're the caller</strong>
            <span>Type the caller's answers</span>
          </button>
          <button onClick={() => go({ mode: 'auto', registered: true })}>
            <strong>Someone in the registry calls in</strong>
            <span>Shows the caller being matched to their card</span>
          </button>
          <button onClick={() => go({ operatorAvailable: true })}>
            <strong>911 operator answers</strong>
            <span>Call is handed over; AI stays out</span>
          </button>
        </div>
      )}
    </div>
  );
}
