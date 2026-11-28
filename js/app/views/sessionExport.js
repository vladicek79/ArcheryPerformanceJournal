// Exporting a session's report (sessionReport.js) or a gear setup's (equipmentReport.js): as a
// downloaded .html file, or printed from this page, where the browser's print dialog also saves it
// as a PDF.
import { sessionReportHtml, sessionReportBody, reportFileName, REPORT_CSS } from '../sessionReport.js';
import { equipmentReportHtml, equipmentReportBody, equipmentFileName, EQUIPMENT_CSS } from '../equipmentReport.js';
import { aiExportDocument, aiExportFileName } from '../aiExport.js';
import { shareOrDownload } from '../../backup/backup.js';
import { versionLabel } from '../../config.js';

/**
 * Share or download sessions as JSON for an AI agent (aiExport.js): one session, or every session
 * when `sessions` is omitted. Returns 'shared', 'downloaded' or 'cancelled'.
 */
export function exportForAI(repo, chosen = null) {
  const sessions = chosen || repo.list('sessions');
  const doc = aiExportDocument(
    { sessions, setups: repo.list('setups'), competitions: repo.list('competitions'), settings: repo.getSettings() },
    { appVersion: versionLabel() },
  );
  const name = aiExportFileName(sessions, { single: !!chosen });
  return shareOrDownload(new File([JSON.stringify(doc, null, 1)], name, { type: 'application/json' }), name);
}

/** Download an HTML document as a file. */
function downloadHtml(html, name) {
  const file = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Download the session's report as a standalone .html file. */
export const downloadReport = (ss, opts) => downloadHtml(sessionReportHtml(ss, opts), reportFileName(ss));

/** Download a gear setup's report as a standalone .html file. */
export function downloadEquipmentReport(setup, opts = {}) {
  const exportedAt = opts.exportedAt || new Date();
  downloadHtml(equipmentReportHtml(setup, { ...opts, exportedAt }), equipmentFileName(setup, exportedAt));
}

// while printing only the report shows: the app is hidden, the page is white and grows with the
// report. The report's sheets are A4 pages themselves (their own margins), so the paper has none.
const PRINT_CSS = `
#print-root{display:none}
@media print{
  @page{size:A4;margin:0}
  html,body{background:#fff!important;height:auto!important;overflow:visible!important}
  body>*:not(#print-root){display:none!important}
  #print-root{display:block}
}`;

// The app's Content-Security-Policy (style-src 'self') refuses <style> elements and style
// attributes, so the reports' styles join the page as a constructed stylesheet, made once.
let sheet = null;
function reportSheet() {
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(PRINT_CSS + REPORT_CSS + EQUIPMENT_CSS);
  }
  return sheet;
}

/** Print a report body (the print dialog offers "Save as PDF"); `name` suggests the PDF's file name. */
function printBody(body, name) {
  document.getElementById('print-root')?.remove();
  const css = reportSheet();
  if (!document.adoptedStyleSheets.includes(css)) document.adoptedStyleSheets = [...document.adoptedStyleSheets, css];
  const root = document.createElement('div');
  root.id = 'print-root';
  root.innerHTML = body;
  document.body.append(root);
  const title = document.title;
  // the PDF's suggested file name comes from the page title
  document.title = name.replace(/\.html$/, '');
  const done = () => {
    document.title = title;
    root.remove();
  };
  window.addEventListener('afterprint', done, { once: true });
  // let the report lay out before the dialog takes its snapshot
  requestAnimationFrame(() => setTimeout(() => window.print(), 50));
}

/** Print the session's report. The report stays hidden on screen. */
export const printReport = (ss, opts) => printBody(sessionReportBody(ss, opts), reportFileName(ss));

/** Print a gear setup's report. */
export function printEquipmentReport(setup, opts = {}) {
  const exportedAt = opts.exportedAt || new Date();
  printBody(equipmentReportBody(setup, { ...opts, exportedAt }), equipmentFileName(setup, exportedAt));
}
