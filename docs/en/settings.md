# Settings

Open Settings from the chat panel. It has four tabs: General, Drawing, Models and About.

## General

| Setting | What it does |
|---|---|
| Language | The interface language: English, Simplified Chinese, Traditional Chinese or Japanese |
| Theme | Light, dark, or the system's setting. The canvas follows the same theme |
| Send shortcut | Enter or Cmd/Ctrl+Enter sends. Shift+Enter always adds a new line, and Cmd/Ctrl+Enter always sends |
| Access code | Shown when the site needs one; the site's owner gives it to you |
| Proxy settings | Desktop app only: an HTTP or HTTPS proxy for the requests to AI providers |

## Drawing

| Setting | What it does |
|---|---|
| Diagram style | How the AI draws new diagrams: Styled uses colors and icons, Minimal keeps shapes plain |
| Check diagrams with a screenshot (experimental) | After each drawing, a model that can read images looks at a screenshot and asks for fixes. Needs such a model |
| Custom instructions | Text added to the AI's instructions on every request, for example "Always use a blue color scheme" |
| Output token limit | The budget for one answer, shared by the model's thinking and the diagram. Raise it if the AI keeps thinking and no diagram appears; leave it empty for the default |

## Models

The demo site comes with its own models, which need no API key and have a daily limit. To use another model, or to go past the limit, add a provider with your own API key:

1. In the Models tab, choose a provider, such as OpenAI, Anthropic, Google, DeepSeek, Amazon Bedrock or Ollama. Get API key opens the page where the provider makes one.
2. Enter the key. Some providers also take a base URL, for example a company gateway or a local server.
3. Add models: pick suggested ones, get the provider's full list, or type a model ID.
4. Test sends each model a very short message to check that the key and the model work.

Then pick the model in the chat's model picker. API keys stay in this browser on this device and go to the server only with your requests.

A model needs tool calls to draw. A model that models.dev lists without tool call support is marked "no tool calls".

When you host the app yourself, you can also set up models for everyone with environment variables: see [AI providers](./ai-providers.md).

## About

The app's version and a link to the project's website.
