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

// Global highlight manager to handle ranges from multiple components
interface HighlightRange {
  componentId: string;
  ranges: Range[];
}

class HighlightManager {
  private registeredRanges = new Map<string, HighlightRange[]>();
  private highlightName = 'search-match';

  register(componentId: string, ranges: Range[]) {
    if (!supportsHighlightAPI()) return;

    // Remove existing ranges for this component
    this.unregister(componentId);

    // Add new ranges for this component
    if (ranges.length > 0) {
      const existingRanges = this.registeredRanges.get(this.highlightName) || [];
      const newRanges = [...existingRanges, { componentId, ranges }];
      this.registeredRanges.set(this.highlightName, newRanges);
    }

    // Update the global highlight
    this.updateHighlight();
  }

  unregister(componentId: string) {
    if (!supportsHighlightAPI()) return;

    const existingRanges = this.registeredRanges.get(this.highlightName) || [];
    const filteredRanges = existingRanges.filter(item => item.componentId !== componentId);
    
    if (filteredRanges.length > 0) {
      this.registeredRanges.set(this.highlightName, filteredRanges);
    } else {
      this.registeredRanges.delete(this.highlightName);
    }

    // Update the global highlight
    this.updateHighlight();
  }

  private updateHighlight() {
    const allRanges = this.registeredRanges.get(this.highlightName) || [];
    const flatRanges = allRanges.flatMap(item => item.ranges);

    if (flatRanges.length > 0) {
      const highlight = new Highlight(...flatRanges);
      CSS.highlights.set(this.highlightName, highlight);
    } else {
      CSS.highlights.delete(this.highlightName);
    }
  }

  clear() {
    if (supportsHighlightAPI()) {
      CSS.highlights.delete(this.highlightName);
      this.registeredRanges.clear();
    }
  }
}

// Global instance of the highlight manager
const globalHighlightManager = new HighlightManager();

export const createTextHighlight = (
  element: Element,
  matches: Array<{ start: number; end: number }>,
  componentId: string
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
    globalHighlightManager.register(componentId, ranges);
    return componentId;
  }

  return null;
}

export const clearHighlight = (componentId: string) => {
  globalHighlightManager.unregister(componentId);
}

export const clearAllHighlights = () => {
  globalHighlightManager.clear();
}

// React hook for managing highlights
export const useTextHighlight = (
  elementRef: React.RefObject<Element>,
  matches: Array<{ start: number; end: number }> | undefined,
  componentId: string
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
      const highlightId = createTextHighlight(elementRef.current, matches, componentId);
      activeHighlightRef.current = highlightId;
    }

    // Cleanup function
    return () => {
      if (activeHighlightRef.current) {
        clearHighlight(activeHighlightRef.current);
        activeHighlightRef.current = null;
      }
    };
  }, [elementRef, matches, componentId]);

  // Also cleanup on unmount
  useEffect(() => {
    return () => {
      if (activeHighlightRef.current) {
        clearHighlight(activeHighlightRef.current);
      }
    };
  }, []);
}
