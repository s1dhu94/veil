// Firebase wiring: App Check, Remote Config and Firebase AI Logic hybrid inference.
import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getRemoteConfig, fetchAndActivate, getValue } from 'firebase/remote-config';
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode, InferenceSource, Schema } from 'firebase/ai';
import { firebaseConfig, recaptchaSiteKey } from './firebase-config.js';
import { buildEntityPrompt, entitySchema, parseEntities, ENTITY_JSON_SCHEMA } from './core/prompts.js';

export { InferenceSource };

const app = initializeApp(firebaseConfig);

if (import.meta.env.DEV) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey),
  isTokenAutoRefreshEnabled: true,
});

const rc = getRemoteConfig(app);
rc.settings.minimumFetchIntervalMillis = 60 * 60 * 1000;
rc.defaultConfig = {
  cloud_model: 'gemini-3.5-flash-lite',
  on_device_max_chars: 6000,
};
export const configReady = fetchAndActivate(rc).catch(() => false);
export const cfg = () => ({
  cloudModel: getValue(rc, 'cloud_model').asString(),
  onDeviceMaxChars: getValue(rc, 'on_device_max_chars').asNumber() || 6000,
});

const ai = getAI(app, { backend: new GoogleAIBackend() });

const models = {};
function model(mode, json = false) {
  const key = mode + (json ? ':json' : '');
  if (!models[key]) {
    const generationConfig = json
      ? { responseMimeType: 'application/json', responseSchema: entitySchema(Schema), temperature: 0 }
      : { temperature: 0.3 };
    models[key] = getGenerativeModel(ai, {
      mode,
      inCloudParams: { model: cfg().cloudModel, generationConfig },
      onDeviceParams: {
        createOptions: {
          expectedInputs: [{ type: 'text', languages: ['en'] }],
          expectedOutputs: [{ type: 'text', languages: ['en'] }],
        },
        promptOptions: json ? { responseConstraint: ENTITY_JSON_SCHEMA } : undefined,
      },
    });
  }
  return models[key];
}

/** Chrome Prompt API availability: available | downloadable | downloading | unavailable */
export async function deviceStatus() {
  try {
    if (!('LanguageModel' in self)) return 'unavailable';
    return await self.LanguageModel.availability({
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
    });
  } catch {
    return 'unavailable';
  }
}

/** Must be called from a user gesture. Starts/finishes the Gemini Nano download. */
export async function prepareDevice(onProgress) {
  await Promise.all([
    model(InferenceMode.ONLY_ON_DEVICE, true).initializeDeviceModel(onProgress),
    model(InferenceMode.PREFER_ON_DEVICE).initializeDeviceModel(onProgress),
  ]);
}

/**
 * Find names/addresses/organisations/health details with the ON-DEVICE model only.
 * Raw text is never sent to the cloud: ONLY_ON_DEVICE throws instead of falling back.
 */
export async function findEntitiesOnDevice(text) {
  const m = model(InferenceMode.ONLY_ON_DEVICE, true);
  const res = await m.generateContent(buildEntityPrompt(text.slice(0, cfg().onDeviceMaxChars)));
  if (res.response.inferenceSource && res.response.inferenceSource !== InferenceSource.ON_DEVICE) {
    throw new Error('Refusing non-local entity detection');
  }
  return parseEntities(res.response.text(), text);
}

/**
 * Answer the task on MASKED text. route: 'auto' | 'cloud' | 'device'.
 * Streams text through onChunk and returns { text, source }.
 */
export async function answer(prompt, route, onChunk) {
  const mode = { auto: InferenceMode.PREFER_ON_DEVICE, cloud: InferenceMode.ONLY_IN_CLOUD, device: InferenceMode.ONLY_ON_DEVICE }[route];
  const res = await model(mode).generateContentStream(prompt);
  let text = '';
  for await (const chunk of res.stream) {
    text += chunk.text();
    onChunk?.(text);
  }
  const final = await res.response;
  return { text, source: final.inferenceSource || (route === 'cloud' ? InferenceSource.IN_CLOUD : undefined) };
}
