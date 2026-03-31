import fs from "fs";
import PDFDocument from "pdfkit";

// --- Read inputs ---
const testReport = fs.existsSync("junit.xml")
  ? fs.readFileSync("junit.xml", "utf-8")
  : "No test report found";

const lintReport = fs.existsSync("lint-report.json")
  ? (() => {
      const raw = JSON.parse(fs.readFileSync("lint-report.json", "utf-8"));
      const errors = raw.filter((f) => f.errorCount > 0);
      if (errors.length === 0) return "No lint errors found.";
      return errors
        .map((f) => {
          const short = f.filePath.replace(process.cwd(), "");
          const msgs = f.messages.map((m) => `  Line ${m.line}: [${m.ruleId}] ${m.message}`).join("\n");
          return `${short}\n${msgs}`;
        })
        .join("\n\n");
    })()
  : "No lint report found";

const coverageSummary = fs.existsSync("coverage/coverage-summary.json")
  ? JSON.parse(fs.readFileSync("coverage/coverage-summary.json", "utf-8"))
  : null;

const coverageText = coverageSummary
  ? [
      `Lines:      ${coverageSummary.total.lines.pct}%`,
      `Statements: ${coverageSummary.total.statements.pct}%`,
      `Functions:  ${coverageSummary.total.functions.pct}%`,
      `Branches:   ${coverageSummary.total.branches.pct}%`,
    ].join("\n")
  : "No coverage data found";

// --- Build PDF ---
const doc = new PDFDocument({ margin: 50, autoFirstPage: true });
doc.pipe(fs.createWriteStream("report.pdf"));

const CONTENT_WIDTH = doc.page.width - 100; // 50px margin each side

const heading = (text) => {
  doc.moveDown(1)
     .font("Helvetica-Bold")
     .fontSize(14)
     .fillColor("#1a1a1a")
     .text(text)
     .moveDown(0.3);
};

const codeBlock = (text) => {
  // eslint-disable-next-line no-control-regex
  const sanitised = text.replace(new RegExp("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]", "g"), "");
  doc.font("Courier")
     .fontSize(8)
     .fillColor("#222222")
     .text(sanitised, {
       width: CONTENT_WIDTH,
       lineGap: 2,
     });
  doc.moveDown(0.5);
};

// Title
doc.font("Helvetica-Bold")
   .fontSize(22)
   .fillColor("#000000")
   .text("CI Test Report", { align: "center" });

doc.font("Helvetica")
   .fontSize(10)
   .fillColor("#666666")
   .text(`Generated: ${new Date().toUTCString()}`, { align: "center" });

doc.moveDown(1);

heading("Test Results");
codeBlock(testReport.slice(0, 4000));

heading("Coverage Summary");
codeBlock(coverageText);

heading("Lint Results");
codeBlock(lintReport.slice(0, 4000));

doc.end();
console.log("report.pdf written");