import type { StateCommand } from '@codemirror/state';
import { insertDiagramCode, MERMAID_TEMPLATES, CHARTJS_TEMPLATES } from '../diagram-templates';


export const insertMermaid: StateCommand = insertDiagramCode('mermaid', MERMAID_TEMPLATES[0]!.code);


export const insertChartJs: StateCommand = insertDiagramCode('chart', CHARTJS_TEMPLATES[0]!.code);
export { insertDiagramCode, MERMAID_TEMPLATES, CHARTJS_TEMPLATES };
