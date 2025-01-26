import { StreamingTextResponse } from 'ai'
import OpenAI from 'openai'

import { type Model } from '@/lib/model'

const openai = new OpenAI()

export function customModel(modelName: Model['name']) {
  return {
    createStream: async (params: any) => {
      const response = await openai.chat.completions.create({
        ...params,
        model: modelName,
        stream: true,
      }) as any as ReadableStream
      return new StreamingTextResponse(response)
    }
  }
}