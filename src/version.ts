import info from '../version.json';

/** The app version: a whole number from version.json, raised by one on every publish (`npm run version:bump`). */
export const APP_VERSION: number = info.version;

/** "v1", "v2", … as shown in the app. */
export const APP_VERSION_LABEL = `v${APP_VERSION}`;
