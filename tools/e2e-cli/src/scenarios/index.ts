import { TestDefinition } from '../types';
import { installMultipleDepsScenario } from './install-multiple-deps';
import { metadataScenario } from './metadata';
import { minimumReleaseAgeScenario } from './minimum-release-age';
import { reservedNamesScenario } from './reserved-names';
import { searchScenario } from './search';
import { tarballsScenario } from './tarballs';
import { uplinkFailureScenario } from './uplink-failure';

export const allScenarios: TestDefinition[] = [
  installMultipleDepsScenario,
  minimumReleaseAgeScenario,
  tarballsScenario,
  metadataScenario,
  searchScenario,
  uplinkFailureScenario,
  reservedNamesScenario,
];

export {
  installMultipleDepsScenario,
  minimumReleaseAgeScenario,
  searchScenario,
  tarballsScenario,
  metadataScenario,
  uplinkFailureScenario,
  reservedNamesScenario,
};
