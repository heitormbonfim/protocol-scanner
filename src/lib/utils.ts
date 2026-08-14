import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * The shadcn/ui class helper: merges conditional classes, with later Tailwind
 * utilities correctly overriding earlier ones in the same group.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
