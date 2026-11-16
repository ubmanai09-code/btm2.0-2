import ExcelJS from 'exceljs';
import type { CumulativeExport } from './cumulativeScoring';

export type CumulativeGameGroup = { name: string; count: number };

export async function createCumulativeExcel(data: CumulativeExport, groups: CumulativeGameGroup[], gameCount: number) {
  if (!Number.isInteger(gameCount) || gameCount < 1 || gameCount > data.slots.length ||
      groups.some((group) => !Number.isInteger(group.count) || group.count < 1) ||
      groups.reduce((sum, group) => sum + group.count, 0) !== data.slots.length) {
    throw new Error('Invalid number of games or tournament groups');
  }

  let remaining = gameCount;
  const included = groups.flatMap((group) => {
    const count = Math.min(group.count, remaining);
    remaining -= count;
    return count > 0 ? [{ ...group, count }] : [];
  });
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Cumulative result', {
    views: [{ state: 'frozen', xSplit: 4, ySplit: 2 }],
  });
  const headers = ['First Name', 'Last Name', 'Gender', 'Club'];
  const widths = [20, 20, 12, 20];
  for (const group of included) {
    headers.push(...Array.from({ length: group.count }, (_, i) => `G ${i + 1}`), 'Subtotal', 'Avg');
    widths.push(...Array.from({ length: group.count }, () => 10), 12, 10);
  }
  headers.push('Total', 'Avg');
  widths.push(12, 10);
  sheet.columns = widths.map((width) => ({ width }));
  sheet.getRow(2).values = headers;

  let column = 5;
  for (const group of included) {
    sheet.mergeCells(1, column, 1, column + group.count + 1);
    sheet.getCell(1, column).value = group.name;
    column += group.count + 2;
  }
  sheet.mergeCells(1, column, 1, column + 1);
  sheet.getCell(1, column).value = 'Overall';
  for (const row of [sheet.getRow(1), sheet.getRow(2)]) {
    row.height = 22;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7F1EC' } };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF9CA3AF' } } };
    });
  }

  for (const player of [...data.men, ...data.women]) {
    const values: (string | number | null)[] = [player.first_name, player.last_name, player.gender, player.club];
    let offset = 0;
    const selectedScores: number[] = [];
    for (const group of included) {
      const scores = Array.from({ length: group.count }, (_, i) => player.scores[offset + i] ?? null);
      const played = scores.filter((score): score is number => score !== null);
      selectedScores.push(...played);
      const subtotal = played.reduce((sum, score) => sum + score, 0);
      values.push(...scores, played.length ? subtotal : null, played.length ? subtotal / played.length : null);
      offset += group.count;
    }
    const total = selectedScores.reduce((sum, score) => sum + score, 0);
    values.push(selectedScores.length ? total : null, selectedScores.length ? total / selectedScores.length : null);
    const row = sheet.addRow(values);
    row.eachCell((cell, index) => {
      if (index > 4) cell.alignment = { horizontal: 'right' };
    });
    let summaryColumn = 5;
    for (const group of included) {
      summaryColumn += group.count;
      row.getCell(summaryColumn).font = { bold: true };
      row.getCell(summaryColumn + 1).font = { bold: true };
      row.getCell(summaryColumn + 1).numFmt = '0.0';
      summaryColumn += 2;
    }
    row.getCell(summaryColumn).font = { bold: true };
    row.getCell(summaryColumn + 1).font = { bold: true };
    row.getCell(summaryColumn + 1).numFmt = '0.0';
  }
  sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: headers.length } };
  return workbook.xlsx.writeBuffer();
}
