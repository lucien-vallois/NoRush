import { csvCell, csvRow, csvText } from './csv';

describe('CSV cells', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvText('FK-01, east pad')).toBe('"FK-01, east pad"');
    expect(csvText('the "low" limit')).toBe('"the ""low"" limit"');
    expect(csvText('line 1\nline 2')).toBe('"line 1\nline 2"');
    expect(csvText('plain')).toBe('plain');
  });

  it('never lets a spreadsheet read a cell as a formula', () => {
    expect(csvText('=HYPERLINK("http://x")')).toBe(
      `"'=HYPERLINK(""http://x"")"`,
    );
    expect(csvText('+1')).toBe("'+1");
    expect(csvText('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('writes numbers, dates and objects in a stable form', () => {
    expect(csvCell(-0.5)).toBe('-0.5'); // numbers are numbers, not text
    expect(csvCell(NaN)).toBe('');
    expect(csvCell(new Date('2026-11-12T07:00:00Z'))).toBe(
      '2026-11-12T07:00:00.000Z',
    );
    expect(csvCell({ oil: 1.2 })).toBe('"{""oil"":1.2}"');
    expect(csvRow(['FK-01', 4.2, null, true])).toBe('FK-01,4.2,,true');
  });
});
