/** Local browser acceptance: real engine/tools/DOM; model responses and approval are fixtures. */
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require(process.env.BROWSERONLY_PLAYWRIGHT_MODULE || 'playwright-core')); }
catch { throw new Error('Set BROWSERONLY_PLAYWRIGHT_MODULE to an installed playwright-core module path. No dependencies are installed automatically.'); }
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Mac' }, configurable: true });
globalThis.chrome = { tabs: { query: async () => [{ id: 1 }] } };
const output = await mkdtemp(join(tmpdir(), 'browseronly-native-acceptance-'));
await build({
  stdin: { contents: `export { ExecutionEngine } from './src/agent/ExecutionEngine'; export { ToolManager } from './src/agent/ToolManager'; export { PromptManager } from './src/agent/PromptManager'; export { MemoryManager } from './src/agent/MemoryManager'; export { ErrorHandler } from './src/agent/ErrorHandler'; export { DeepSeekProvider } from './src/models/providers/deepseek'; export { browserClick } from './src/agent/tools/interactionTools'; export { browserControlState } from './src/agent/tools/observationTools'; export { browserExtractFields } from './src/agent/tools/structuredReadTools'; export { workflowPageSnapshot } from './src/workflows/WorkflowPageReader';`, resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'cjs', outfile: join(output, 'tools.cjs'),
  plugins: [{ name: 'fixture-boundaries', setup(builder) {
    builder.onResolve({ filter: /^\.\/utils$/ }, args => args.importer.includes('/src/agent/tools/') ? { path: 'utils', namespace: 'fixture' } : undefined);
    builder.onResolve({ filter: /tokenTrackingService$/ }, () => ({ path: 'tokens', namespace: 'fixture' }));
    builder.onResolve({ filter: /approvalManager$/ }, () => ({ path: 'approval', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'tokens'
      ? 'export const TokenTrackingService={getInstance:()=>({trackInputTokens(){},trackOutputTokens(){}})};'
      : args.path === 'approval' ? 'export const requestApproval=async()=>{globalThis.fixtureApprovals=(globalThis.fixtureApprovals||0)+1;return true;};'
      : 'export const withActivePage=async(page,fn)=>fn(page);export const retryAfterNavigation=async(_page,fn)=>fn();export const installDialogListener=()=>{};export const lastDialog=null;export const resetDialog=()=>{};export const truncate=(value,length=20000)=>value.slice(0,length);export const MAX_RETURN_CHARS=20000;export const MAX_SCREENSHOT_CHARS=500000;export const getCurrentTabId=async()=>undefined;' }));
  } }],
});
const { ExecutionEngine, ToolManager, PromptManager, MemoryManager, ErrorHandler, DeepSeekProvider, browserClick, browserControlState, browserExtractFields, workflowPageSnapshot } = require(join(output, 'tools.cjs'));
const log=console.log;console.log=()=>{};console.debug=()=>{};
(async()=>{
const browser=await chromium.launch({...(process.env.BROWSERONLY_CHROME_PATH ? { executablePath: process.env.BROWSERONLY_CHROME_PATH } : { channel: 'chrome' }), headless:true});
try{
const page=await browser.newPage();
await page.setContent('<base href="https://mail.google.com/"><main hidden>Stale hidden mailbox</main><div style="position:fixed;top:0">Latest inbox message <a href="/mail/u/0/#message-one">Sender</a></div>');
const inboxSnapshot=await page.evaluate(workflowPageSnapshot,{mode:'all',limit:20000});
assert(inboxSnapshot.text.includes('Latest inbox message'));assert(inboxSnapshot.text.includes('https://mail.google.com/mail/u/0/#message-one'));assert(!inboxSnapshot.text.includes('Stale hidden mailbox'));
const mainSnapshot=await page.evaluate(workflowPageSnapshot,{mode:'main',limit:20000});assert(mainSnapshot.text.includes('Latest inbox message'));
log('PASS workflow reader snapshots visible mailbox text without stale/hidden main waits');
await page.setContent(`<button role="checkbox" aria-checked="false" onclick="this.setAttribute('aria-checked','true')">京东物流</button><button id="trigger" aria-expanded="false" onclick="this.setAttribute('aria-expanded','true');document.querySelector('#menu').hidden=false">自营/旗舰</button><div id="menu" role="menu" hidden><button role="menuitemcheckbox" aria-checked="false" onclick="this.setAttribute('aria-checked','true')">京东自营</button><button onclick="document.querySelector('#menu').hidden=true;document.querySelector('#trigger').setAttribute('aria-expanded','false');document.querySelector('#confirmed').hidden=false">确定</button></div><span id="confirmed" hidden>自营筛选已应用</span><button onclick="document.querySelector('#detail').hidden=false">雀巢肽敏舒</button><div id="detail" hidden><button onclick="window.cartCount=(window.cartCount||0)+1;document.querySelector('#cart-status').hidden=false">加入购物车</button><span id="cart-status" hidden>已加入购物车</span></div>`);
const definitions=[browserClick(page),browserControlState(page),browserExtractFields(page)];
const tools=definitions.map(tool=>({name:tool.name,description:tool.description,func:tool.func}));
const manager=new ToolManager(page,tools);
const provider=new DeepSeekProvider({apiKey:'fixture-key',apiModelId:'deepseek-chat'});
const plan=[
 ['browser_control_state',{text:'京东物流'}],
 ['browser_click',{text:'京东物流',verify:{state:'checked',expected:true}}],
 ['browser_click',{text:'自营/旗舰',verify:{state:'expanded',expected:true}}],
 ['browser_click',{role:'menuitemcheckbox',name:'京东自营',scope:'#menu',verify:{state:'checked',expected:true}}],
 ['browser_click',{text:'确定',scope:'#menu',verify:{target:{selector:'#confirmed'},state:'visible',expected:true}}],
 ['browser_click',{text:'雀巢肽敏舒',verify:{target:{selector:'#detail'},state:'visible',expected:true}}],
 ['browser_click',{text:'加入购物车',scope:'#detail',verify:{target:{selector:'#cart-status'},state:'visible',expected:true}},true],
];
let requests=0;let attempts=0;let rateLimited=false;let outcome;const traces=[];const outputs=[];
provider.client={chat:{completions:{create:async options=>{
 attempts++;
 assert(!JSON.stringify(options.messages).includes('MountainCar'));
 if(requests){assert.equal(options.messages.at(-2).reasoning_content,'fixture-reasoning-'+requests);}
 if(requests===1&&!rateLimited){rateLimited=true;const error=new Error('Fixture rate limit');error.status=429;throw error;}
 if(requests){const prior=options.messages.at(-1);assert.equal(prior.role,'tool');assert.equal(JSON.parse(prior.content.split('\n')[0]).ok,true);}
 const item=plan[requests++];
 return (async function*(){yield {choices:[{delta:{reasoning_content:'fixture-reasoning-'+requests}}]};if(item){const [name,input,approval=false]=item;yield {choices:[{delta:{tool_calls:[{index:0,id:'call-'+requests,function:{name,arguments:JSON.stringify({input:JSON.stringify(input),requires_approval:approval})}}]}}]};yield {choices:[{delta:{},finish_reason:'tool_calls'}]};yield {choices:[],usage:{prompt_tokens:10,completion_tokens:5}};}else yield {choices:[{delta:{content:'<finish status="completed">已应用京东物流和自营筛选，打开商品并确认加入购物车。</finish>'}}]};})();
}}}};
const engine=new ExecutionEngine(provider,manager,new PromptManager(tools),new MemoryManager(tools),Object.assign(new ErrorHandler(),{calculateBackoffTime:()=>0}));
await engine.executePrompt('筛选京东物流和京东自营，打开商品并加入购物车',{onLlmOutput:text=>outputs.push(text),onToolOutput:()=>{},onComplete:()=>{},onExecutionOutcome:value=>outcome=value,onToolEvent:value=>traces.push(value)},[{role:'user',content:'Explain MountainCar'},{role:'assistant',content:'MountainCar pending'}],false,'operator');
assert.equal(outcome.status,'completed');assert.equal(traces.length,7);assert(traces.every(event=>event.result.ok));assert.equal(await page.evaluate(()=>window.cartCount),1);assert.equal(globalThis.fixtureApprovals,1);assert.equal(requests,8);assert.equal(attempts,9);assert(!outputs.join('').includes('fixture-reasoning'));assert(!outputs.join('').includes('<tool>'));assert(!outputs.join('').includes('<finish'));
log('PASS native provider → engine → real DOM tools → filter confirmation → product → add cart');log('PASS exactly 7 tool calls / 8 model responses / one approved cart addition');log('PASS old task excluded; native invocation/result history retained; final response has no protocol tags');log('PASS thinking metadata returned unchanged through a 429 retry; no extra cart click');
}finally{await browser.close();await rm(output,{recursive:true,force:true});console.log=log;}
})().catch(error=>{console.error(error);process.exitCode=1;});
