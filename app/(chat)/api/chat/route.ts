import { convertToCoreMessages, Message, streamText } from 'ai';
import { z } from 'zod';

import { auth } from '@/app/(auth)/auth';
import { deleteChatById, getChatById, saveChat } from '@/db/queries';
import { customModel } from '@/lib/ai/model-wrapper';
import { enhanceWithRAG } from '@/lib/ai/rag-enhance';
import { Model, models } from '@/lib/model';

export async function POST(request: Request) {
  const {
    id,
    messages,
    model,
  }: { id: string; messages: Array<Message>; model: Model['name'] } =
    await request.json();

  const session = await auth();

  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!models.find((m) => m.name === model)) {
    return new Response('Model not found', { status: 404 });
  }

  // Add these lines to enhance the system prompt
  const baseSystemPrompt = `You are an experienced career coach AI assistant, designed to assist Stuart Bradley and his clients. Stuart is a real and accomplished career coach specializing in helping international students, recent graduates, and professionals achieve their career goals. Your role is to provide personalized, actionable, and culturally sensitive advice by using the context retrieved from Stuart's coaching materials, past client interactions, and career program resources.

As a RAG-based assistant, you should rely on the provided context to ensure your responses are accurate, aligned with Stuart's coaching philosophy, and tailored to the specific needs of each client. When no specific context is available, draw from your general expertise in career coaching while maintaining Stuart's professional tone and approach. Always prioritize professionalism, empathy, and clarity in your responses.`

  const { enhancedSystemPrompt } = await enhanceWithRAG(messages, baseSystemPrompt)

  const coreMessages = convertToCoreMessages(messages)

  const result = await streamText({
    model: customModel(model),
    system: enhancedSystemPrompt,  // Use the enhanced prompt
    messages: coreMessages,
    maxSteps: 5,
    tools: {
      getWeather: {
        description: 'Get the current weather at a location',
        parameters: z.object({
          latitude: z.number(),
          longitude: z.number(),
        }),
        execute: async ({ latitude, longitude }) => {
          const response = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&hourly=temperature_2m&daily=sunrise,sunset&timezone=auto`
          )

          const weatherData = await response.json()
          return weatherData
        },
      },
    },
    onFinish: async ({ responseMessages }) => {
      if (session.user && session.user.id) {
        try {
          await saveChat({
            id,
            messages: [...coreMessages, ...responseMessages],
            userId: session.user.id,
          })
        } catch (error) {
          console.error('Failed to save chat')
        }
      }
    },
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'stream-text',
    },
  })

  return result.toDataStreamResponse({})
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new Response('Not Found', { status: 404 });
  }

  const session = await auth();

  if (!session || !session.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const chat = await getChatById({ id });

    if (chat.userId !== session.user.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    await deleteChatById({ id });

    return new Response('Chat deleted', { status: 200 });
  } catch (error) {
    return new Response('An error occurred while processing your request', {
      status: 500,
    });
  }
}
