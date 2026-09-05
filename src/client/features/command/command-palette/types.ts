import type { FuzzyMatch } from '../../../lib/fuzzy';

export interface Item {
    id: string;
    kind: 'command' | 'note' | 'tag' | 'folder';
    label: string;
    detail?: string;
    icon: React.ReactNode;
    combo?: string;
    group: string;
    score: number;
    match?: FuzzyMatch;
    run: () => void;
}
