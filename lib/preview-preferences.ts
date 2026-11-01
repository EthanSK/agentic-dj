import { DEFAULT_PREVIEW_VOLUME, normalisePreviewVolume } from './player.ts';

export const PREVIEW_PREFERENCES_KEY = 'agentic-dj:preview-preferences:v1';
type Preferences = { volume: number; playersAllowed: boolean };
type Store = Pick<Storage, 'getItem' | 'setItem'>;
const defaults: Preferences = {
  volume: DEFAULT_PREVIEW_VOLUME,
  playersAllowed: false,
};

export function readPreviewPreferences(
  getStore: () => Store = () => window.localStorage,
): Preferences {
  try {
    const value = JSON.parse(
      getStore().getItem(PREVIEW_PREFERENCES_KEY) || 'null',
    );
    return {
      volume:
        typeof value?.volume === 'number'
          ? normalisePreviewVolume(value.volume)
          : defaults.volume,
      playersAllowed: value?.playersAllowed === true,
    };
  } catch {
    return { ...defaults };
  }
}

export function savePreviewPreferences(
  patch: Partial<Preferences>,
  getStore: () => Store = () => window.localStorage,
): void {
  try {
    const store = getStore();
    store.setItem(
      PREVIEW_PREFERENCES_KEY,
      JSON.stringify({ ...readPreviewPreferences(() => store), ...patch }),
    );
  } catch {
    // Restricted browser storage must not break listening or the live slider.
  }
}
