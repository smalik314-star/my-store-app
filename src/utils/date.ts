/**
 * Safely converts any timestamp/date format (Firestore Timestamp, serialized MockTimestamp, Date, or ISO string)
 * to a standard JavaScript Date object.
 * 
 * Returns `null` for invalid/unparseable values so callers can distinguish
 * a real date from a fallback (avoids silently treating bad dates as "now").
 */
export function toJsDate(value: any): Date | null {
  if (!value) return null;
  
  // 1. If it's already a JS Date
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  
  // 2. If it's a Firestore Timestamp or has a toDate method
  if (typeof value.toDate === 'function') {
    try {
      const d = value.toDate();
      return d instanceof Date && !isNaN(d.getTime()) ? d : null;
    } catch (e) {
      return null;
    }
  }
  
  // 3. If it's serialized from our mockDb (e.g., { date: "..." })
  if (value && typeof value === 'object' && 'date' in value) {
    const parsed = new Date(value.date);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
    return null;
  }

  // 4. If it's an object with seconds/nanoseconds (raw Firestore representation or similar)
  if (value && typeof value === 'object' && typeof value.seconds === 'number') {
    const parsed = new Date(value.seconds * 1000);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  
  // 5. If it's a string, number or anything parseable by the Date constructor
  const parsed = new Date(value);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }
  
  // Invalid — return null instead of silently using today
  return null;
}

/**
 * Convenience wrapper: returns a Date if valid, otherwise throws.
 * Use when you know the value must be valid (e.g., sorting).
 */
export function toJsDateOrThrow(value: any, fallback?: Date): Date {
  const d = toJsDate(value);
  if (d) return d;
  if (fallback) return fallback;
  throw new Error('Invalid date value');
}

/**
 * Checks whether a value represents a valid date.
 */
export function isValidDate(value: any): boolean {
  return toJsDate(value) !== null;
}

/**
 * Formats a timestamp/date nicely as a string.
 * Returns the provided fallback string (default '—') for invalid dates.
 */
export function formatDate(value: any, options?: Intl.DateTimeFormatOptions, fallback: string = '—'): string {
  const date = toJsDate(value);
  if (!date) return fallback;
  return date.toLocaleDateString('en-US', options || { month: 'short', day: 'numeric', year: 'numeric' });
}