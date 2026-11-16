import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import { createCumulativeExcel } from './cumulativeExcel';
import { accumulate, type CumulativeExport, type SourceTournament } from './cumulativeScoring';

const sources: SourceTournament[] = [
  { name: 'Mixed S1', gameCount: 2, rows: [
    { first_name: 'Ada', last_name: 'Player', gender: 'Female', club: 'Club', scores: [100, 0] },
    { first_name: 'Bob', last_name: 'Player', gender: 'Male', scores: [null, 200] },
  ] },
  { name: 'Mixed S2', gameCount: 3, rows: [
    { first_name: 'Ada', last_name: 'Player', gender: 'Female', scores: [200, 300, 250] },
    { first_name: 'Bob', last_name: 'Player', gender: 'Male', scores: [null, null, 300] },
  ] },
];
const data: CumulativeExport = {
  kind: 'btm-cumulative-scores', version: 3, tournaments: sources.map((s) => s.name),
  slots: ['S1 G1', 'S1 G2', 'S2 G1', 'S2 G2', 'S2 G3'],
  men: accumulate(sources, 'men'), women: accumulate(sources, 'women'),
};
const groups = sources.map(({ name, gameCount }) => ({ name, count: gameCount }));

test('exports first N games across tournaments with selected-game summaries', async () => {
  const buffer = await createCumulativeExcel(data, groups, 3);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet('Cumulative result')!;
  assert.equal(sheet.getCell('E1').value, 'Mixed S1');
  assert.equal(sheet.getCell('I1').value, 'Mixed S2');
  assert.equal(sheet.getCell('L1').value, 'Overall');
  assert.deepEqual(sheet.getRow(2).values, [,
    'First Name', 'Last Name', 'Gender', 'Club', 'G 1', 'G 2', 'Subtotal', 'Avg',
    'G 1', 'Subtotal', 'Avg', 'Total', 'Avg',
  ]);
  assert.deepEqual(sheet.getRow(3).values, [, 'Bob', 'Player', 'Male', '', , 200, 200, 200, , , , 200, 200]);
  assert.deepEqual(sheet.getRow(4).values, [, 'Ada', 'Player', 'Female', 'Club', 100, 0, 100, 50, 200, 200, 200, 300, 100]);
  assert.equal(sheet.getCell('G4').font.bold, true);
  assert.equal(sheet.getCell('H4').numFmt, '0.0');
  assert.equal(data.women[0].total, 850);
});

test('exports all games or a partial first tournament and rejects invalid counts', async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await createCumulativeExcel(data, groups, 1));
  const sheet = workbook.getWorksheet('Cumulative result')!;
  assert.equal(sheet.getCell('H1').value, 'Overall');
  assert.equal(sheet.getCell('F3').value, null);
  assert.equal(sheet.getCell('F4').value, 100);
  await workbook.xlsx.load(await createCumulativeExcel(data, groups, 5));
  assert.equal(workbook.getWorksheet('Cumulative result')!.getCell('N4').value, 850);
  await assert.rejects(createCumulativeExcel(data, groups, 0), /Invalid number/);
  await assert.rejects(createCumulativeExcel(data, groups, 6), /Invalid number/);
  await assert.rejects(createCumulativeExcel(data, groups, 1.5), /Invalid number/);
  await assert.rejects(createCumulativeExcel(data, [{ name: 'Wrong', count: 1 }], 1), /Invalid number/);
});
