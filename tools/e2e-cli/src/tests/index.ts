import { TestDefinition } from '../types';

import { auditTest } from './audit';
import { deprecateTest } from './deprecate';
import { distTagsTest } from './dist-tags';
import { infoTest } from './info';
import { installTest } from './install';
import { pingTest } from './ping';
import { publishTest } from './publish';
import { searchTest } from './search';
import { starTest } from './star';
import { unpublishTest } from './unpublish';

export const allTests: TestDefinition[] = [
  publishTest,
  installTest,
  auditTest,
  infoTest,
  deprecateTest,
  distTagsTest,
  pingTest,
  searchTest,
  starTest,
  unpublishTest,
];

export {
  publishTest,
  installTest,
  auditTest,
  infoTest,
  deprecateTest,
  distTagsTest,
  pingTest,
  searchTest,
  starTest,
  unpublishTest,
};
