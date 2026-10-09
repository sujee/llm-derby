import { describe, expect, it } from 'vitest';
import pkg from '../package.json';
import lock from '../package-lock.json';
import info from '../version.json';
import { APP_VERSION, APP_VERSION_LABEL } from './version';

describe('app version', () => {
  it('is a whole number (v1, v2, v3, …)', () => {
    expect(Number.isInteger(info.version) && info.version >= 1).toBe(true);
    expect(APP_VERSION).toBe(info.version);
    expect(APP_VERSION_LABEL).toBe(`v${info.version}`);
  });
  it('matches package.json and package-lock.json as N.0.0 (bump with npm run version:bump)', () => {
    expect(pkg.version).toBe(`${info.version}.0.0`);
    expect(lock.version).toBe(`${info.version}.0.0`);
  });
});
