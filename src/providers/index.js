import { createAhProvider } from './ah.js';
import { createJumboProvider } from './jumbo.js';
import { createDemoProvider } from './demo.js';

export const STORES = ['ah', 'jumbo'];

export function createProviders({ demo = process.env.DEMO === '1' } = {}) {
  if (demo) {
    return { ah: createDemoProvider('ah'), jumbo: createDemoProvider('jumbo') };
  }
  return { ah: createAhProvider(), jumbo: createJumboProvider() };
}
