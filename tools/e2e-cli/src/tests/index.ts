import { TestDefinition } from '../types';

import { allScenarios, installMultipleDepsScenario } from '../scenarios';
import { auditTest } from './audit';
import { ciTest } from './ci';
import { deprecateTest } from './deprecate';
import { distTagsTest } from './dist-tags';
import { infoTest } from './info';
import { installTest } from './install';
import { loginTest } from './login';
import { pingTest } from './ping';
import { publishTest } from './publish';
import { searchTest } from './search';
import { starTest } from './star';
import { unpublishTest } from './unpublish';

export const allTests: TestDefinition[] = [
  publishTest,
  installTest,
  ciTest,
  auditTest,
  infoTest,
  deprecateTest,
  distTagsTest,
  loginTest,
  pingTest,
  searchTest,
  starTest,
  unpublishTest,
  // Scenarios (complex, multi-step tests)
  ...allScenarios,
];

export {
  publishTest,
  installTest,
  ciTest,
  auditTest,
  infoTest,
  deprecateTest,
  distTagsTest,
  loginTest,
  pingTest,
  searchTest,
  starTest,
  unpublishTest,
  // Scenarios
  installMultipleDepsScenario,
  allScenarios,
};
