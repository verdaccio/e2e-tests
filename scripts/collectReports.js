const fs = require('fs');
const path = require('path');

const debug = require('debug')('report')

const reportsDir = path.resolve(__dirname, '../');
const outputJson = path.resolve(__dirname, '../reports.json');

const collectReports = () => {
  debug('Collect reports ...')
  const reportFolders = fs.readdirSync(reportsDir).filter(name => name.startsWith('report_'));
  const results = [];

  reportFolders.forEach(reportFolder => {
    debug('report folder:', reportFolder)
    const reportPath = path.join(reportsDir, reportFolder);
    debug('report path:', reportPath)
    const packageManagers = fs.readdirSync(reportPath).filter(name => name.startsWith('vitest-reports-'));
    debug('package managers:', packageManagers)
    packageManagers.forEach(pkgManager => {
        const pkgManagerName = pkgManager.replace("vitest-reports-", ""); 
      const newFileName = `vitest-report-${pkgManagerName}.json`; 
      const reportFile = path.join(reportPath, pkgManager, newFileName);
      debug('report file', path.resolve(reportFile))
      if (fs.existsSync(reportFile)) {
        const reportData = JSON.parse(fs.readFileSync(reportFile, 'utf-8'));
        results.push({
          commit: reportFolder.replace('report_', ''),
          packageManager: pkgManager.replace('vitest-reports-', ''),
          ...reportData,
        });
      }
    });
  });

  fs.writeFileSync(outputJson, JSON.stringify(results, null, 2));
  console.log('Reports collected successfully.');
};

collectReports();
