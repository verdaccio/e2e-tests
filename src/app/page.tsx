



import styles from "./page.module.css";

import fs from "fs";
import path from "path";

interface ReportData {
  commit: string;
  packageManager: string;
  numTotalTestSuites: number;
  numPassedTestSuites: number;
  numFailedTestSuites: number;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  // Add more fields as needed
}

export default function ReportsPage() {
 // Path to your reports.json file
 const filePath = path.join(process.cwd(), "reports.json");

 let reports: ReportData[] = [];

 try {
   const data = fs.readFileSync(filePath, "utf8");
   reports = JSON.parse(data);
 } catch (err) {
   console.error("Error reading reports.json:", err);
 }
 return (
  <div>
    <h1>Test Reports</h1>
    <table>
      <thead>
        <tr>
          <th>Commit</th>
          <th>Package Manager</th>
          <th>Total Suites</th>
          <th>Passed Suites</th>
          <th>Failed Suites</th>
          <th>Total Tests</th>
          <th>Passed Tests</th>
          <th>Failed Tests</th>
        </tr>
      </thead>
      <tbody>
        {reports.map((report, index) => (
          <tr key={index}>
            <td>{report.commit}</td>
            <td>{report.packageManager}</td>
            <td>{report.numTotalTestSuites}</td>
            <td>{report.numPassedTestSuites}</td>
            <td>{report.numFailedTestSuites}</td>
            <td>{report.numTotalTests}</td>
            <td>{report.numPassedTests}</td>
            <td>{report.numFailedTests}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
};
