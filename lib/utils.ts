import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import * as pako from 'pako';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format XML string with proper indentation and line breaks
 * @param xml - The XML string to format
 * @param indent - The indentation string (default: '  ')
 * @returns Formatted XML string
 */
export function formatXML(xml: string, indent: string = '  '): string {
  let formatted = '';
  let pad = 0;

  // Remove existing whitespace between tags
  xml = xml.replace(/>\s*</g, '><').trim();

  // Split on tags
  const tags = xml.split(/(?=<)|(?<=>)/g).filter(Boolean);

  tags.forEach((node) => {
    if (node.match(/^<\/\w/)) {
      // Closing tag - decrease indent
      pad = Math.max(0, pad - 1);
      formatted += indent.repeat(pad) + node + '\n';
    } else if (node.match(/^<\w[^>]*[^\/]>.*$/)) {
      // Opening tag
      formatted += indent.repeat(pad) + node;
      // Only add newline if next item is a tag
      const nextIndex = tags.indexOf(node) + 1;
      if (nextIndex < tags.length && tags[nextIndex].startsWith('<')) {
        formatted += '\n';
        if (!node.match(/^<\w[^>]*\/>$/)) {
          pad++;
        }
      }
    } else if (node.match(/^<\w[^>]*\/>$/)) {
      // Self-closing tag
      formatted += indent.repeat(pad) + node + '\n';
    } else if (node.startsWith('<')) {
      // Other tags (like <?xml)
      formatted += indent.repeat(pad) + node + '\n';
    } else {
      // Text content
      formatted += node;
    }
  });

  return formatted.trim();
}

/** 
 * Efficiently converts a potentially incomplete XML string to a legal XML string by closing any open tags properly.
 * Additionally, if an <mxCell> tag does not have an mxGeometry child (e.g. <mxCell id="3">),
 * it removes that tag from the output.
 * @param xmlString The potentially incomplete XML string
 * @returns A legal XML string with properly closed tags and removed incomplete mxCell elements.
 */
export function convertToLegalXml(xmlString: string): string {
  // This regex will match either self-closing <mxCell .../> or a block element 
  // <mxCell ...> ... </mxCell>. Unfinished ones are left out because they don't match.
  const regex = /<mxCell\b[^>]*(?:\/>|>([\s\S]*?)<\/mxCell>)/g;
  let match: RegExpExecArray | null;
  let result = "<root>\n";

  while ((match = regex.exec(xmlString)) !== null) {
    // match[0] contains the entire matched mxCell block
    // Indent each line of the matched block for readability.
    const formatted = match[0].split('\n').map(line => "    " + line.trim()).join('\n');
    result += formatted + "\n";
  }
  result += "</root>";

  return result;
}


/**
 * Replace nodes in a Draw.io XML diagram
 * @param currentXML - The original Draw.io XML string
 * @param nodes - The XML string containing new nodes to replace in the diagram
 * @returns The updated XML string with replaced nodes
 */
