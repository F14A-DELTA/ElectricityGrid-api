const fs = require("fs");

const testReport = fs.existsSync("junit.xml")
  ? fs.readFileSync("junit.xml", "utf-8")
  : "No test report found";

const lintReport = fs.existsSync("lint-report.json")
  ? fs.readFileSync("lint-report.json", "utf-8")
  : "No lint report found";

const coverageSummary = fs.existsSync("coverage/coverage-summary.json")
  ? JSON.parse(fs.readFileSync("coverage/coverage-summary.json", "utf-8"))
  : null;

let coverageText = "No coverage data found";

if (coverageSummary) {
  const total = coverageSummary.total;
  coverageText = `
Lines: ${total.lines.pct}%
Statements: ${total.statements.pct}%
Functions: ${total.functions.pct}%
Branches: ${total.branches.pct}%
`;
}

const markdown = `
# Test Report

## Test Results
\`\`\`
${testReport}
\`\`\`

## Coverage Summary
\`\`\`
${coverageText}
\`\`\`

## 🧹 Lint Results
\`\`\`
${lintReport}
\`\`\`
`;

fs.writeFileSync("report.md", markdown);
