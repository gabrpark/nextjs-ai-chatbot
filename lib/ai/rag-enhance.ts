import { Message } from 'ai'
import { ragService } from '@/lib/rag-service'

/**
 * Enhances a system prompt with RAG context based on the last user message.
 */
export async function enhanceWithRAG(
	messages: Message[],
	systemPrompt: string
): Promise<{ enhancedSystemPrompt: string; error?: Error }> {
	try {
		const lastMessage = messages.findLast((m) => m.role === 'user')
		if (!lastMessage) {
			return { enhancedSystemPrompt: systemPrompt }
		}

		const enhancedPrompt = await ragService.enhanceSystemPrompt(
			systemPrompt,
			lastMessage.content
		)

		return { enhancedSystemPrompt: enhancedPrompt }
	} catch (error) {
		console.error('Error in RAG enhancement:', error)
		return {
			enhancedSystemPrompt: systemPrompt,
			error: error as Error,
		}
	}
}