export function replaceNodes(currentXML: string, nodes: string): string {
  // Check for valid inputs
  if (!currentXML || !nodes) {
    throw new Error("Both currentXML and nodes must be provided");
  }

  try {
    // Parse the XML strings to create DOM objects
    const parser = new DOMParser();
    const currentDoc = parser.parseFromString(currentXML, "text/xml");

    // Handle nodes input - if it doesn't contain <root>, wrap it
    let nodesString = nodes;
    if (!nodes.includes("<root>")) {
      nodesString = `<root>${nodes}</root>`;
    }

    const nodesDoc = parser.parseFromString(nodesString, "text/xml");

    // Find the root element in the current document
    let currentRoot = currentDoc.querySelector("mxGraphModel > root");
    if (!currentRoot) {
      // If no root element is found, create the proper structure
      const mxGraphModel = currentDoc.querySelector("mxGraphModel") ||
        currentDoc.createElement("mxGraphModel");

      if (!currentDoc.contains(mxGraphModel)) {
        currentDoc.appendChild(mxGraphModel);
      }

      currentRoot = currentDoc.createElement("root");
      mxGraphModel.appendChild(currentRoot);
    }

    // Find the root element in the nodes document
    const nodesRoot = nodesDoc.querySelector("root");
    if (!nodesRoot) {
      throw new Error("Invalid nodes: Could not find or create <root> element");
    }

    // Clear all existing child elements from the current root
    while (currentRoot.firstChild) {
      currentRoot.removeChild(currentRoot.firstChild);
    }

    // Ensure the base cells exist
    const hasCell0 = Array.from(nodesRoot.childNodes).some(
      node => node.nodeName === "mxCell" &&
        (node as Element).getAttribute("id") === "0"
    );

    const hasCell1 = Array.from(nodesRoot.childNodes).some(
      node => node.nodeName === "mxCell" &&
        (node as Element).getAttribute("id") === "1"
    );

    // Copy all child nodes from the nodes root to the current root
    Array.from(nodesRoot.childNodes).forEach(node => {
      const importedNode = currentDoc.importNode(node, true);
      currentRoot.appendChild(importedNode);
    });

    // Add default cells if they don't exist
    if (!hasCell0) {
      const cell0 = currentDoc.createElement("mxCell");
      cell0.setAttribute("id", "0");
      currentRoot.insertBefore(cell0, currentRoot.firstChild);
    }

    if (!hasCell1) {
      const cell1 = currentDoc.createElement("mxCell");
      cell1.setAttribute("id", "1");
      cell1.setAttribute("parent", "0");

      // Insert after cell0 if possible
      const cell0 = currentRoot.querySelector('mxCell[id="0"]');
      if (cell0 && cell0.nextSibling) {
        currentRoot.insertBefore(cell1, cell0.nextSibling);
      } else {
        currentRoot.appendChild(cell1);
      }
    }

    // Convert the modified DOM back to a string
    const serializer = new XMLSerializer();
    return serializer.serializeToString(currentDoc);
  } catch (error) {
    throw new Error(`Error replacing nodes: ${error}`);
  }
}

/**
 * Replace specific parts of XML content using search and replace pairs
 * @param xmlContent - The original XML string
 * @param searchReplacePairs - Array of {search: string, replace: string} objects
 * @returns The updated XML string with replacements applied
 */
