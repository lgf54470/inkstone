import { describe, expect, it } from 'vitest';
import { buildMonthGridCells, buildYearGridMonths } from './calendar-grids';

describe('buildMonthGridCells', () => {
    it('aligns the month grid to the week start', () => {
        const cells = buildMonthGridCells(2026, 8, 1);
        expect(cells[0]).toMatchObject({ key: '2026-08-31', day: 31, inMonth: false });
        expect(cells[1]).toMatchObject({ key: '2026-09-01', day: 1, inMonth: true });
        expect(cells.length).toBe(35);
    });

    it('marks the today cell', () => {
        const cells = buildMonthGridCells(2026, 8, 1, '2026-09-02');
        expect(cells.find((cell) => cell.today)?.key).toBe('2026-09-02');
        expect(cells.filter((cell) => cell.inMonth)).toHaveLength(30);
    });

    it('builds a six-row grid when the month needs five weeks plus an offset', () => {
        const cells = buildMonthGridCells(2026, 7, 1);
        expect(cells.length).toBe(42);
        expect(cells[0].key).toBe('2026-07-27');
    });
});

describe('buildYearGridMonths', () => {
    it('produces twelve aligned months', () => {
        const months = buildYearGridMonths(2026, 1);
        expect(months).toHaveLength(12);
        expect(months[0]!.cells[0].key).toBe('2025-12-29');
        expect(months[8]!.cells[1].key).toBe('2026-09-01');
    });
});