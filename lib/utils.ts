import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import * as pako from 'pako';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
