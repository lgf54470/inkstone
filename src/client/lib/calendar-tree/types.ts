// Shared shape types for the virtual calendar/todo trees. Kept in their own
// module (instead of periods.ts) so ids.ts can import them without creating a
// module cycle: ids.ts holds the runtime id helpers that periods.ts consumes.
export type CalendarPeriod =
    | { kind: 'root' }
    | { kind: 'year'; year: number }
    | { kind: 'quarter'; year: number; quarter: number }
    | { kind: 'month'; year: number; month: number }
    | { kind: 'week'; year: number; month: number; week: number }

export interface CalendarNode {
    id: string
    name: string
    depth: number
    count: number
    children: CalendarNode[]
}