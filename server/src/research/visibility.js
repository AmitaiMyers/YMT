// Companies created by research appear in the regular company lists only after an owner accepts one of their
// opportunities; until then they live in the review queue. Manually created companies are always listed.

/** SQL condition for a companies table aliased as `alias`. */
export function visibleCompanySql(alias) {
  if (!/^[a-z]+$/.test(alias)) throw new Error(`Invalid SQL alias: ${alias}`);
  return `(${alias}.origin = 'manual' OR EXISTS (SELECT 1 FROM opportunities vo WHERE vo.company_id = ${alias}.id AND vo.status = 'accepted'))`;
}
