// FEA-A1-3 wires the search through the worker proxy; this module holds the
// provider identity and the upstream sources it aggregates.
export const GDS_PROVIDER_ID = 'gds'

// The aggregate upstream serves several catalogues; rank order is the merge
// order and the de-dup preference when two sources return the same song.
export const GDS_SOURCES = ['netease', 'kuwo', 'migu', 'qq', 'bilibili'] as const
