export type SampleKind = 'Word' | 'Sentence' | 'Paragraph' | 'Code' | 'Multilingual' | 'Custom';

export interface TextSample {
  id: string;
  kind: SampleKind;
  text: string;
}

/** Predefined samples chosen to show how token counts vary with length, script and structure. */
export const PREDEFINED_SAMPLES: TextSample[] = [
  { id: 'word-hello', kind: 'Word', text: 'Hello' },
  { id: 'word-long', kind: 'Word', text: 'Antidisestablishmentarianism' },
  {
    id: 'sentence-fox',
    kind: 'Sentence',
    text: 'The quick brown fox jumps over the lazy dog.',
  },
  {
    id: 'sentence-question',
    kind: 'Sentence',
    text: 'How many tokens does it take to ask a simple question?',
  },
  {
    id: 'paragraph-tokens',
    kind: 'Paragraph',
    text:
      'Large language models read text as tokens rather than characters or words. ' +
      'A token can be a whole word, part of a word, or a single punctuation mark, ' +
      'so the same idea can cost a different number of tokens depending on how it is written.',
  },
  {
    id: 'code-fn',
    kind: 'Code',
    text: 'function add(a: number, b: number): number {\n  return a + b;\n}',
  },
  {
    id: 'multi-greetings',
    kind: 'Multilingual',
    text: 'Bonjour le monde! こんにちは世界! नमस्ते दुनिया! ¡Hola mundo!',
  },
  { id: 'emoji', kind: 'Sentence', text: 'Tokens 🚀✨ can include emoji too 🎉' },
];
