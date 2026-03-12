import type { ReactNode } from 'react'

interface InlinePart {
  type: 'text' | 'strong' | 'code' | 'link'
  value: string
  href?: string
}

interface GuideViewProps {
  eyebrow: string
  title: string
  description: string
  markdown: string
}

function renderInline(text: string, keyPrefix: string) {
  const parts: InlinePart[] = []
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g
  let lastIndex = 0
  let matchIndex = 0

  for (const match of text.matchAll(pattern)) {
    const matchText = match[0]
    const index = match.index ?? 0

    if (index > lastIndex) {
      parts.push({
        type: 'text',
        value: text.slice(lastIndex, index),
      })
    }

    if (matchText.startsWith('**')) {
      parts.push({
        type: 'strong',
        value: matchText.slice(2, -2),
      })
    } else if (matchText.startsWith('`')) {
      parts.push({
        type: 'code',
        value: matchText.slice(1, -1),
      })
    } else {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(matchText)
      if (linkMatch) {
        parts.push({
          type: 'link',
          value: linkMatch[1],
          href: linkMatch[2],
        })
      }
    }

    lastIndex = index + matchText.length
    matchIndex += 1
  }

  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      value: text.slice(lastIndex),
    })
  }

  if (parts.length === 0) {
    parts.push({ type: 'text', value: text })
  }

  return parts.map((part, index) => {
    const key = `${keyPrefix}-${matchIndex}-${index}`

    if (part.type === 'strong') {
      return <strong key={key}>{part.value}</strong>
    }

    if (part.type === 'code') {
      return <code key={key}>{part.value}</code>
    }

    if (part.type === 'link' && part.href) {
      return (
        <a key={key} href={part.href} target="_blank" rel="noreferrer">
          {part.value}
        </a>
      )
    }

    return <span key={key}>{part.value}</span>
  })
}

function renderMarkdown(markdown: string) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index].trimEnd()

    if (!line.trim()) {
      index += 1
      continue
    }

    if (line.startsWith('```')) {
      const language = line.slice(3).trim()
      const codeLines: string[] = []
      index += 1

      while (index < lines.length && !lines[index].startsWith('```')) {
        codeLines.push(lines[index])
        index += 1
      }

      index += 1
      blocks.push(
        <pre key={`code-${blocks.length}`} className="guide-view__code">
          <code data-language={language || undefined}>{codeLines.join('\n')}</code>
        </pre>,
      )
      continue
    }

    if (line.startsWith('### ')) {
      blocks.push(
        <h3 key={`h3-${blocks.length}`}>{renderInline(line.slice(4), `h3-${blocks.length}`)}</h3>,
      )
      index += 1
      continue
    }

    if (line.startsWith('## ')) {
      blocks.push(
        <h2 key={`h2-${blocks.length}`}>{renderInline(line.slice(3), `h2-${blocks.length}`)}</h2>,
      )
      index += 1
      continue
    }

    if (line.startsWith('# ')) {
      blocks.push(
        <h1 key={`h1-${blocks.length}`}>{renderInline(line.slice(2), `h1-${blocks.length}`)}</h1>,
      )
      index += 1
      continue
    }

    if (line.startsWith('![')) {
      const imageMatch = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(line)
      if (imageMatch) {
        blocks.push(
          <figure key={`img-${blocks.length}`} className="guide-view__figure">
            <img src={imageMatch[2]} alt={imageMatch[1]} />
            {imageMatch[1] ? <figcaption>{imageMatch[1]}</figcaption> : null}
          </figure>,
        )
      }
      index += 1
      continue
    }

    if (/^[-*] /.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^[-*] /.test(lines[index].trim())) {
        items.push(lines[index].trim().slice(2))
        index += 1
      }

      blocks.push(
        <ul key={`ul-${blocks.length}`}>
          {items.map((item, itemIndex) => (
            <li key={`ul-item-${itemIndex}`}>{renderInline(item, `ul-${blocks.length}-${itemIndex}`)}</li>
          ))}
        </ul>,
      )
      continue
    }

    if (/^\d+\. /.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\d+\. /.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\. /, ''))
        index += 1
      }

      blocks.push(
        <ol key={`ol-${blocks.length}`}>
          {items.map((item, itemIndex) => (
            <li key={`ol-item-${itemIndex}`}>{renderInline(item, `ol-${blocks.length}-${itemIndex}`)}</li>
          ))}
        </ol>,
      )
      continue
    }

    const paragraphLines = [line.trim()]
    index += 1

    while (
      index < lines.length &&
      lines[index].trim() &&
      !lines[index].startsWith('#') &&
      !lines[index].startsWith('![') &&
      !lines[index].startsWith('```') &&
      !/^[-*] /.test(lines[index].trim()) &&
      !/^\d+\. /.test(lines[index].trim())
    ) {
      paragraphLines.push(lines[index].trim())
      index += 1
    }

    blocks.push(
      <p key={`p-${blocks.length}`}>
        {renderInline(paragraphLines.join(' '), `p-${blocks.length}`)}
      </p>,
    )
  }

  return blocks
}

export function GuideView({ eyebrow, title, description, markdown }: GuideViewProps) {
  return (
    <section className="guide-view">
      <div className="guide-view__header">
        <p className="panel__eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>

      <article className="guide-view__content">{renderMarkdown(markdown)}</article>
    </section>
  )
}
