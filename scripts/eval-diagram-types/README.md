# Evaluation of diagram type guides

Measures how well the app draws the diagram types that have a drawing guide
(`packages/mcp-server/src/diagram-types`), and that other diagrams stay as
they are. It is run by hand: it calls real models, which costs money, so it
is not part of CI.

The runs go through the real page in headless Chromium. The page does what
the app does with a model's answer (the tool handlers, retries, the canvas),
so a run is the result a user gets.

## Running it

Build and start the app to measure, with a server model list whose first
model is the one to test (`AI_MODELS_CONFIG`), on a port of its own:

    npm run build
    npx next start --port 6103

To compare two versions, start each from its own checkout on its own port
and run them at the same time, so they get their requests over the same
minutes.

    node scripts/eval-diagram-types/run.mjs out --base http://localhost:6103 --config guide --repeats 10
    node scripts/eval-diagram-types/metrics.mjs out main guide --json out/summary.json
    node scripts/eval-diagram-types/gallery.mjs out out/summary.json main guide

`run.mjs` saves, per run, the tool calls and token counts, every cell as
draw.io rendered it, the canvas XML and a picture. `metrics.mjs` prints one
table per group of requests. `gallery.mjs` writes `out/gallery.html` with
every picture, one column per configuration.

## The requests

`requests.json` is written by `make-requests.py`. The groups:

- `sequence`: sequence diagrams as users ask for them, some with the
  participants and messages listed
- `special`: sequence diagrams with a demand that has to be met (colours, a
  loop frame and a note, 32 messages, a given order and spacing, messages
  to oneself, activation bars)
- `untyped`: no diagram type named, the model has to choose
- `edit`: a second message that changes the diagram of the first
- `control`: a flowchart, an architecture and an ER diagram, for which
  nothing may change
- `swimlane`, `class`, `er`, `usecase`, `state`, `mindmap`: three requests
  per type, one short and two that list what has to be drawn

The requests follow the kinds of requests the demo site gets, but none is a
user's text.

All three scripts take `--requests <file>` for a list of your own in the
same format. Use it for what users really asked, taken from the demo's logs:
those requests are longer and ask for more than the ones here (ten classes,
lanes with the titles on top, eight participants). Keep such a file outside
the repository, since it holds users' text. A request without `lanes` is
scored by the lanes as they were drawn.

## The scores

All scores come from the geometry draw.io rendered and from what a request
lists, never from the app's own checks.

Sequence diagrams (`metrics.mjs`):

- structure: at least two lifelines, and every message is a level line
  between two of them, on a row of its own, at least 30 px from the next
- correct: the structure, and every participant and message the request
  lists is there, in order
- clean: correct, and no label lies on another label or on a participant's
  head, and no frame line lies on a message
- demand: the special demand of the request is met

The other types (`types.mjs`):

- structure: what the type needs to be one (lanes with every step in a
  lane, stick figures and ovals, a tree...), and no line with a loose end
- correct: the structure, and every node and connection the request lists
  is there, with what the type asks of it: a step in the lane of its role, a
  hollow triangle at the parent of an inheritance, a use case inside the
  system and an actor outside
- clean: correct, and the layout check (`--check`) found nothing
- solid: correct, and built so that it moves in one piece: no shape with
  text lies on another shape without being its child

## Adding a diagram type

Measure first, with requests of the type and a scorer in `types.mjs`: a
type the models already draw well needs no guide (ER, state and mind map
diagrams did not, in November 2026). Then write the guide, draw its example
in draw.io, and run the type's requests and the others again: the types
without a guide must come out as before.

Run real requests too, and look at the pictures. A guide for class diagrams
scored well on the three requests here and was removed after real ones: with
nine or ten classes its boxes came out on top of each other. The first
swimlane guide knew only lanes as rows and drew rows for users who asked for
vertical lanes.

A guide gets the kind of diagram right and where its shapes stand. It does
not get lines around shapes or texts clear of each other in a large
diagram: that is the work of the type's layout
(`packages/mcp-server/src/diagram-types/layouts.ts`), which runs on the
server when the model names the type in its drawing call. On the real
requests, drawings without a layout problem went from 28 of 54 to 53 of 54
for swimlane and use case diagrams with their layouts. `run.mjs` records
the type the model named, so a run shows whether the layout ran.

A guide shows one example, since that is what the model copies. With a
second example for lanes as rows in the swimlane guide, the model drew rows
for half of the users who had not asked for them, so that direction is a
type of its own (`swimlane-horizontal`).
