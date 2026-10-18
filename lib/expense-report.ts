import PDFDocument from "pdfkit";
import * as fontkit from "fontkit";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { CalendarExpense } from "./expense-calendar";
import { filterReportExpenses, validateReportRange, type ReportFilter } from "./expense-filters";

const dayFormatter = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
const timeFormatter = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Jakarta" });
const amountFormatter = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
const blue = "#1769aa";
const ink = "#171a20";
const muted = "#68707d";
const line = "#dfe3e8";
const fontRoot = resolve(process.cwd(), "node_modules/@fontsource");
const latinFont = resolve(fontRoot, "noto-sans/files/noto-sans-latin-400-normal.woff");
const latinGlyphs = fontkit.openSync(latinFont) as fontkit.Font;
const fallbackGroups = [
  ["noto-sans", "noto-sans-"],
  ["noto-emoji", "noto-emoji-"],
  ["noto-sans-sc", "noto-sans-sc-"],
] as const;
const glyphFonts = new Map<number, string>();
let fallbackFonts: Array<{ path: string; font: fontkit.Font }> | undefined;

function fontFor(character: string): string {
  const codePoint = character.codePointAt(0)!;
  if (latinGlyphs.hasGlyphForCodePoint(codePoint)) return latinFont;
  const cached = glyphFonts.get(codePoint);
  if (cached) return cached;
  fallbackFonts ??= fallbackGroups.flatMap(([packageName, prefix]) => {
    const directory = resolve(fontRoot, packageName, "files");
    return readdirSync(directory).filter((name) => name.startsWith(prefix)
      && name.endsWith("-400-normal.woff")).map((name) => {
      const path = resolve(directory, name);
      return { path, font: fontkit.openSync(path) as fontkit.Font };
    });
  });
  const match = fallbackFonts.find(({ font }) => {
    try { return font.hasGlyphForCodePoint(codePoint); } catch { return false; }
  });
  if (match) glyphFonts.set(codePoint, match.path);
  return match?.path ?? latinFont;
}

type TextLine = Array<{ character: string; font: string; width: number }>;

function layoutText(document: PDFKit.PDFDocument, text: string, width: number, size: number): TextLine[] {
  const lines: TextLine[] = [[]];
  let lineWidth = 0;
  for (const token of text.match(/\n|[^\S\n]+|[^\s]+/gu) ?? []) {
    if (token === "\n") { lines.push([]); lineWidth = 0; continue; }
    const glyphs = [...token].map((character) => {
      const font = fontFor(character);
      return { character, font, width: document.font(font).fontSize(size).widthOfString(character) };
    });
    const tokenWidth = glyphs.reduce((sum, glyph) => sum + glyph.width, 0);
    if (lineWidth + tokenWidth > width && tokenWidth <= width && lines.at(-1)!.length) {
      lines.push([]);
      lineWidth = 0;
    }
    for (const glyph of glyphs) {
      if (lineWidth + glyph.width > width && lines.at(-1)!.length) {
        lines.push([]);
        lineWidth = 0;
      }
      lines.at(-1)!.push(glyph);
      lineWidth += glyph.width;
    }
  }
  return lines;
}

function drawTextLines(document: PDFKit.PDFDocument, lines: TextLine[], x: number, y: number, size: number) {
  lines.forEach((line, index) => {
    let offset = 0;
    for (const glyph of line) {
      document.font(glyph.font).fontSize(size).text(glyph.character, x + offset, y + index * 14, { lineBreak: false });
      offset += glyph.width;
    }
  });
}

function labelForDate(value: string): string {
  return dayFormatter.format(new Date(`${value}T00:00:00.000Z`));
}

function periodLabel(start: string, end: string): string {
  return start || end ? `${start ? labelForDate(start) : "All dates"} - ${end ? labelForDate(end) : "Today"}` : "All dates";
}

function amount(cents: number): string {
  return `IDR ${amountFormatter.format(cents / 100)}`;
}

