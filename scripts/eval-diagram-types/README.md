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
- `control`: other diagram types, for which nothing may change

The requests follow the kinds of requests the demo site gets, but none is a
user's text.

## The scores

All scores come from the geometry draw.io rendered and from the
participants and messages a request lists, never from the app's own checks.

- structure: at least two lifelines, and every message is a level line
  between two of them, on a row of its own, at least 30 px from the next
- correct: the structure, and every participant and message the request
  lists is there, in order
- clean: correct, and no label lies on another label or on a participant's
  head, and no frame line lies on a message
- demand: the special demand of the request is met
