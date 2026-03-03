import { Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';

/**
 * Standard Date Formats for the application (Thai Standard)
 */
export const APP_DATE_FORMAT = 'dd/MM/yy';
export const APP_DATE_TIME_FORMAT = 'dd/MM/yy HH:mm';
export const APP_FULL_DATE_FORMAT = 'dd/MM/yyyy';

/**
 * Safely formats a Firestore Timestamp or a JS Date object into a string.
 * Returns 'N/A' if the input is null, undefined, or not a recognizable date type.
 * @param timestamp The Firestore Timestamp or Date object (or null/undefined).
 * @param formatString The date-fns format string.
 * @returns The formatted date string or 'N/A'.
 */
export function safeFormat(timestamp: Timestamp | Date | null | undefined, formatString: string = APP_DATE_FORMAT): string {
  if (!timestamp) {
    return 'N/A';
  }

  try {
    // Firestore Timestamps have a toDate() method.
    if (timestamp instanceof Timestamp) {
      return format(timestamp.toDate(), formatString);
    }
    
    // If it's already a Date object and it's valid.
    if (timestamp instanceof Date && !isNaN(timestamp.getTime())) {
        return format(timestamp, formatString);
    }
    
    // If it's a string, try to parse it
    if (typeof timestamp === 'string') {
      const d = new Date(timestamp);
      if (!isNaN(d.getTime())) return format(d, formatString);
    }
  } catch (error) {
    console.error("Error formatting timestamp:", error);
    return 'N/A';
  }

  return 'N/A';
}
