// One live connection to the server, shared by every page.
// Loads /api/state once, then applies small updates from /api/events.
import { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import { api } from './api.js';

const LiveContext = createContext(null);

const initial = { loaded: false, connected: false, meta: null, cases: {}, calls: {}, responders: {}, round: null, error: null };

const byKey = (list, key) => Object.fromEntries(list.map((x) => [x[key], x]));

function reducer(state, { type, data }) {
  switch (type) {
    case 'loaded':
      return {
        ...state,
        loaded: true,
        error: null,
        meta: data.meta,
        round: data.meta.round,
        cases: byKey(data.cases, 'personId'),
        calls: byKey(data.calls, 'id'),
        responders: byKey(data.responders, 'id'),
      };
    case 'error':
      return { ...state, error: data };
    case 'connected':
      return { ...state, connected: data };
    case 'case':
      return { ...state, cases: { ...state.cases, [data.personId]: data } };
    case 'call':
      return { ...state, calls: { ...state.calls, [data.id]: data } };
    case 'turn': {
      const call = state.calls[data.callId];
      if (!call || call.turns.length > data.index) return state;
      return { ...state, calls: { ...state.calls, [data.callId]: { ...call, turns: [...call.turns, data.turn] } } };
    }
    case 'responder':
      return { ...state, responders: { ...state.responders, [data.id]: data } };
    case 'round':
      return { ...state, round: data };
    default:
      return state;
  }
}

export function LiveStateProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initial);

  useEffect(() => {
    let es;
    let cancelled = false;
    const load = () =>
      api
        .state()
        .then((d) => !cancelled && dispatch({ type: 'loaded', data: d }))
        .catch((e) => dispatch({ type: 'error', data: e.message }));

    load();
    es = new EventSource('/api/events');
    es.onopen = () => {
      dispatch({ type: 'connected', data: true });
      load(); // resync after reconnects
    };
    es.onerror = () => dispatch({ type: 'connected', data: false });
    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'reset') load();
      else dispatch(msg);
    };
    return () => {
      cancelled = true;
      es?.close();
    };
  }, []);

  return <LiveContext.Provider value={state}>{children}</LiveContext.Provider>;
}

export function useLive() {
  return useContext(LiveContext);
}

const LEVEL_ORDER = { CRITICAL: 0, HIGH: 1, STANDARD: 2, RESOLVED: 3 };

/** Cases sorted the same way the server sorts them. */
export function useSortedCases() {
  const { cases } = useLive();
  return useMemo(
    () =>
      Object.values(cases).sort((a, b) => {
        const levelDiff = (LEVEL_ORDER[a.priority.level] ?? 2) - (LEVEL_ORDER[b.priority.level] ?? 2);
        if (levelDiff) return levelDiff;
        if (!!a.priority.reviewRequired !== !!b.priority.reviewRequired) return a.priority.reviewRequired ? -1 : 1;
        return b.priority.score - a.priority.score;
      }),
    [cases],
  );
}

export const ACTIVE_CALL = ['dialing', 'ringing', 'sending', 'forwarding', 'in_progress'];

export function useActiveCalls() {
  const { calls } = useLive();
  return useMemo(() => Object.values(calls).filter((c) => ACTIVE_CALL.includes(c.status) || c.extracting), [calls]);
}
