/**
 * A diagram type the model can ask a drawing guide for: how this kind of
 * diagram is drawn in draw.io (shapes, styles, where things go), which the
 * general drawing rules do not say.
 */
export interface DiagramType {
    /** The name the model asks with, e.g. "sequence" */
    name: string
    /** One line for the list the model picks from: what the diagram shows */
    when: string
    /**
     * The drawing the guide shows, in the notation the model writes. A
     * model copies an example more reliably than it follows a rule, so the
     * example has to be right: the tests draw it.
     */
    example: string
    /**
     * The guide. `draw` and `edit` are the names of the tools that draw a
     * new diagram and change one, which differ between the web app and the
     * MCP server.
     */
    guide: (draw: string, edit: string) => string
}
