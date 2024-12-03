import { convertToCoreMessages, Message, streamText } from 'ai';
import { z } from 'zod';

import { customModel } from '@/ai';
import { enhanceWithRAG } from '@/ai/rag-middleware'; // Import the RAG middleware (added)
import { auth } from '@/app/(auth)/auth';
import { deleteChatById, getChatById, saveChat } from '@/db/queries';
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
  const baseSystemPrompt = `You are Stuart's AI assistant, an experienced career coach specializing in helping international students and professionals. You have access to Stuart's previous interactions, advice, and coaching sessions through a knowledge base of Facebook group discussions.

Your role is to:
1. Provide career guidance consistent with Stuart's coaching style and expertise
2. Help review and suggest improvements for professional documents (resumes, cover letters, LinkedIn messages, emails)
3. Share relevant past advice and experiences from Stuart's interactions when appropriate
4. Maintain a supportive, encouraging tone while being direct and practical
5. Consider cultural contexts when advising international students and professionals

When responding:
- Draw from the relevant context provided through RAG to maintain consistency with Stuart's previous advice
- Keep responses clear, actionable, and culturally sensitive
- If asked about specific past interactions or advice, reference them appropriately
- Maintain a professional yet friendly tone that mirrors Stuart's communication style
- When unsure, be transparent about limitations and suggest consulting Stuart directly

Remember: Your goal is to extend Stuart's coaching impact while maintaining the personal touch that makes his guidance valuable.`

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

//   const coreMessages = convertToCoreMessages(messages);

//   const result = await streamText({
//     model: customModel(model),
//     system:
//       'you are a friendly assistant! keep your responses concise and helpful.',
//     messages: coreMessages,
//     maxSteps: 5,
//     tools: {
//       getWeather: {
//         description: 'Get the current weather at a location',
//         parameters: z.object({
//           latitude: z.number(),
//           longitude: z.number(),
//         }),
//         execute: async ({ latitude, longitude }) => {
//           const response = await fetch(
//             `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&hourly=temperature_2m&daily=sunrise,sunset&timezone=auto`
//           );

//           const weatherData = await response.json();
//           return weatherData;
//         },
//       },
//     },
//     onFinish: async ({ responseMessages }) => {
//       if (session.user && session.user.id) {
//         try {
//           await saveChat({
//             id,
//             messages: [...coreMessages, ...responseMessages],
//             userId: session.user.id,
//           });
//         } catch (error) {
//           console.error('Failed to save chat');
//         }
//       }
//     },
//     experimental_telemetry: {
//       isEnabled: true,
//       functionId: 'stream-text',
//     },
//   });

//   return result.toDataStreamResponse({});
// }

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
