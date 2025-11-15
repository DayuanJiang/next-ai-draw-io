# Next AI Draw.io

A next.js web application that integrates AI capabilities with draw.io diagrams. This app allows you to create, modify, and enhance diagrams through natural language commands and AI-assisted visualization.

https://github.com/user-attachments/assets/b2eef5f3-b335-4e71-a755-dc2e80931979

Demo site: [https://next-ai-draw-io.vercel.app/](https://next-ai-draw-io.vercel.app/)

## Features

-   **LLM-Powered Diagram Creation**: Leverage Large Language Models to create and manipulate draw.io diagrams directly through natural language commands
-   **Image-Based Diagram Replication**: Upload existing diagrams or images and have the AI replicate and enhance them automatically
-   **Diagram History**: Comprehensive version control that tracks all changes, allowing you to view and restore previous versions of your diagrams before the AI editing.
-   **Interactive Chat Interface**: Communicate with AI to refine your diagrams in real-time
-   **Smart Editing**: Modify existing diagrams using simple text prompts
-   **Targeted XML Editing**: AI can now make precise edits to specific parts of diagrams without regenerating the entire XML, making updates faster and more efficient
-   **Improved XML Handling**: Automatic formatting of single-line XML for better compatibility and reliability

## How It Works

The application uses the following technologies:

-   **Next.js**: For the frontend framework and routing
-   **@ai-sdk/react**: For the chat interface and AI interactions
-   **react-drawio**: For diagram representation and manipulation

Diagrams are represented as XML that can be rendered in draw.io. The AI processes your commands and generates or modifies this XML accordingly.

## Multi-Provider Support

This application supports multiple AI providers, making it easy to deploy with your preferred service. Choose from:

### Supported Providers

| Provider | Status | Best For |
|----------|--------|----------|
| **AWS Bedrock** | ✅ Default | Claude models via AWS infrastructure |
| **OpenAI** | ✅ Supported | GPT-4, GPT-5, and reasoning models |
| **Anthropic** | ✅ Supported | Direct access to Claude models |
| **Google AI** | ✅ Supported | Gemini models with multi-modal capabilities |
| **Azure OpenAI** | ✅ Supported | Enterprise OpenAI deployments |
| **Ollama** | ✅ Supported | Local/self-hosted open source models |

### Quick Setup by Provider

#### AWS Bedrock (Default)
```bash
AI_PROVIDER=bedrock
AI_MODEL=global.anthropic.claude-sonnet-4-5-20250929-v1:0
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

#### OpenAI
```bash
AI_PROVIDER=openai
AI_MODEL=gpt-4o
OPENAI_API_KEY=sk-...
```

#### Anthropic
```bash
AI_PROVIDER=anthropic
AI_MODEL=claude-sonnet-4-5
ANTHROPIC_API_KEY=sk-ant-...
```

#### Google Generative AI
```bash
AI_PROVIDER=google
AI_MODEL=gemini-2.5-flash
GOOGLE_GENERATIVE_AI_API_KEY=...
```

#### Azure OpenAI
```bash
AI_PROVIDER=azure
AI_MODEL=your-deployment-name
AZURE_RESOURCE_NAME=your-resource
AZURE_API_KEY=...
```

#### Ollama (Local)
```bash
AI_PROVIDER=ollama
AI_MODEL=phi3
OLLAMA_BASE_URL=http://localhost:11434/api  # Optional
```
Note: Install models locally first with `ollama pull <model-name>`

### Recommended Models

**Best Quality:**
- AWS Bedrock: `global.anthropic.claude-sonnet-4-5-20250929-v1:0`
- Anthropic: `claude-sonnet-4-5`
- OpenAI: `gpt-4o` or `gpt-5`

**Best Speed:**
- Google: `gemini-2.5-flash`
- OpenAI: `gpt-4o`
- Anthropic: `claude-haiku-4-5`

**Best Cost:**
- Ollama: Free (local models)
- Google: `gemini-1.5-flash-8b`
- OpenAI: `gpt-4o-mini`

## Getting Started

### Installation

1. Clone the repository:

```bash
git clone https://github.com/DayuanJiang/next-ai-draw-io
cd next-ai-draw-io
```

2. Install dependencies:

```bash
npm install
# or
yarn install
```

3. Configure your AI provider:

Create a `.env.local` file in the root directory:

```bash
cp .env.example .env.local
```

Edit `.env.local` and configure your chosen provider:
- Set `AI_PROVIDER` to your chosen provider (bedrock, openai, anthropic, google, azure, ollama)
- Set `AI_MODEL` to the specific model you want to use
- Add the required API keys for your provider

See the [Multi-Provider Support](#multi-provider-support) section above for provider-specific configuration examples.

4. Run the development server:

```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

## Deployment

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new) from the creators of Next.js.

Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

Or you can deploy by this button.
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FDayuanJiang%2Fnext-ai-draw-io)

## Project Structure

```
app/                  # Next.js application routes and pages
  extract_xml.ts      # Utilities for XML processing
components/           # React components
  chat-input.tsx      # User input component for AI interaction
  chatPanel.tsx       # Chat interface with diagram control
  ui/                 # UI components (buttons, cards, etc.)
lib/                  # Utility functions and helpers
  utils.ts            # General utilities including XML conversion
public/               # Static assets including example images
```

## TODOs

-   [x] Allow the LLM to modify the XML instead of generating it from scratch everytime.
-   [x] Improve the smoothness of shape streaming updates.
-   [x] Add multiple AI provider support (OpenAI, Anthropic, Google, Azure, Ollama)

## License

This project is licensed under the MIT License.

## Support & Contact

For support or inquiries, please open an issue on the GitHub repository or contact the maintainer at:

-   Email: me[at]jiang.jp

---
