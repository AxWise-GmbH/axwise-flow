import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Combines multiple class names into a single string, merging Tailwind CSS classes properly.
 * Uses clsx for conditional class application and tailwind-merge to handle class conflicts.
 * 
 * @param inputs - Array of class names, objects, or arrays to be combined
 * @returns A string of combined class names
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
