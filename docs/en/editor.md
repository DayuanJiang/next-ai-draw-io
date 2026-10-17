# Draw and edit

The editor has the draw.io canvas on the left and the chat on the right. You describe what you want in the chat, the AI draws it on the canvas, and you can change the diagram by hand or by asking again.

## Start a diagram

Type a description in the chat and press Enter. A good request names the parts of the diagram and how they connect, for example "a login sequence diagram with SMS codes and retries".

<!-- demo: generate -->

On the start screen, the examples show what the editor can do. Pick one and press Send: its saved answer appears at once, without calling the AI.

To start from something you already have:

- **Pictures**: attach a screenshot, a photo of a whiteboard or a diagram from another tool, and ask the AI to redraw it. PNG, JPEG, GIF and WebP images up to 2 MB each.
- **Documents**: attach a PDF or a text file (Markdown, JSON, CSV, YAML, code and more), and ask for a diagram of what it describes. Their text is read, up to 150,000 characters per file.
- **Web pages**: choose Add, then Extract from URL, and paste the address of a page.
- **draw.io files**: attach a `.drawio` or `.drawio.svg` file to open it on the canvas.

Up to 5 files go with one message.

## Change it with the AI

Ask for a change in the chat, for example "make the database a cluster of three nodes". The AI changes the diagram it sees, including what you changed by hand.

To change only part of the diagram, select those shapes on the canvas first. An "Ask AI to change this" button appears next to them; click it, or just type in the chat. The selection goes with your message, so "make these blue" changes only the selected shapes.

While an answer is coming, Stop ends it. Under an answer you can regenerate it, and a message you sent can be edited and sent again. Pointing at an answer also shows its input and output tokens and how long it took; point at those numbers for the details, such as tokens read from the prompt cache.

<!-- demo: ai-edit -->

## Edit by hand

The canvas is the draw.io editor, so everything in draw.io works here: drag shapes, connect them, edit labels with a double click, and change colors, fonts and lines in the Format panel at the top right. Ctrl+Z and Ctrl+Y undo and redo your edits.

Each change the AI makes is outlined for a few seconds, so you can see what it did. See [Versions and undo](./versions.md) for going back.

<!-- demo: hand-edit -->

## Your diagrams

Diagrams are saved in this browser as you work. The Diagrams list holds each diagram with its conversation: search, rename or delete them there, and choose New diagram to start another one. A diagram stays in the browser and on the device where you made it, so export it to keep a copy or to move it.

## Export

Export saves the diagram in one of four formats:

| Format | What it is for |
|---|---|
| draw.io file | Keeps everything editable, here or in draw.io |
| PNG image | A picture for slides and documents |
| SVG image | A picture that scales without blur |
| Editable SVG | A picture that still opens in draw.io |

A PNG can have a transparent background.

## Saved prompts

Save a prompt you use often, such as "Draw an AWS architecture for…", to send it again later from the saved prompts list. Prompts can be pinned to the top, searched, and exported or imported as a JSON file.
