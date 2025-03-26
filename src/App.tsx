import { createEffect, createSignal } from 'solid-js'
import './App.css'
import { Cell, Dictionary } from '@ton/core'
import { Address } from '@ton/core'
import { Buffer } from 'buffer'
import { parseWithPayloads } from '@truecarry/tlb-abi'
import { stringify } from 'yaml'
import { parseUsingBlockTypes } from './BlockParser'
import { ExampleCell } from './Example'

type OutputFormat = 'yaml' | 'json' | 'plain'

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


function parseCell(cell: Cell) {
  let parsed: any
  try {
    parsed = parseWithPayloads(cell.beginParse())
    if (parsed) {
      return parsed
    }
  } catch (e) {
    console.error(e)
  }

  try {
    parsed = parseUsingBlockTypes(cell)
    if (parsed) {
      return parsed
    }
  } catch (e) {
    console.error(e)
  }

  return undefined
} 

export function replaceCellPayload<T>(obj: T): {
  data: T
  hasChanges: boolean
 } {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return {
      data: obj,
      hasChanges: false
    }
  }

  if (obj instanceof Dictionary) {
    const dictData = obj.keys().reduce((acc, key) => {
      acc[key] = obj.get(key)
      return acc
    }, {} as any)
    return {
      data: dictData,
      hasChanges: true
    }
  }

  // Direct JettonPayload case
  if (obj instanceof Cell) {
    try {
      const parsedCell = parseCell(obj)
      if (parsedCell) {
        return {
          data: {
            data: obj.toBoc().toString('hex'),
            parsed: parsedCell,
          } as any,
          hasChanges: true
        }
      }

      return {
        data: obj,
        hasChanges: false
      }
    } catch (e) {
      // Not a valid Jetton payload, leave as is
    }
    return {
      data: obj,
      hasChanges: false
    }
  }
  
  // Array case
  if (Array.isArray(obj)) {
    const replaced = obj.map(item => replaceCellPayload(item))
    const hasChanges = replaced.some(item => item.hasChanges)
    return {
      data: hasChanges 
        ? replaced.map(item => item.data) as any
        : obj,
      hasChanges: hasChanges
    }
  }
  
  // Regular object case
  let hasChanges = false;
  const result = {...obj} as any;
  
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const {data, hasChanges: hasChangesInner} = replaceCellPayload((obj as any)[key]);
      if (hasChangesInner) {
        hasChanges = true;
        result[key] = data;
      }
    }
  }
  
  // Return original object if no changes were made
  return {
    data: hasChanges ? result : obj,
    hasChanges: hasChanges
  }
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
    if (format() === 'plain') {
      if (typeof data === 'string') {
        return data
      }
      return JSON.stringify(data)
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

      let parsed = parseCell(cell)
      while (true) {
        const {data, hasChanges} = replaceCellPayload(parsed)
        parsed = data
        if (!hasChanges) {
          break
        }
      }
      if (parsed) {
        const sanitized = sanitizeObject(parsed)
        setOutput(sanitized)
      } else {
        setOutput(cell.toString())
        setFormat('plain')
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

  const openInJsonHero = () => {
    const jsonData = JSON.stringify(output());
    fetch('https://jsonhero.io/api/create.json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'TON Cell Data',
        content: JSON.parse(jsonData),
        readOnly: false
      })
    }).then(response => {
      if (response.ok) {
        return response.json();
      }
    }).then(data => {
      if (data?.location) {
        window.open(data.location, '_blank');
      }
    });
  }

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

          <div class="example-cell-button-container">
            <button onClick={() => setInput(ExampleCell)} class="example-cell-button">Use example cell</button>
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
                    }}
                  >
                    YAML
                  </button>
                  <button 
                    class={`format-button ${format() === 'json' ? 'active' : ''}`}
                    onClick={() => {
                      setFormat('json')
                    }}
                  >
                    JSON
                  </button>
                  <button 
                    class={`format-button ${format() === 'plain' ? 'active' : ''}`}
                    onClick={() => {
                      setFormat('plain')
                    }}
                  >
                    Plain
                  </button>
                </div>
              </div>
              
              <div class="button-group">
                <div class="copy-button" onClick={() => navigator.clipboard.writeText(output())}>
                  Copy to Clipboard
                </div>
                <div 
                  class="copy-button" 
                  onClick={openInJsonHero}
                >
                  Open in JSONHero
                </div>
              </div>
            </div>
            <div class="output-container">
              <code
                class="output-textarea"
              >
                <pre>
                  {formatOutput(output())}
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
