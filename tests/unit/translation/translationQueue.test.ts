import { TranslationQueue } from '../../../src/translation/translationQueue';

describe('TranslationQueue', () => {
  it('splits work by item and character limits', async () => {
    const calls: number[] = [];
    const queue = new TranslationQueue(async (request) => { calls.push(request.units.length); return request.units.map(u => ({ sourceId:u.sourceId, translatedText:u.text+'!', sourceTextHash:'x', state:'translated' as const, targetLanguage:'zh', engine:'ollama' as const, cacheVersion:1 })); }, 5, 2);
    const req:any={tabId:1,pageSessionId:'s',requestId:'r',targetLanguage:'zh',engine:'ollama',units:[{sourceId:'1',text:'aa'},{sourceId:'2',text:'bb'},{sourceId:'3',text:'cc'}]};
    const result=await queue.enqueue(req);
    expect(result).toHaveLength(3); expect(calls).toEqual([2,1]);
  });
  it('drops cancelled scope results', async () => {
    const queue = new TranslationQueue(async (request) => request.units.map(u => ({sourceId:u.sourceId,translatedText:'x',sourceTextHash:'x',state:'translated' as const,targetLanguage:'zh',engine:'ollama' as const,cacheVersion:1})));
    queue.cancel('s');
    expect(await queue.enqueue({tabId:1,pageSessionId:'s',requestId:'r',targetLanguage:'zh',engine:'ollama',units:[{sourceId:'1',text:'a'}]} as any)).toEqual([]);
  });

  it('micro-batches independent paragraph requests while resolving each caller separately', async () => {
    const calls: string[][] = [];
    const queue = new TranslationQueue(async (request) => {
      calls.push(request.units.map(unit => unit.sourceId));
      return request.units.map(unit => ({sourceId:unit.sourceId,translatedText:`${unit.text}!`,sourceTextHash:'x',state:'translated' as const,targetLanguage:'zh',engine:'ollama' as const,cacheVersion:1}));
    }, 5000, 12, 5);
    const base:any={tabId:1,pageSessionId:'s',targetLanguage:'zh',engine:'ollama'};

    const [first, second] = await Promise.all([
      queue.enqueue({...base,requestId:'r1',units:[{sourceId:'1',text:'one'}]}),
      queue.enqueue({...base,requestId:'r2',units:[{sourceId:'2',text:'two'}]}),
    ]);

    expect(calls).toEqual([['1','2']]);
    expect(first[0].sourceId).toBe('1');
    expect(second[0].sourceId).toBe('2');
  });

  it('resolves a completed batch before the rest of the page', async () => {
    const releases: Array<(value: any[]) => void> = [];
    const queue = new TranslationQueue((request) => new Promise(resolve => {
      releases.push((results) => resolve(results));
    }), 5000, 2, 5);
    const base:any={tabId:1,pageSessionId:'s',targetLanguage:'zh',engine:'ollama'};
    let tailSettled = false;
    const first = queue.enqueue({...base,requestId:'r1',units:[{sourceId:'1',text:'one'}]});
    const second = queue.enqueue({...base,requestId:'r2',units:[{sourceId:'2',text:'two'}]});
    const tail = queue.enqueue({...base,requestId:'r3',units:[{sourceId:'3',text:'three'}]}).finally(() => { tailSettled = true; });

    releases[0]([
      {sourceId:'1',translatedText:'一',sourceTextHash:'x',state:'translated',targetLanguage:'zh',engine:'ollama',cacheVersion:1},
      {sourceId:'2',translatedText:'二',sourceTextHash:'x',state:'translated',targetLanguage:'zh',engine:'ollama',cacheVersion:1},
    ]);
    await expect(first).resolves.toHaveLength(1);
    await expect(second).resolves.toHaveLength(1);
    expect(tailSettled).toBe(false);

    await new Promise(resolve => setTimeout(resolve, 10));
    releases[1]([{sourceId:'3',translatedText:'三',sourceTextHash:'x',state:'translated',targetLanguage:'zh',engine:'ollama',cacheVersion:1}]);
    await tail;
  });
});
