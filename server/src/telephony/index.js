// Picks the phone service from TELEPHONY_PROVIDER and applies the
// demo safety net: with a live provider, every call/text is sent to
// DEMO_PHONE_NUMBER, never to the number in the dataset.
import { config } from '../config.js';
import { simulated } from './simulated.js';
import { twilio } from './twilio.js';

const providers = { simulated, twilio };

export function provider() {
  return providers[config.telephonyProvider] || simulated;
}

export function destination(realNumber) {
  const p = provider();
  if (!p.live) return realNumber;
  if (!config.demoPhoneNumber) {
    throw new Error('Live calling needs DEMO_PHONE_NUMBER set — refusing to dial dataset numbers.');
  }
  return config.demoPhoneNumber;
}
