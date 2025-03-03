// src/hooks/useEngine.ts

import { PdfTeXEngine } from '../latex/PdfTeXEngine.tsx'
import { useAsync } from 'react-async-hook'

export type Engine = PdfTeXEngine
export type EngineName = 'pdftex' | 'xetex' | 'dvipdfmx'

/**
 * Dynamically loads the engine based on a name or instance.
 */
export async function makeEngine(engineOrName: Engine | EngineName): Promise<Engine> {
  let engine: Engine
  switch (engineOrName) {
    case 'pdftex': {
      const { PdfTeXEngine } = await import('../latex/PdfTeXEngine.tsx')
      engine = new PdfTeXEngine()
      console.log('engine', JSON.stringify(engine))
      break
    }
    case 'xetex': {
    //   const { XeTeXEngine } = await import('../SwiftLatex/XeTeXEngine')
    //   engine = new XeTeXEngine()
    throw new Error('XeTeXEngine is not available')
      break
    }
    case 'dvipdfmx': {
    //   const { DvipdfmxEngine } = await import('../SwiftLatex/DvipdfmxEngine')
    //   engine = new DvipdfmxEngine()
    throw new Error('DvipdfmxEngine is not available')
      break
    }
    default:
      engine = engineOrName as Engine
  }
  await engine.loadEngine()
  console.log('engine', JSON.stringify(engine))
  return engine
}

/**
 * Custom hook to create and return the engine instance.
 * @param engineArg Either an engine instance or one of the engine names.
 */
export function useEngine(engineArg: Engine | EngineName = 'pdftex') {
  // useAsync will call makeEngine() and provide the result and any error.
  const { result: engine, error } = useAsync(() => makeEngine(engineArg), [engineArg])
  return { engine, error }
}