export function buildExpensePdf(expenses: readonly CalendarExpense[], filter: ReportFilter): Promise<Buffer> {
  if (!validateReportRange(filter.start, filter.end)) throw new Error("Choose a valid date range.");
  const records = filterReportExpenses(expenses, filter).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const document = new PDFDocument({ size: "A4", layout: "landscape", margin: 38, bufferPages: true, info: { Title: "Expense Tracker - Expense report" } });
  const chunks: Buffer[] = [];
  document.on("data", (chunk: Buffer) => chunks.push(chunk));
  const width = document.page.width - 76;
  const period = periodLabel(filter.start, filter.end);

  function rule(y: number) {
    document.strokeColor(line).lineWidth(1).moveTo(38, y).lineTo(document.page.width - 38, y).stroke();
  }
  function tableHeader(y: number) {
    document.rect(38, y, width, 28).fill("#f7f8fa");
    document.fillColor(muted).font("Helvetica-Bold").fontSize(9);
    document.text("NO.", 50, y + 9).text("DATE / UTC+7", 92, y + 9)
      .text("CATEGORY", 234, y + 9).text("DESCRIPTION", 370, y + 9)
      .text("AMOUNT", 657, y + 9, { width: 134, align: "right" });
    return y + 28;
  }
  function footer() {
    const bottom = document.page.height - 52;
    rule(bottom - 11);
    document.fillColor(muted).font("Helvetica").fontSize(8)
      .text("Expense Tracker / Expense report", 38, bottom)
      .text(`UTC+7  |  IDR  |  ${period}`, 390, bottom, { width: 400, align: "right" });
  }

  document.fillColor(blue).font("Helvetica-Bold").fontSize(10).text("EXPENSE TRACKER / DAILY EXPENSES", 38, 38);
  document.fillColor(ink).fontSize(30).text("Expense report", 38, 61);
  document.fillColor(muted).font("Helvetica").fontSize(10).text(`${period}  |  UTC+7  |  IDR`, 38, 103);
  drawTextLines(document, layoutText(document, filter.query.trim() ? `Search: ${filter.query.trim()}` : "All descriptions and categories", width - 10, 10).slice(0, 2), 38, 120, 10);
  rule(147);
  const total = records.reduce((sum, record) => sum + record.amountCents, 0);
  const metrics = [
    ["TOTAL SPEND", amount(total)],
    ["TRANSACTIONS", String(records.length)],
    ["CATEGORIES", String(new Set(records.map((record) => record.category)).size)],
  ];
  metrics.forEach(([label, value], index) => {
    const x = 50 + index * (width / 3);
    document.fillColor(muted).font("Helvetica-Bold").fontSize(9).text(label, x, 166);
    document.fillColor(index === 0 ? blue : ink).fontSize(21).text(value, x, 188, { width: width / 3 - 20 });
  });
  rule(230);
  document.fillColor(ink).font("Helvetica-Bold").fontSize(14).text("Transaction details", 38, 248);
  document.fillColor(muted).font("Helvetica").fontSize(9).text(`${records.length} records`, 650, 251, { width: 140, align: "right" });
  let y = tableHeader(278);
  for (const [index, record] of records.entries()) {
    const descriptionLines = layoutText(document, record.description, 245, 10);
    let cursor = 0;
    while (cursor < descriptionLines.length) {
      if (y + 43 > document.page.height - 75) {
        footer();
        document.addPage();
        document.fillColor(ink).font("Helvetica-Bold").fontSize(15).text("Transaction details / continued", 38, 40);
        y = tableHeader(72);
      }
      const count = Math.min(descriptionLines.length - cursor, Math.max(1, Math.floor((document.page.height - 75 - y - 18) / 14)));
      const rowHeight = Math.max(43, count * 14 + 18);
      if (cursor === 0) {
        document.fillColor(muted).font("Helvetica").fontSize(9).text(String(index + 1).padStart(2, "0"), 50, y + 11);
        document.fillColor(ink).font("Helvetica-Bold").fontSize(10)
          .text(dayFormatter.format(new Date(record.date)), 92, y + 8, { width: 130 });
        document.fillColor(muted).font("Helvetica").fontSize(8)
          .text(/^\d{4}-\d{2}-\d{2}$/.test(record.date) ? "00:00" : timeFormatter.format(new Date(record.date)), 92, y + 24);
        document.fillColor(blue).font("Helvetica-Bold").fontSize(9).text(record.category, 234, y + 11, { width: 122 });
        document.fillColor(ink).font("Helvetica-Bold").fontSize(10)
          .text(amount(record.amountCents), 657, y + 11, { width: 134, align: "right" });
      }
      document.fillColor(ink);
      drawTextLines(document, descriptionLines.slice(cursor, cursor + count), 370, y + 10, 10);
      cursor += count;
      y += rowHeight;
      rule(y);
    }
  }
  if (!records.length) {
    document.fillColor(muted).font("Helvetica").fontSize(11).text("No expenses match these filters.", 50, y + 20);
  }
  footer();
  document.end();
  return new Promise((resolve, reject) => {
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });
}
