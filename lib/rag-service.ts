// lib/rag-service.ts
import { Pinecone } from '@pinecone-database/pinecone'
import OpenAI from 'openai'

export class RAGService {
	private static instance: RAGService
	private pinecone: Pinecone
	private openai: OpenAI
	// private initialized = false
	private indexName: string
	private namespace: string

	private constructor() {
		this.pinecone = new Pinecone()
		this.openai = new OpenAI({
			apiKey: process.env.OPENAI_API_KEY
		})
		this.indexName = process.env.PINECONE_INDEX_NAME || 'default-index'
		this.namespace = process.env.PINECONE_NAMESPACE || 'default-namespace'
	}

	public static getInstance(): RAGService {
		if (!RAGService.instance) {
			RAGService.instance = new RAGService()
		}
		return RAGService.instance
	}

	private async createEmbedding(text: string): Promise<number[]> {
		const response = await this.openai.embeddings.create({
			model: 'text-embedding-ada-002',
			input: text
		})
		return response.data[0].embedding
	}

	async getRelevantContext(query: string): Promise<string | null> {
		try {
			// Get the index instance
			const index = this.pinecone.index(this.indexName).namespace(this.namespace)

			// Create embedding for the query
			const queryEmbedding = await this.createEmbedding(query)

			// Query Pinecone
			const queryResponse = await index.query({
				vector: queryEmbedding,
				topK: 3,
				includeMetadata: true
			})
			console.log(queryResponse)
			if (!queryResponse.matches?.length) {
				return null
			}

			// Extract and format the relevant contexts
			const contexts = queryResponse.matches
				.map(match => (match.metadata as { text: string })?.text || '')
				.filter(text => text.length > 0)
				.join('\n\n')

			return contexts.length > 0 ? contexts : null
		} catch (error) {
			console.error('Error getting relevant context:', error)
			return null
		}
	}

	async enhanceSystemPrompt(originalPrompt: string, userQuery: string): Promise<string> {
		const context = await this.getRelevantContext(userQuery)

		if (!context) {
			return originalPrompt
		}

		return `
      ${originalPrompt}
      
      Context information is below:
      ---------------------
      ${context}
      ---------------------
      Use this context to inform your responses when relevant, but you can also draw from your general knowledge when needed.
    `.trim()
	}

	async ingestDocuments(documents: Array<{ text: string, metadata?: Record<string, any> }>) {
		try {
			const index = this.pinecone.index(this.indexName)

			// Process documents in batches to avoid rate limits
			const batchSize = 100
			for (let i = 0; i < documents.length; i += batchSize) {
				const batch = documents.slice(i, i + batchSize)

				// Create embeddings and prepare records for the batch
				const records = await Promise.all(
					batch.map(async (doc, j) => {
						const embedding = await this.createEmbedding(doc.text)
						return {
							id: `doc_${i + j}`,
							values: embedding,
							metadata: {
								text: doc.text,
								...doc.metadata
							}
						}
					})
				)

				// Upsert the batch
				await index.upsert(records)
			}

			return { success: true }
		} catch (error) {
			console.error('Error ingesting documents:', error)
			return { success: false, error }
		}
	}
}

export const ragService = RAGService.getInstance()