import { beforeEach, describe, expect, it } from 'vitest';
import { dateKey, rollingWindowKey } from '../../lib/time';
import { useUi } from '../../store/ui';
import { useGapIndicatorStore } from './use-gap-indicator';

const FRESH_STATE = {
    latestEditKey: null as string | null,
    gap: null as { days: number; ahead: boolean } | null,
    lastGap: null as { days: number; ahead: boolean } | null,
    peekRange: null as { start: string; end: string } | null,
    prevWindow: null as { start: string; end: string } | null,
};

const WINDOW = { start: '2026-08-24', end: '2026-09-02' };

beforeEach(() => {
    useGapIndicatorStore.setState(FRESH_STATE);
    useUi.setState({ dateFilter: null, relativeFilter: null });
});

describe('useGapIndicatorStore', () => {
    it('reports the lag gap and peeks over the whole gap interval with a fixed-range restore', () => {
        const store = useGapIndicatorStore.getState();
        store.setGap('2026-08-12', WINDOW);
        expect(useGapIndicatorStore.getState().gap).toEqual({ days: 12, ahead: false });

        useUi.setState({ dateFilter: WINDOW });
        const expanded = useGapIndicatorStore.getState().engagePeek();
        expect(expanded).toEqual({ start: '2026-08-12', end: '2026-09-02' });
        expect(useGapIndicatorStore.getState().peekRange).toEqual(expanded);
        expect(useUi.getState().dateFilter).toEqual(expanded);

        // While peeking, the observed window is the expanded range, so the live gap goes quiet but the last one is kept.
        useGapIndicatorStore.getState().setGap('2026-08-12', WINDOW);
        expect(useGapIndicatorStore.getState().gap).toBeNull();
        expect(useGapIndicatorStore.getState().lastGap).toEqual({ days: 12, ahead: false });

        useGapIndicatorStore.getState().releasePeek();
        expect(useGapIndicatorStore.getState().peekRange).toBeNull();
        expect(useUi.getState().dateFilter).toEqual(WINDOW);
        expect(useGapIndicatorStore.getState().gap).toEqual({ days: 12, ahead: false });
    });

    it('pulls the window end toward an edit ahead of it (clock skew / restored sync)', () => {
        useGapIndicatorStore.getState().setGap('2026-09-08', WINDOW);
        expect(useGapIndicatorStore.getState().gap).toEqual({ days: 6, ahead: true });
        useUi.setState({ dateFilter: WINDOW });
        expect(useGapIndicatorStore.getState().engagePeek()).toEqual({ start: '2026-08-24', end: '2026-09-08' });
    });

    it('restores a rolling window by re-materializing it after a peek', () => {
        useGapIndicatorStore.getState().setGap('2026-08-12', WINDOW);
        useUi.setState({ dateFilter: WINDOW, relativeFilter: { days: 10, direction: 'today' } });
        useGapIndicatorStore.getState().engagePeek();
        useGapIndicatorStore.getState().releasePeek();
        // The rolling window is re-materialized from the anchor (today), not the pre-peek snapshot.
        expect(useUi.getState().dateFilter).toEqual(rollingWindowKey(10, dateKey(new Date())));
    });

    it('does not peek when the edit is inside the window', () => {
        useGapIndicatorStore.getState().setGap('2026-08-30', WINDOW);
        expect(useGapIndicatorStore.getState().gap).toBeNull();
        expect(useGapIndicatorStore.getState().engagePeek()).toBeNull();
    });
});