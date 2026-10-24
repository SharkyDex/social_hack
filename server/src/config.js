import { config as loadEnv } from 'dotenv';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, '..', '..');

// .env lives in the repo root so every module shares one file.
loadEnv({ path: join(ROOT, '.env') });

const num = (v, d) => (v === undefined || v === '' ? d : Number(v));
const fromRoot = (v, d) => (v ? resolve(ROOT, v) : d);

export const config = {
  port: num(process.env.PORT, 3001),

  groqKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',

  telephonyProvider: process.env.TELEPHONY_PROVIDER || 'simulated',
  demoPhoneNumber: process.env.DEMO_PHONE_NUMBER || '',
  inboundForwardNumber: process.env.INBOUND_FORWARD_NUMBER || '',
  inboundForwardTimeout: num(process.env.INBOUND_FORWARD_TIMEOUT_SECONDS, 20),
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    fromNumber: process.env.TWILIO_FROM_NUMBER || '',
    publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
  },

  // After an earthquake voice networks jam first; texts often still get through.
  // 'sms' texts everyone first; 'voice' calls unless they're Deaf / non-verbal.
  firstContact: process.env.FIRST_CONTACT === 'sms' ? 'sms' : 'voice',
  maxAttempts: num(process.env.MAX_CALL_ATTEMPTS, 3),
  retryDelayMs: num(process.env.RETRY_DELAY_SECONDS, 8) * 1000,
  contactEmergencyAfter: num(process.env.CONTACT_EMERGENCY_AFTER_ATTEMPT, 1),
  checkConcurrency: num(process.env.CHECK_CONCURRENCY, 2),
  // >1 plays simulated conversations faster (e.g. 2 = twice as fast) for demos.
  playbackSpeed: num(process.env.PLAYBACK_SPEED, 1),

  // Data files (paths relative to the repo root).
  peopleFile: fromRoot(process.env.PEOPLE_FILE, join(ROOT, 'shared', 'data', 'people.sample.json')),
  scenariosFile: fromRoot(process.env.SCENARIOS_FILE, join(ROOT, 'shared', 'data', 'scenarios.sample.json')),
  respondersFile: fromRoot(process.env.RESPONDERS_FILE, join(ROOT, 'shared', 'data', 'responders.sample.json')),
  // Work with a sample of a big dataset: 0 = everyone.
  peopleSample: num(process.env.PEOPLE_SAMPLE, 0),
  // mixed = a third highest-risk + the rest random · risk = highest-risk only · random
  peopleSampleMode: process.env.PEOPLE_SAMPLE_MODE || 'mixed',
  peopleSampleSeed: num(process.env.PEOPLE_SAMPLE_SEED, 7),

  agencyName: process.env.AGENCY_NAME || 'Cypress Bend Emergency Services',
  disasterName: process.env.DISASTER_NAME || 'the earthquake',
};
