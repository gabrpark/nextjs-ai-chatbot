// lib/rag-service.ts
import { Pinecone } from '@pinecone-database/pinecone'
import OpenAI from 'openai'

interface RetrievedDocument {
	text: string;
	score: number;
	metadata?: Record<string, any>;
}

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

	private async rerank(documents: RetrievedDocument[], query: string): Promise<RetrievedDocument[]> {
		const rerankedDocs = await Promise.all(
			documents.map(async (doc) => {
				const completion = await this.openai.chat.completions.create({
					model: "gpt-3.5-turbo",
					messages: [
						{
							role: "system",
							content: "Rate the relevance of this document to the query on a scale of 0-10."
						},
						{
							role: "user",
							content: `Query: ${query}\nDocument: ${doc.text}\n\nProvide only the numerical score.`
						}
					],
					temperature: 0,
				});

				const score = parseFloat(completion.choices[0].message.content || "0");
				return { ...doc, score: score };
			})
		);

		return rerankedDocs.sort((a, b) => b.score - a.score);
	}

	async getRelevantContext(query: string): Promise<string | null> {
		try {
			const index = this.pinecone.index(this.indexName).namespace(this.namespace);
			const queryEmbedding = await this.createEmbedding(query);

			// Retrieve more initial matches for re-ranking
			const queryResponse = await index.query({
				vector: queryEmbedding,
				topK: 5, // Increased from 3 to get more candidates for re-ranking
				includeMetadata: true
			});

			if (!queryResponse.matches?.length) {
				return null;
			}

			// Convert matches to RetrievedDocument format
			const documents: RetrievedDocument[] = queryResponse.matches
				.map(match => ({
					text: (match.metadata as { text: string })?.text || '',
					score: match.score ?? 0,
					metadata: match.metadata as Record<string, any>
				}))
				.filter(doc => doc.text.length > 0);

			// Rerank documents
			const rerankedDocs = await this.rerank(documents, query);
			console.log('Reranked documents:', rerankedDocs);

			// Dynamic context window selection
			const MAX_CONTEXT_LENGTH = 4000;
			let contextLength = 0;
			const selectedDocs: RetrievedDocument[] = [];

			for (const doc of rerankedDocs) {
				if (doc.score < 5) break; // Quality threshold
				if (contextLength + doc.text.length > MAX_CONTEXT_LENGTH) break;

				selectedDocs.push(doc);
				contextLength += doc.text.length;
			}

			// Format selected contexts with relevance scores
			const contexts = selectedDocs
				.map(doc => `[Relevance: ${doc.score.toFixed(1)}]\n${doc.text}`)
				.join('\n\n');

			return contexts.length > 0 ? contexts : null;
		} catch (error) {
			console.error('Error getting relevant context:', error);
			return null;
		}
	}

	async enhanceSystemPrompt(originalPrompt: string, userQuery: string): Promise<string> {
		const context = await this.getRelevantContext(userQuery);

		if (!context) {
			return originalPrompt;
		}

		return `
      ${originalPrompt}
      
      Context information is below, ordered by relevance:
      ---------------------
      ${context}
      ---------------------
      Use this context to inform your responses when relevant, but you can also draw from your general knowledge when needed.
      If using information from the context, indicate which parts you used.
    `.trim();
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