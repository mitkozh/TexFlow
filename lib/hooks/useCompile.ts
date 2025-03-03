// src/hooks/useCompile.ts
import { useAsyncFn } from 'react-use'
import { PdfTeXEngine } from '../latex/PdfTeXEngine'

function toMap(
  files: Map<string, string> | Record<string, string> | undefined,
): Map<string, string> {
  if (!files) return new Map()
  return files instanceof Map ? files : new Map(Object.entries(files))
}

/**
 * Custom hook to compile LaTeX code using the pdftexengine.
 * Returns a function that you can call to trigger compilation.
 */
export function useCompile() {
  const [state, compile] = useAsyncFn(
    async (
      tex: string,
      mainFileName: string = 'main.tex',
      extraFiles: Map<string, string> | Record<string, string> | undefined,
      engine?: PdfTeXEngine,
    ) => {
      if (!engine) return

      // Wait until the engine is ready.
      while (!engine.isReady()) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      
      // Write the main file and set it as the engine's main file.
      engine.writeMemFSFile(mainFileName, tex)
      engine.setEngineMainFile(mainFileName)

      // Write any extra files.
      for (const [filename, content] of toMap(extraFiles).entries()) {
        engine.writeMemFSFile(filename, content)
      }

      // Compile and check for errors.
      const compileResult = await engine.compileLaTeX()
      if (compileResult.status !== 0) {
        throw new Error(compileResult.log)
      }

      return { pdf: compileResult.pdf, log: compileResult.log }
    },
    []
  )

  return { compile, ...state }
}
