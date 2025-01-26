import { experimental_wrapLanguageModel as wrapLanguageModel, type LanguageModelV1 } from 'ai'
import { OpenAI } from 'openai'

import { type Model } from '@/lib/model'
import { customMiddleware } from './custom-middleware'

export function customModel(modelName: Model['name']) {
  const openai = new OpenAI()
  return wrapLanguageModel({
    model: (async (params: any) => {
      const completion = await openai.chat.completions.create({
        ...params,
        model: modelName,
      })
      return {
        id: completion.id,
        choices: completion.choices.map(choice => ({
          text: choice.message?.content ?? '',
        })),
      }
    }) as unknown as LanguageModelV1,
    middleware: customMiddleware,
  })
}