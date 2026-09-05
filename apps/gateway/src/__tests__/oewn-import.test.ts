import { describe, expect, it } from 'bun:test';
import { parseOewnXml } from '../scripts/import-oewn.js';

describe('OEWN importer', () => {
  it('flattens lexical entries and resolves their synset definitions', () => {
    const entries = parseOewnXml(`
      <LexicalResource>
        <Lexicon>
          <LexicalEntry id="oewn-example-n">
            <Lemma writtenForm="example" partOfSpeech="n"/>
            <Sense id="oewn-example-n-01" synset="oewn-00000001-n"/>
          </LexicalEntry>
          <Synset id="oewn-00000001-n" partOfSpeech="n"><Definition>a representative form</Definition></Synset>
        </Lexicon>
      </LexicalResource>
    `);
    expect(entries).toEqual([
      expect.objectContaining({
        id: 'oewn-example-n',
        headword: 'example',
        partOfSpeech: 'n',
        meanings: ['a representative form'],
      }),
    ]);
  });
});
