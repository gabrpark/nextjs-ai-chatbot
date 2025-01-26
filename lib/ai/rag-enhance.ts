// ai/rag-middleware.ts
import { Message } from 'ai'

import { ragService } from '@/lib/rag-service'

export async function enhanceWithRAG(
	messages: Message[],
	systemPrompt: string
): Promise<{
	enhancedSystemPrompt: string,
	error?: Error
}> {
	try {
		// Get the last user message
		const lastMessage = messages.findLast(m => m.role === 'user')

		if (!lastMessage) {
			return { enhancedSystemPrompt: systemPrompt }
		}

		// Enhance the system prompt with relevant context
		const enhancedPrompt = await ragService.enhanceSystemPrompt(
			systemPrompt,
			lastMessage.content
		)

		return { enhancedSystemPrompt: enhancedPrompt }
	} catch (error) {
		console.error('Error in RAG enhancement:', error)
		return {
			enhancedSystemPrompt: systemPrompt,
			error: error as Error
		}
	}
}