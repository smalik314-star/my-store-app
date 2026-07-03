/**
 * Safely converts any timestamp/date format (Firestore Timestamp, serialized MockTimestamp, Date, or ISO string)
 * to a standard JavaScript Date object.
 */
export function toJsDate(value: any): Date {
  if (!value) return new Date();
  
  // 1. If it's already a JS Date
  if (value instanceof Date) {
    return value;
  }
  
  // 2. If it's a Firestore Timestamp or has a toDate method
  if (typeof value.toDate === 'function') {
    return value.toDate();
  }
  
  // 3. If it's serialized from our mockDb (e.g., { date: "..." })
  if (value && typeof value === 'object' && 'date' in value) {
    const parsed = new Date(value.date);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  // 4. If it's an object with seconds/nanoseconds (raw Firestore representation or similar)
  if (value && typeof value === 'object' && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000);
  }
  
  // 5. If it's a string, number or anything parseable by the Date constructor
  const parsed = new Date(value);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }
  
  // Fallback to current date
  return new Date();
}

/**
 * Formats a timestamp/date nicely as a string
 */
export function formatDate(value: any, options?: Intl.DateTimeFormatOptions): string {
  const date = toJsDate(value);
  return date.toLocaleDateString('en-US', options || { month: 'short', day: 'numeric', year: 'numeric' });
}
