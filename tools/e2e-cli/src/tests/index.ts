import {
  allScenarios,
  installMultipleDepsScenario,
  metadataScenario,
  minimumReleaseAgeScenario,
  reservedNamesScenario,
  searchScenario,
  tarballsScenario,
  uplinkFailureScenario,
} from '../scenarios';
import { TestDefinition } from '../types';
import { auditTest } from './audit';
import { ciTest } from './ci';
import { deprecateTest } from './deprecate';
import { distTagsTest } from './dist-tags';
import { infoTest } from './info';
import { installTest } from './install';
import { loginTest } from './login';
import { packageNamesTest } from './package-names';
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
  packageNamesTest,
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
  packageNamesTest,
  loginTest,
  pingTest,
  searchTest,
  unpublishTest,
  // Scenarios
  installMultipleDepsScenario,
  minimumReleaseAgeScenario,
  tarballsScenario,
  metadataScenario,
  searchScenario,
  uplinkFailureScenario,
  reservedNamesScenario,
  allScenarios,
};
