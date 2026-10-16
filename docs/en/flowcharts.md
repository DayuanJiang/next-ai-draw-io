# Flowcharts and sequence diagrams

Flowcharts, swimlane diagrams, BPMN processes and sequence diagrams all come out as ordinary draw.io diagrams, so you can keep editing them by hand. This page shows what to put in a request to get a clear first draft.

## Flowcharts

Describe the steps in order, and each decision with its outcomes:

```text
Draw a flowchart for a refund request: the customer submits the form, support checks the order, if it is older than 30 days the request is rejected, otherwise billing refunds it and the customer gets an email.
```

What helps:

- **Say where it starts and ends.** "From the form submission to the email."
- **Name every decision and its outcomes.** "If the order is older than 30 days: rejected; otherwise: refunded."
- **Say who does what** to get swimlanes: "one lane each for the customer, support and billing".
- **Pick a direction**: top to bottom or left to right.

The AI uses draw.io's flowchart and BPMN shape libraries: decisions are diamonds, and a request for BPMN gets BPMN shapes for events, gateways and tasks.

<!-- demo: flowchart -->

## Sequence diagrams

Name the participants, then the messages between them in order, including the unhappy paths:

```text
Draw a login sequence diagram with SMS codes: the app, the auth API, the SMS provider and the user. Show what happens when the code is wrong three times.
```

Name retries, timeouts and asynchronous replies; otherwise the diagram may show only the path where everything works.

## Redraw a flowchart you have

Attach a photo of a whiteboard, a screenshot or a PDF, and ask the AI to redraw it. The result is an editable diagram, with real shapes and connectors in place of the picture. Then ask for changes as usual: "merge the two approval steps", "add an error path after the payment".

With the MCP server, the agent can also draw from your code: "Draw the request flow of the checkout API as a sequence diagram". See [Use it from Claude Code](./claude-code.md).

## Make it readable

- **Diagram style** in Settings: Minimal keeps shapes plain, Styled adds colors and icons. See [Settings](./settings.md).
- **Animated connectors** show which way the flow goes; ask for them in the request.
- **Select part of the diagram** and ask for a change to just that part, for example "space these steps evenly".

## Example

![Agile Scrum workflow](../../public/agile_scrum.svg)

Prompt: "Generate agile scrum workflow diagram for software development team."
