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
      if (errors.length === 0) return "✅ No lint errors found.";
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
const doc = new PDFDocument({ margin: 50 });
doc.pipe(fs.createWriteStream("report.pdf"));

const heading = (text) => {
  doc.moveDown(0.5)
     .fontSize(16).fillColor("#1a1a1a").font("Helvetica-Bold").text(text)
     .moveDown(0.3);
};

const codeBlock = (text) => {
  doc.rect(doc.x, doc.y, 495, doc.heightOfString(text, { width: 475 }) + 16)
     .fill("#f5f5f5");
  doc.fillColor("#222").font("Courier").fontSize(8)
     .text(text, doc.x + 8, doc.y - doc.heightOfString(text, { width: 475 }) - 16 + 8, { width: 475, lineGap: 2 });
  doc.moveDown(0.5);
};

// Title
doc.fontSize(22).fillColor("#000").font("Helvetica-Bold")
   .text("CI Test Report", { align: "center" });
doc.fontSize(10).fillColor("#666").font("Helvetica")
   .text(`Generated: ${new Date().toUTCString()}`, { align: "center" });
doc.moveDown(1);

heading("Test Results");
codeBlock(testReport.slice(0, 3000)); // JUnit XML can be long, truncate safely

heading("Coverage Summary");
codeBlock(coverageText);

heading("Lint Results");
codeBlock(lintReport.slice(0, 3000));

doc.end();
console.log("report.pdf written");