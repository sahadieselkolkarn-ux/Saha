import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Recursively removes undefined values from an object or array.
 * This is useful for preparing data to be sent to Firestore, which
 * does not allow `undefined` field values.
 * 
 * Updated to safely ignore Firestore internal objects like FieldValues and Timestamps.
 * @param data The data to sanitize.
 * @returns A new object or array with all `undefined` values removed.
 */
export function sanitizeForFirestore(data: any): any {
  if (Array.isArray(data)) {
    return data
      .map(v => sanitizeForFirestore(v))
      .filter(v => v !== undefined);
  }
  
  if (data !== null && typeof data === 'object') {
    // Skip sanitization for Date, Timestamp, or other non-plain objects (like Firestore FieldValues)
    const isPlainObject = Object.getPrototypeOf(data) === Object.prototype;
    const isTimestamp = typeof data.toDate === 'function';
    
    if (!isPlainObject || isTimestamp || data instanceof Date) {
      return data;
    }

    return Object.entries(data).reduce((acc, [key, value]) => {
      if (value !== undefined) {
        const sanitizedValue = sanitizeForFirestore(value);
        if (sanitizedValue !== undefined) {
          acc[key] = sanitizedValue;
        }
      }
      return acc;
    }, {} as {[key: string]: any});
  }
  
  return data;
}
