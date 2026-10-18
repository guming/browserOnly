import { diffTestSuiteImport, parseTestSuite } from '../../src/testing/protocol';

const valid = `schemaVersion: 1
suiteId: search-suite
name: Search
site: https://example.com
allowedDomains: [example.com]
cases:
  - id: case-1
    name: Empty search
    steps:
      - id: step-1
        act:
          type: fill
          target: { role: textbox, name: Search }
          value: no-match
      - id: step-2
        assert:
          type: text_present
          expected: No results
`;

describe('test suite protocol', () => {
  it('parses and validates a suite without executing YAML tags', () => {
    expect(parseTestSuite(valid).cases[0].id).toBe('case-1');
    expect(() => parseTestSuite(valid.replace('value: no-match', 'value: !!js/function >\n            function () {}'))).toThrow(/Custom YAML tags/);
  });

  it('rejects repeated case ids, unsupported keys, and out-of-domain navigation', () => {
    expect(() => parseTestSuite(valid.replace('  - id: case-1\n    name: Empty search\n    steps:', '  - id: case-1\n    name: First\n    steps:\n      - id: s\n        assert: {type: text_present, expected: x}\n  - id: case-1\n    name: Empty search\n    steps:'))).toThrow(/unique/);
    expect(() => parseTestSuite(valid.replace('type: fill', 'type: evaluate'))).toThrow(/not supported/);
    expect(() => parseTestSuite(valid.replace('type: fill\n          target: { role: textbox, name: Search }\n          value: no-match', 'type: navigate\n          url: https://outside.invalid'))).toThrow(/outside allowedDomains/);
  });

  it('classifies imported cases by stable id and preserves missing entries', () => {
    const suite = parseTestSuite(valid);
    const diff = diffTestSuiteImport(suite, [{ id: 'case-1', definition: { ...suite.cases[0], name: 'Old name' } }, { id: 'case-2', definition: { ...suite.cases[0], id: 'case-2' } }]);
    expect(diff.changed).toHaveLength(1);
    expect(diff.missing.map(item => item.id)).toEqual(['case-2']);
  });

  it('rejects duplicate step IDs and non-boolean privacy flags', () => {
    expect(() => parseTestSuite(valid.replace('      - id: step-2', '      - id: step-1'))).toThrow(/must be unique within the case/);
    expect(() => parseTestSuite(valid.replace('          value: no-match', '          value: no-match\n          sensitive: maybe'))).toThrow(/must be a boolean/);
  });
});
