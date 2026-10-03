/**
 * The one place the graph's link degrees are aggregated: a single pass over `links` joined to the notes
 * it can still see, rather than three correlated probes per row of the page (G-01). Both the page and
 * its count read have to use this same pair, or the two disagree about what a degree is.
 */
export const degreeJoin = `
  LEFT JOIN (
    SELECT note_id,
           SUM(is_endpoint) AS degree,
           SUM(is_target) AS in_degree,
           SUM(is_source) AS out_degree
    FROM (
      SELECT l.source_note_id AS note_id, 1 AS is_endpoint, 0 AS is_target, 1 AS is_source
        FROM links l
        JOIN notes adj ON adj.id = l.target_note_id AND adj.user_id = l.user_id
          AND adj.deleted_at IS NULL AND adj.is_archived = 0
        WHERE l.user_id = ? AND l.target_note_id IS NOT NULL
      UNION ALL
      SELECT l.target_note_id AS note_id, 1, 1, 0
        FROM links l
        JOIN notes adj ON adj.id = l.source_note_id AND adj.user_id = l.user_id
          AND adj.deleted_at IS NULL AND adj.is_archived = 0
        WHERE l.user_id = ? AND l.target_note_id IS NOT NULL
    ) GROUP BY note_id
  ) d ON d.note_id = n.id`

export const degreeColumns = `COALESCE(d.degree, 0) AS degree,
  COALESCE(d.in_degree, 0) AS in_degree, COALESCE(d.out_degree, 0) AS out_degree`
