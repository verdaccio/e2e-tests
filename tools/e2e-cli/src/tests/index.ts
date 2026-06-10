import { allScenarios, installMultipleDepsScenario, minimumReleaseAgeScenario } from '../scenarios';
import { TestDefinition } from '../types';
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
  unpublishTest,
  // Scenarios
  installMultipleDepsScenario,
  minimumReleaseAgeScenario,
  allScenarios,
};
