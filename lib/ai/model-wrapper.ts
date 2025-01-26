import { experimental_wrapLanguageModel as wrapLanguageModel } from 'ai'
import { OpenAI } from 'openai'
import { Message } from 'ai'

import { type Model } from '@/lib/model'
import { customMiddleware } from './custom-middleware'

export function customModel(modelName: Model['name']) {
  return wrapLanguageModel({
    model: new OpenAI().chat.completions.create,
    middleware: customMiddleware,
  })
}