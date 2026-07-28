import { useEffect, useMemo, useState } from 'react';
import {
  medicineMasterService,
  type MasterMedicine,
} from '../services/medicineMasterService';

/**
 * Shared, debounced row search for the hosted medicine catalogue.
 *
 * Callers provide stable row ids instead of array positions so an in-flight
 * result can never be applied to the wrong row after a row is removed.
 */
export function useMedicineSuggestions(
  queries: Record<string, string>,
  limit = 12,
  debounceMs = 250
) {
  const [results, setResults] = useState<Record<string, MasterMedicine[]>>({});
  const querySignature = useMemo(
    () => JSON.stringify(
      Object.entries(queries)
        .map(([id, value]) => [id, value.trim()] as const)
        .sort(([left], [right]) => left.localeCompare(right))
    ),
    [queries]
  );

  useEffect(() => {
    const entries = JSON.parse(querySignature) as Array<[string, string]>;
    const searchable = entries.filter(([, value]) => value.length >= 2);
    const activeIds = new Set(entries.map(([id]) => id));

    setResults(current => Object.fromEntries(
      Object.entries(current).filter(([id]) => activeIds.has(id))
    ));

    if (searchable.length === 0) return;

    let active = true;
    const timer = window.setTimeout(() => {
      void Promise.all(searchable.map(async ([id, value]) => {
        try {
          return [id, await medicineMasterService.search(value, limit)] as const;
        } catch {
          return [id, []] as const;
        }
      })).then(rows => {
        if (!active) return;
        setResults(current => ({ ...current, ...Object.fromEntries(rows) }));
      });
    }, debounceMs);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [querySignature, limit, debounceMs]);

  return results;
}
