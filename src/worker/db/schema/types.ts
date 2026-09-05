export interface SchemaMigration {
  version: number
  statements: readonly string[]
  skipIfColumnExists?: { table: string; column: string }
}
