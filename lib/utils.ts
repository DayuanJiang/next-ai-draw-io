import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

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