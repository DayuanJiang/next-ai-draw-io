import { generateText } from 'ai';
import { getAIModel } from '@/lib/ai-providers';

export const maxDuration = 10;

export async function POST(req: Request) {
  try {
    const { userQuery } = await req.json();

    if (!userQuery) {
      return Response.json(
        { error: 'User query is required' },
        { status: 400 }
      );
    }

    const systemMessage = `You are a helpful assistant that generates concise, descriptive titles for conversations.
Your task is to create a short title (3-6 words maximum) that captures the essence of what the user wants to do.
The title should be clear, actionable, and professional.
Do not use quotes or punctuation in the title.
Just return the title text, nothing else.`;

    // Get AI model from environment configuration
    const { model, providerOptions } = getAIModel();

    const result = await generateText({
      model,
      system: systemMessage,
      prompt: `Generate a concise title for this user request:\n\n"${userQuery}"`,
      ...(providerOptions && { providerOptions }),
      temperature: 0.7,
      maxTokens: 20,
    });

    const title = result.text.trim();

    return Response.json({ title });
  } catch (error) {
    console.error('Error generating title:', error);
    return Response.json(
      { error: 'Failed to generate title' },
      { status: 500 }
    );
  }
}

