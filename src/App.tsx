import { createEffect, createSignal } from 'solid-js'
import './App.css'
import { Cell } from '@ton/core'
import { Address } from '@ton/core'
import { Buffer } from 'buffer'
import { parseWithPayloads } from '@truecarry/tlb-abi'
import { stringify, parse as parseYaml } from 'yaml'
import { parseUsingBlockTypes } from './BlockParser'

type OutputFormat = 'yaml' | 'json'

const sanitizeObject = (obj: any) => {
  if (obj instanceof Cell) {
    return obj.toBoc().toString('hex')
  }

  if (obj instanceof Address) {
    return obj.toString()
  }

  if (obj instanceof Buffer) {
    return obj.toString('hex')
  }

  if (typeof obj === 'object' && obj !== null) {
    const sanitized: any = {}
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        sanitized[key] = sanitizeObject(obj[key])
      }
    }
    return sanitized
  }

  if (typeof obj === 'bigint') {
    return obj.toString()
  }

  if (typeof obj === 'function') {
    return undefined
  }

  return obj
}

function App() {
  const [input, setInput] = createSignal('')
  const [output, setOutput] = createSignal('')
  const [error, setError] = createSignal('')
  const [isLoading, setIsLoading] = createSignal(false)
  const [format, setFormat] = createSignal<OutputFormat>('yaml')

  const formatOutput = (data: any) => {
    if (format() === 'json') {
      return JSON.stringify(data, null, 2)
    }
    return stringify(data)
  }

  const handleParse = (input: string) => {
    if (!input.trim()) {
      setError('Please enter a cell to parse')
      return
    }

    setIsLoading(true)
    setError('')
    setOutput('')

    try {
      let cell: Cell | undefined
      try {
        cell = Cell.fromBase64(input)
      } catch (e) {
        // Try hex format if base64 fails
      }
      if (!cell) {
        try {
          cell = Cell.fromBoc(Buffer.from(input, 'hex'))[0]
        } catch (e) {
          setError('Invalid cell format. Please provide a valid base64 or hex encoded cell.')
          return
        }
      }

      let parsed: any
      try {
        parsed = parseWithPayloads(cell.beginParse())
      } catch (e) {
        console.error(e)
      }

      if (!parsed) {
        try {
          parsed = parseUsingBlockTypes(cell)
        } catch (e) {
          console.error(e)
        }
      }
        
      if (parsed) {
        const sanitized = sanitizeObject(parsed)
        setOutput(formatOutput(sanitized))
      } else {
        setOutput(cell.toString())
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse cell')
    } finally {
      setIsLoading(false)
    }
  }

  createEffect(() => {
    handleParse(input())
  })

  return (
    <div class="container">
      <header>
        <h1>TON Cell ABI Viewer</h1>
        <p class="subtitle">Parse and view TON smart contract cells in a human-readable format</p>
      </header>

      <main>
        <section class="input-section">
          <div class="input-header">
            <h2>Input Cell</h2>
            <div class="format-info">
              <span class="format-badge">Base64</span>
              <span class="format-badge">Hex</span>
            </div>
          </div>
          
          <div class="input-group">
            <textarea
              value={input()}
              onInput={(e) => setInput(e.currentTarget.value)}
              placeholder="Paste your cell here (base64 or hex format)..."
              rows="5"
              disabled={isLoading()}
            />
            {/* <div class="button-group">
              <button 
                onClick={handleParse} 
                disabled={isLoading() || !input().trim()}
                class={isLoading() ? 'loading' : ''}
              >
                {isLoading() ? 'Parsing...' : 'Parse Cell'}
              </button>
              <button 
                onClick={handleClear}
                class="secondary"
                disabled={isLoading()}
              >
                Clear
              </button>
            </div> */}
          </div>
        </section>
        
        {error() && (
          <section class="error-section">
            <div class="error">
              <span class="error-icon">⚠️</span>
              {error()}
            </div>
          </section>
        )}
        
        {output() && (
          <section class="output-section">
            <div class="output-header">
              <div class="output-header-content">
                <h2>Parsed Result</h2>
                <div class="format-selector">
                  <button 
                    class={`format-button ${format() === 'yaml' ? 'active' : ''}`}
                    onClick={() => {
                      setFormat('yaml')
                      const parsed = JSON.parse(output().startsWith('{') ? output() : JSON.stringify(parseYaml(output())))
                      setOutput(formatOutput(parsed))
                    }}
                  >
                    YAML
                  </button>
                  <button 
                    class={`format-button ${format() === 'json' ? 'active' : ''}`}
                    onClick={() => {
                      setFormat('json')
                      const parsed = JSON.parse(output().startsWith('{') ? output() : JSON.stringify(parseYaml(output())))
                      setOutput(formatOutput(parsed))
                    }}
                  >
                    JSON
                  </button>
                </div>
              </div>
              
              <div class="copy-button" onClick={() => navigator.clipboard.writeText(output())}>
                Copy to Clipboard
              </div>
            </div>
            <div class="output-container">
              <code
                class="output-textarea"
              >
                <pre>
                  {output()}
                </pre>
              </code>
            </div>
          </section>
        )}
      </main>

      <footer>
        <p>Built with @ton/core, @truecarry/tlb-abi and SolidJS</p>
      </footer>
    </div>
  )
}

export default App
