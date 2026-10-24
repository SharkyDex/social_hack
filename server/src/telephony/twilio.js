// ─────────────────────────────────────────────────────────────
//  twilio.js — PLACEHOLDER for real calls and texts.
//
//  Not built yet (budget $0 for now). The rest of the app already
//  talks to this shape, so filling it in is the only change needed:
//
//    placeCall({ to, callId, personId, attempt, target }) → { answered }
//    sendSms({ to, body, callId, personId, attempt, target }) → { replied }
//
//  Suggested approach (Twilio ConversationRelay):
//   1. npm i twilio -w server, fill TWILIO_* and PUBLIC_BASE_URL in .env
//      (PUBLIC_BASE_URL = your ngrok URL during the demo).
//   2. placeCall: client.calls.create({ to, from, twiml }) where the TwiML is
//        <Connect><ConversationRelay url="wss://PUBLIC_BASE_URL/api/twilio/relay?callId=…"/></Connect>
//      and statusCallback → /api/twilio/status to learn answered / no-answer.
//   3. Add a WebSocket route /api/twilio/relay: each "prompt" message from
//      Twilio is the person's words → store.addTurn(callId, 'resident', text)
//      → ai.chat(dispatcherSystem + turns) → send the reply text back, which
//      Twilio speaks. On [END], hang up and call engine.finishCall(callId).
//   4. sendSms: client.messages.create({ to, from, body }); inbound replies
//      arrive on a webhook → store.addTurn(…) → engine.finishCall when done.
//   5. Inbound calls: point the Twilio number's voice webhook at
//      /api/twilio/inbound, which returns
//        <Dial timeout="INBOUND_FORWARD_TIMEOUT_SECONDS" action="/api/twilio/inbound-fallback">
//          INBOUND_FORWARD_NUMBER</Dial>
//      and the fallback connects ConversationRelay with intakeSystem().
//
//  Free trial note: trial accounts can only call/text numbers you have
//  verified in the Twilio console — perfect for a demo phone.
// ─────────────────────────────────────────────────────────────
import { config } from '../config.js';

function notReady() {
  throw new Error(
    'Twilio provider is a placeholder. Set TELEPHONY_PROVIDER=simulated, or implement server/src/telephony/twilio.js.',
  );
}

export const twilio = {
  name: 'twilio',
  live: true,
  configured: () => Boolean(config.twilio.accountSid && config.twilio.authToken && config.twilio.fromNumber),
  async placeCall() {
    notReady();
  },
  async sendSms() {
    notReady();
  },
};
