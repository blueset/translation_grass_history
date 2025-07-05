import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { useEffect, useRef } from 'react'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Type declarations for CSS Custom Highlight API
declare global {
  interface CSS {
    highlights: Map<string, Highlight>;
  }
}

// CSS Custom Highlight API utilities
export const supportsHighlightAPI = () => {
  return typeof CSS !== 'undefined' && 'highlights' in CSS;
}

export const createSimpleTextHighlight = (
  text: string,
  matches: Array<{ start: number; end: number }>,
  highlightName: string = 'search-match'
) => {
  if (!supportsHighlightAPI() || !matches.length) {
    return null;
  }

  // Create a temporary div to hold our text
  const tempDiv = document.createElement('div');
  tempDiv.textContent = text;
  document.body.appendChild(tempDiv);

  try {
    const ranges: Range[] = [];

    // Get the text node
    const textNode = tempDiv.firstChild;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
      return null;
    }

    // Create ranges for each match
    matches.forEach(({ start, end }) => {
      const range = document.createRange();
      range.setStart(textNode, start);
      range.setEnd(textNode, end + 1); // end is inclusive in match, exclusive in range
      ranges.push(range);
    });

    if (ranges.length > 0) {
      const highlight = new Highlight(...ranges);
      CSS.highlights.set(highlightName, highlight);
      return highlightName;
    }

    return null;
  } finally {
    document.body.removeChild(tempDiv);
  }
}

export const createTextHighlight = (
  element: Element,
  matches: Array<{ start: number; end: number }>,
  highlightName: string = 'search-match'
) => {
  if (!supportsHighlightAPI() || !matches.length) {
    return null;
  }

  const ranges: Range[] = [];
  
  // Create a tree walker to find all text nodes
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    null
  );

  let textOffset = 0;
  const textNodes: { node: Text; offset: number; length: number }[] = [];

  // Collect all text nodes and their positions
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE) {
      const textNode = node as Text;
      const length = textNode.textContent?.length || 0;
      if (length > 0) {
        textNodes.push({ node: textNode, offset: textOffset, length });
        textOffset += length;
      }
    }
  }

  // Create ranges for each match
  matches.forEach(({ start, end }) => {
    const rangeStart = start;
    const rangeEnd = end + 1; // end is inclusive in the match, but Range.setEnd is exclusive

    // Find text nodes that contain our range
    for (let i = 0; i < textNodes.length; i++) {
      const { node: textNode, offset, length } = textNodes[i];
      const nodeEnd = offset + length;

      // Skip nodes that are completely before our range
      if (nodeEnd <= rangeStart) continue;
      
      // Skip nodes that are completely after our range
      if (offset >= rangeEnd) break;

      // This node intersects with our range
      const range = document.createRange();
      
      // Calculate start position within this node
      const startInNode = Math.max(0, rangeStart - offset);
      const endInNode = Math.min(length, rangeEnd - offset);
      
      range.setStart(textNode, startInNode);
      range.setEnd(textNode, endInNode);
      ranges.push(range);
    }
  });

  if (ranges.length > 0) {
    const highlight = new Highlight(...ranges);
    CSS.highlights.set(highlightName, highlight);
    return highlightName;
  }

  return null;
}

export const clearHighlight = (highlightName: string = 'search-match') => {
  if (supportsHighlightAPI()) {
    CSS.highlights.delete(highlightName);
  }
}

// React hook for managing highlights
export const useTextHighlight = (
  elementRef: React.RefObject<Element>,
  matches: Array<{ start: number; end: number }> | undefined,
  highlightName: string = 'search-match'
) => {
  const activeHighlightRef = useRef<string | null>(null);

  useEffect(() => {
    // Clear previous highlight
    if (activeHighlightRef.current) {
      clearHighlight(activeHighlightRef.current);
      activeHighlightRef.current = null;
    }

    // Apply new highlight if we have matches and the element is available
    if (elementRef.current && matches && matches.length > 0) {
      const highlightId = createTextHighlight(elementRef.current, matches, highlightName);
      activeHighlightRef.current = highlightId;
    }

    // Cleanup function
    return () => {
      if (activeHighlightRef.current) {
        clearHighlight(activeHighlightRef.current);
        activeHighlightRef.current = null;
      }
    };
  }, [elementRef, matches, highlightName]);

  // Also cleanup on unmount
  useEffect(() => {
    return () => {
      if (activeHighlightRef.current) {
        clearHighlight(activeHighlightRef.current);
      }
    };
  }, []);
}
