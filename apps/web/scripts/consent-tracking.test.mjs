import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(new URL('../src/features/consent/consentTracking.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function fixture(saved = {}, failStorage = false, failWrites = false) {
  const scripts = []; const store = new Map(Object.entries(saved)); const events = new Map(); const effects = []; let reloads = 0;
  const cookies = new Map([['_ga', 'old'], ['_ga_48RNYS7P4C', 'old'], ['_fbp', 'old'], ['session', 'keep']]);
  const window = { location: { hostname: 'filipinodama.com', origin: 'https://filipinodama.com', pathname: '/', reload() { reloads++; } },
    localStorage: { getItem(key) { if (failStorage) throw Error('disabled'); return store.get(key) ?? null; }, setItem(key, value) { if (failStorage || failWrites) throw Error('disabled'); store.set(key,value); }, removeItem(key) { if (failStorage || failWrites) throw Error('disabled'); store.delete(key); } },
    addEventListener(name, fn) { events.set(name,fn); }, removeEventListener(name) { events.delete(name); }, dispatchEvent(event) { events.get(event.type)?.(event); } };
  const document = { head: { appendChild(script) { scripts.push(script.src); } }, createElement() { return {}; }, get cookie() { return [...cookies].map(([k,v]) => `${k}=${v}`).join('; '); }, set cookie(value) { cookies.delete(value.split('=')[0]); } };
  const exports = {};
  vm.runInNewContext(compiled, { exports, window, document, Event: class { constructor(type) { this.type=type; } }, require(name) { if (name==='react') return { useEffect(fn) { effects.push(fn); } }; if (name==='react-router-dom') return { useLocation() { return {pathname:window.location.pathname}; } }; throw Error(name); } });
  const mount = () => { exports.ConsentTracking(); effects.splice(0).forEach(fn => fn()); };
  return { api: exports, window, store, scripts, cookies, mount, reloads: () => reloads };
}
for (const saved of [{}, {'fdr.consent':'all'}, {'fdr.consent.v2':'necessary'}]) {
  const f=fixture(saved); f.mount(); assert.equal(f.scripts.length,0); assert.equal(f.cookies.has('_ga'),false); assert.equal(f.cookies.get('session'),'keep');
  if (!saved['fdr.consent.v2']) assert.equal(f.api.readConsent(),null);
}
const f=fixture(); f.mount(); f.api.saveConsent('all'); assert.equal(f.scripts.length,1); assert.equal(f.store.get('fdr.consent.v2'),'all');
const views=()=> f.window.dataLayer.filter(entry=>entry[0]==='event' && entry[1]==='page_view');
assert.equal(views().length,1); f.mount(); f.api.saveConsent('all'); assert.equal(views().length,1);
f.window.location.pathname='/learn'; f.mount(); assert.equal(views().length,2); assert.equal(f.scripts.length,1);
f.api.saveConsent('necessary'); assert.equal(f.reloads(),1); assert.equal(f.store.get('fdr.consent.v2'),'necessary');
f.window.location.pathname='/privacy'; f.mount(); assert.equal(views().length,2); assert.equal(f.cookies.get('session'),'keep');
const privateMode=fixture({},true); privateMode.mount(); privateMode.api.saveConsent('all'); assert.equal(privateMode.scripts.length,1); privateMode.api.saveConsent('necessary'); assert.equal(privateMode.api.readConsent(),'necessary'); assert.equal(privateMode.reloads(),0); assert.equal(privateMode.window['ga-disable-G-48RNYS7P4C'],true);
privateMode.api.saveConsent('all'); assert.equal(privateMode.window.dataLayer.filter(e=>e[0]==='consent' && e[1]==='update').at(-1)[2].analytics_storage,'granted'); assert.equal(privateMode.scripts.length,1);
const stale=fixture({'fdr.consent.v2':'all'},false,true); stale.mount(); stale.api.saveConsent('necessary'); stale.window.location.pathname='/learn'; stale.mount(); assert.equal(stale.api.readConsent(),'necessary'); assert.equal(stale.window['ga-disable-G-48RNYS7P4C'],true); assert.equal(stale.window.dataLayer.filter(e=>e[0]==='event').length,1); assert.equal(stale.reloads(),0);
const secret=fixture({'fdr.consent.v2':'all'}); secret.window.location.pathname='/reset-password'; secret.window.location.search='?token=secret'; secret.mount(); assert.equal(secret.scripts.length,0);
const query=fixture({'fdr.consent.v2':'all'}); query.window.location.search='?email=private'; query.mount(); assert.equal(query.scripts.length,0);
const restored=fixture({'fdr.consent.v2':'all'}); restored.mount(); assert.equal(restored.scripts.length,1); restored.window.location.pathname='/profile'; restored.mount(); assert.equal(restored.window['ga-disable-G-48RNYS7P4C'],true); assert.equal(restored.window.dataLayer.filter(e=>e[0]==='event').length,1);
let reopened=false; restored.window.addEventListener('fdr:consent-settings',()=>reopened=true); restored.api.openConsentSettings(); assert.equal(reopened,true);
assert(!readFileSync(new URL('../index.html',import.meta.url),'utf8').match(/googletagmanager|facebook\.com\/tr|fbevents/));
console.log('Consent tests passed: fresh and legacy deny, necessary only, opt-in, persisted opt-in, SPA deduplication, withdrawal, cookie isolation, storage failure, settings event, no shell trackers.');
