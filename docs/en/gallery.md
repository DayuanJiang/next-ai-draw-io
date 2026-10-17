# Gallery

Diagrams the AI drew, each from one prompt: cloud architectures, database and class diagrams, processes, plans and a few drawings. Open one to see it larger, copy its prompt, or open the editor with the prompt already in the chat input and change it before you send it.

Diagrams marked "Claude Code with the MCP server" were drawn by Claude Code through the [MCP server](./claude-code.md), which looked at a screenshot of its result and fixed overlaps, as the server asks it to. The others were drawn in the web app. The same prompt gives a somewhat different diagram each time, and each model draws in its own way.

<!-- demo: gallery -->

## Write your own prompt

What the prompts above have in common:

- **They name the parts**: "customers, addresses, orders, order items, products, categories and payments".
- **They say how the parts connect**: "the manager approves or rejects it, finance checks the receipts and pays".
- **They name the kind of diagram**: ER diagram, sequence diagram, BPMN, swimlanes, Gantt chart.
- **They ask for icons by name** when they matter: AWS, Azure, GCP, Kubernetes or Cisco icons.

More on writing requests: [Draw and edit](./editor.md), [AWS architecture diagrams](./aws-architecture.md) and [Flowcharts and sequence diagrams](./flowcharts.md).
