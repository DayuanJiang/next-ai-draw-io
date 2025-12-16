/**
 * Diagram Prompts
 * Pre-defined prompts for common diagram types
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

/**
 * Register all diagram prompts
 */
export function registerDiagramPrompts(server: McpServer): void {
    // AWS Architecture Diagram
    server.prompt(
        "aws-architecture",
        "Generate an AWS architecture diagram with specified services and layout",
        {
            services: z.string().describe("Comma-separated list of AWS services to include (e.g., 'EC2, S3, Lambda, RDS, API Gateway')"),
            description: z.string().describe("High-level description of the architecture and data flow"),
            style: z.enum(["detailed", "simple"]).optional().describe("Level of detail: 'detailed' includes VPC, subnets, security groups; 'simple' shows just services"),
        },
        ({ services, description, style }) => ({
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: `Create an AWS architecture diagram using AWS 2025 icons.

**Services to include:** ${services}

**Architecture description:** ${description}

**Requirements:**
- Use official AWS icon shapes where available
- ${style === "detailed" ? "Include VPC boundaries, subnets (public/private), and security groups" : "Focus on the main services and connections"}
- Show data flow with labeled arrows
- Group related services logically
- Add clear labels for all components
- Keep the layout within 800x600 pixels
- Use proper spacing to avoid overlaps

Generate the diagram XML now.`,
                    },
                },
            ],
        })
    )

    // Flowchart
    server.prompt(
        "flowchart",
        "Generate a flowchart diagram for a process or workflow",
        {
            process: z.string().describe("Description of the process or workflow to visualize"),
            includeDecisions: z.boolean().optional().describe("Include decision points (diamonds) with Yes/No branches"),
            orientation: z.enum(["vertical", "horizontal"]).optional().describe("Flow direction: vertical (top-to-bottom) or horizontal (left-to-right)"),
        },
        ({ process, includeDecisions, orientation }) => ({
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: `Create a flowchart for the following process:

**Process:** ${process}

**Requirements:**
- Use rectangles for process steps
${includeDecisions !== false ? "- Use diamond shapes for decision points with Yes/No branches" : "- Keep it simple without decision points"}
- Use rounded rectangles for Start and End nodes
- Flow direction: ${orientation === "horizontal" ? "left-to-right" : "top-to-bottom"}
- Connect steps with arrows showing flow direction
- Use consistent spacing and alignment
- Use colors to distinguish different types of nodes:
  - Green for Start/End
  - Blue for process steps
  - Yellow for decision points
- Keep within 800x600 pixels

Generate the diagram XML now.`,
                    },
                },
            ],
        })
    )

    // Sequence Diagram
    server.prompt(
        "sequence-diagram",
        "Generate a UML sequence diagram showing interactions between components",
        {
            actors: z.string().describe("Comma-separated list of actors/systems/components (e.g., 'User, Browser, API Server, Database')"),
            interaction: z.string().describe("Description of the interaction flow between actors"),
            includeReturns: z.boolean().optional().describe("Include return/response arrows (dashed lines)"),
        },
        ({ actors, interaction, includeReturns }) => ({
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: `Create a UML sequence diagram.

**Actors/Systems:** ${actors}

**Interaction flow:** ${interaction}

**Requirements:**
- Show lifelines for each actor/system as vertical dashed lines
- Use solid arrows with labels for synchronous calls/messages
${includeReturns !== false ? "- Use dashed arrows for return/response messages" : "- Focus on forward messages only"}
- Number the steps sequentially
- Space actors evenly across the top
- Use activation boxes on lifelines where appropriate
- Include descriptive labels on all arrows
- Keep within 800x600 pixels

Generate the diagram XML now.`,
                    },
                },
            ],
        })
    )

    // ER Diagram
    server.prompt(
        "er-diagram",
        "Generate an Entity-Relationship diagram for a database schema",
        {
            entities: z.string().describe("Comma-separated list of entities (e.g., 'User, Order, Product, Category')"),
            relationships: z.string().describe("Description of relationships between entities (e.g., 'User has many Orders, Order contains many Products')"),
            includeAttributes: z.boolean().optional().describe("Include key attributes for each entity"),
        },
        ({ entities, relationships, includeAttributes }) => ({
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: `Create an Entity-Relationship (ER) diagram.

**Entities:** ${entities}

**Relationships:** ${relationships}

**Requirements:**
- Use rectangles for entity names (header style with bold text)
${includeAttributes !== false ? "- Include common attributes: id (PK), relevant columns, foreign keys (FK)" : "- Show only entity names without attributes"}
- Use crow's foot notation for cardinality:
  - One-to-Many: single line to crow's foot
  - Many-to-Many: crow's foot on both ends
  - One-to-One: single line on both ends
- Draw relationship lines between related entities
- Label relationships if not obvious
- Arrange entities to minimize crossing lines
- Keep within 800x600 pixels

Generate the diagram XML now.`,
                    },
                },
            ],
        })
    )

    // Class Diagram
    server.prompt(
        "class-diagram",
        "Generate a UML class diagram showing classes and their relationships",
        {
            classes: z.string().describe("Comma-separated list of classes (e.g., 'Animal, Dog, Cat, Bird')"),
            relationships: z.string().describe("Description of relationships (e.g., 'Dog extends Animal, Cat extends Animal')"),
            includeMembers: z.boolean().optional().describe("Include attributes and methods in class boxes"),
        },
        ({ classes, relationships, includeMembers }) => ({
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: `Create a UML class diagram.

**Classes:** ${classes}

**Relationships:** ${relationships}

**Requirements:**
- Use UML class box notation with 3 sections:
  - Class name (bold, centered)
  ${includeMembers !== false ? "- Attributes section (- for private, + for public)\n  - Methods section (with return types)" : "- Keep attribute and method sections minimal or empty"}
- Use correct UML arrows:
  - Empty triangle (▷) for inheritance/extends
  - Empty diamond (◇) for aggregation
  - Filled diamond (◆) for composition
  - Dashed arrow for dependency/implements
- Arrange classes with parent classes above child classes
- Keep within 800x600 pixels

Generate the diagram XML now.`,
                    },
                },
            ],
        })
    )

    // Mind Map
    server.prompt(
        "mindmap",
        "Generate a mind map for brainstorming or organizing ideas",
        {
            centralTopic: z.string().describe("The main/central topic of the mind map"),
            branches: z.string().describe("Comma-separated list of main branches/subtopics"),
            depth: z.enum(["shallow", "deep"]).optional().describe("'shallow' for 2 levels, 'deep' for 3+ levels with sub-branches"),
        },
        ({ centralTopic, branches, depth }) => ({
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: `Create a mind map for brainstorming.

**Central Topic:** ${centralTopic}

**Main Branches:** ${branches}

**Requirements:**
- Place the central topic in the middle as a large, prominent shape
- Arrange main branches radially around the center
${depth === "deep" ? "- Add 2-3 sub-branches to each main branch with related ideas" : "- Keep it to 2 levels (center + main branches)"}
- Use different colors for each main branch
- Connect all branches with curved lines (no arrows)
- Use smaller shapes as you go further from the center
- Keep the layout balanced and visually appealing
- Keep within 800x600 pixels

Generate the diagram XML now.`,
                    },
                },
            ],
        })
    )

    // Network Diagram
    server.prompt(
        "network-diagram",
        "Generate a network topology diagram",
        {
            components: z.string().describe("Comma-separated list of network components (e.g., 'Router, Switch, Server, Workstation, Firewall')"),
            topology: z.enum(["star", "mesh", "hierarchical", "custom"]).describe("Network topology type"),
            description: z.string().optional().describe("Additional description of connections and layout"),
        },
        ({ components, topology, description }) => ({
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: `Create a network topology diagram.

**Components:** ${components}

**Topology:** ${topology}
${description ? `**Description:** ${description}` : ""}

**Requirements:**
- Use appropriate icons for network devices:
  - Router: trapezoid or router icon
  - Switch: rectangular box with ports
  - Server: server rack icon
  - Firewall: brick wall or firewall icon
  - Workstation: computer monitor icon
- Arrange components according to ${topology} topology:
  ${topology === "star" ? "- Central device with all others connected to it" : ""}
  ${topology === "mesh" ? "- Multiple interconnections between devices" : ""}
  ${topology === "hierarchical" ? "- Layered structure (core, distribution, access)" : ""}
  ${topology === "custom" ? "- Based on the provided description" : ""}
- Use clear connection lines
- Label all devices
- Keep within 800x600 pixels

Generate the diagram XML now.`,
                    },
                },
            ],
        })
    )
}
