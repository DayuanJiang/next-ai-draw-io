import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Efficiently converts a potentially incomplete XML string to a legal XML string
 * by closing any open tags properly.
 * 
 * @param xmlString The potentially incomplete XML string
 * @returns A legal XML string with properly closed tags
 */
export function convertToLegalXml(xmlString: string): string {
  const stack: string[] = [];
  let result = '';
  let tagStart = -1;

  for (let i = 0; i < xmlString.length; i++) {
    const char = xmlString[i];
    result += char;

    if (char === '<' && tagStart === -1) {
      // Start of a new tag
      tagStart = i;
    } else if (char === '>' && tagStart !== -1) {
      // End of a tag
      const tagContent = xmlString.substring(tagStart + 1, i);

      if (tagContent.startsWith('/')) {
        // Closing tag
        const tagName = tagContent.substring(1).trim().split(/\s+/)[0];
        if (stack.length && stack[stack.length - 1] === tagName) {
          stack.pop();
        }
      } else if (!tagContent.endsWith('/') && !tagContent.startsWith('?') && !tagContent.startsWith('!')) {
        // Opening tag (not self-closing, processing instruction, or comment)
        const tagName = tagContent.trim().split(/\s+/)[0];
        stack.push(tagName);
      }

      tagStart = -1;
    }
  }

  // If we have an incomplete tag at the end, don't include it in the result
  if (tagStart !== -1) {
    result = result.substring(0, tagStart);
  }

  // Close all remaining open tags
  for (let j = stack.length - 1; j >= 0; j--) {
    result += `</${stack[j]}>`;
  }

  return result;
}


