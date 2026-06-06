import { TestDefinition } from '../types';
import { installMultipleDepsScenario } from './install-multiple-deps';
import { minimumReleaseAgeScenario } from './minimum-release-age';

export const allScenarios: TestDefinition[] = [
  installMultipleDepsScenario,
  minimumReleaseAgeScenario,
];

export { installMultipleDepsScenario, minimumReleaseAgeScenario };
