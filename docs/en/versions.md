# Versions and undo

Every change the AI makes is saved as a version, so you can try a request, look at the result and go back if you don't like it.

<!-- demo: ai-edit -->

## Version cards

Each answer that changes the diagram ends with a version card in the chat. It shows the version number, what happened ("Drew the diagram", "Changed the diagram") and what changed, for example "Added 1 shape, added 1 connector". Show XML opens the XML the AI wrote.

The changed shapes are outlined on the canvas for 3 seconds. On the card of the version the canvas shows, Show changes outlines them again.

## Undo the last change

The newest card has Undo change while the canvas shows that version. It takes back the AI's last change; the card then says "Change undone" and offers Redo change.

Ctrl+Z on the canvas does the same for the AI's last change.

If you edit the diagram by hand after a version, its card says "You changed the canvas by hand since this version". Undo is then replaced by Restore, because undoing would also take away your edits.

## Restore an older version

Older cards have Restore v1, Restore v2 and so on. Restoring puts that version on the canvas, and the newer versions stay in the list, so you can restore one of them again later. A message confirms the restore and has an Undo button to go back to the canvas from before it.

<!-- demo: versions -->

## Compare versions

Once there are two versions or more, the Versions row under the chat's header shows a picture of each. The one on the canvas is outlined. Click a picture, or the picture on a card, to open Compare versions: the version and the canvas now, side by side, with a list of the shapes that differ. Use Previous version and Next version to step through them, and restore the one you want from there.

## In the MCP server

The MCP server keeps the same version cards next to its canvas, with its last 20 versions. You can also ask the AI to undo; see [Use it from Claude Code](./claude-code.md).