export function replaceXMLParts(
  xmlContent: string,
  searchReplacePairs: Array<{ search: string; replace: string }>
): string {
  // Format the XML first to ensure consistent line breaks
  let result = formatXML(xmlContent);
  let lastProcessedIndex = 0;

  for (const { search, replace } of searchReplacePairs) {
    // Also format the search content for consistency
    const formattedSearch = formatXML(search);
    const searchLines = formattedSearch.split('\n');

    // Split into lines for exact line matching
    const resultLines = result.split('\n');

    // Remove trailing empty line if exists (from the trailing \n in search content)
    if (searchLines[searchLines.length - 1] === '') {
      searchLines.pop();
    }

    // Find the line number where lastProcessedIndex falls
    let startLineNum = 0;
    let currentIndex = 0;
    while (currentIndex < lastProcessedIndex && startLineNum < resultLines.length) {
      currentIndex += resultLines[startLineNum].length + 1; // +1 for \n
      startLineNum++;
    }

    // Try to find exact match starting from lastProcessedIndex
    let matchFound = false;
    let matchStartLine = -1;
    let matchEndLine = -1;

    // First try: exact match
    for (let i = startLineNum; i <= resultLines.length - searchLines.length; i++) {
      let matches = true;

      for (let j = 0; j < searchLines.length; j++) {
        if (resultLines[i + j] !== searchLines[j]) {
          matches = false;
          break;
        }
      }

      if (matches) {
        matchStartLine = i;
        matchEndLine = i + searchLines.length;
        matchFound = true;
        break;
      }
    }

    // Second try: line-trimmed match (fallback)
    if (!matchFound) {
      for (let i = startLineNum; i <= resultLines.length - searchLines.length; i++) {
        let matches = true;

        for (let j = 0; j < searchLines.length; j++) {
          const originalTrimmed = resultLines[i + j].trim();
          const searchTrimmed = searchLines[j].trim();

          if (originalTrimmed !== searchTrimmed) {
            matches = false;
            break;
          }
        }

        if (matches) {
          matchStartLine = i;
          matchEndLine = i + searchLines.length;
          matchFound = true;
          break;
        }
      }
    }

    // Third try: substring match as last resort (for single-line XML)
    if (!matchFound) {
      // Try to find as a substring in the entire content
      const searchStr = search.trim();
      const resultStr = result;
      const index = resultStr.indexOf(searchStr);

      if (index !== -1) {
        // Found as substring - replace it
        result = resultStr.substring(0, index) + replace.trim() + resultStr.substring(index + searchStr.length);
        // Re-format after substring replacement
        result = formatXML(result);
        continue; // Skip the line-based replacement below
      }
    }

    if (!matchFound) {
      throw new Error(`Search block not found:\n${search}\n...does not match anything in the file.`);
    }

    // Replace the matched lines
    const replaceLines = replace.split('\n');

    // Remove trailing empty line if exists
    if (replaceLines[replaceLines.length - 1] === '') {
      replaceLines.pop();
    }

    // Perform the replacement
    const newResultLines = [
      ...resultLines.slice(0, matchStartLine),
      ...replaceLines,
      ...resultLines.slice(matchEndLine)
    ];

    result = newResultLines.join('\n');

    // Update lastProcessedIndex to the position after the replacement
    lastProcessedIndex = 0;
    for (let i = 0; i < matchStartLine + replaceLines.length; i++) {
      lastProcessedIndex += newResultLines[i].length + 1;
    }
  }

  return result;
}

export function extractDiagramXML(xml_svg_string: string): string {
  try {
    // 1. Parse the SVG string (using built-in DOMParser in a browser-like environment)
    const svgString = atob(xml_svg_string.slice(26));
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgString, "image/svg+xml");
    const svgElement = svgDoc.querySelector('svg');

    if (!svgElement) {
      throw new Error("No SVG element found in the input string.");
    }
    // 2. Extract the 'content' attribute
    const encodedContent = svgElement.getAttribute('content');

    if (!encodedContent) {
      throw new Error("SVG element does not have a 'content' attribute.");
    }

    // 3. Decode HTML entities (using a minimal function)
    function decodeHtmlEntities(str: string) {
      const textarea = document.createElement('textarea'); // Use built-in element
      textarea.innerHTML = str;
      return textarea.value;
    }
    const xmlContent = decodeHtmlEntities(encodedContent);

    // 4. Parse the XML content
    const xmlDoc = parser.parseFromString(xmlContent, "text/xml");
    const diagramElement = xmlDoc.querySelector('diagram');

    if (!diagramElement) {
      throw new Error("No diagram element found");
    }
    // 5. Extract base64 encoded data
    const base64EncodedData = diagramElement.textContent;

    if (!base64EncodedData) {
      throw new Error("No encoded data found in the diagram element");
    }

    // 6. Decode base64 data
    const binaryString = atob(base64EncodedData);

    // 7. Convert binary string to Uint8Array
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // 8. Decompress data using pako (equivalent to zlib.decompress with wbits=-15)
    const decompressedData = pako.inflate(bytes, { windowBits: -15 });

    // 9. Convert the decompressed data to a string
    const decoder = new TextDecoder('utf-8');
    const decodedString = decoder.decode(decompressedData);

    // Decode URL-encoded content (equivalent to Python's urllib.parse.unquote)
    const urlDecodedString = decodeURIComponent(decodedString);

    return urlDecodedString;

  } catch (error) {
    console.error("Error extracting diagram XML:", error);
    throw error; // Re-throw for caller handling
  }
}
