const L=require('./lib.cjs');const m=L.read(L.OUT+'/measurement-decision.json'),sz=L.read(L.OUT+'/sizing.json');
const g2=sz.find(x=>x.range[0]===10&&x.range[1]===20),w20=sz.find(x=>x.range[0]===0&&x.range[1]===20),w40=sz.find(x=>x.range[0]===0&&x.range[1]===40);
const exp={w10_group2:g2,w20_prefix:w20,w40_prefix:w40};
const keyFns=['diagnostic_prepare_source(jsonb)','diagnostic_source_insert_receipt()','diagnostic_source_scope(jsonb)','campaign_preparation_scope(jsonb)','diagnostic_source_read(text,jsonb)','diagnostic_source_add(jsonb,text,jsonb)','diagnostic_source_key_predicate(text,jsonb)','diagnostic_source_scope_before_purge(jsonb)','diagnostic_source_disposal_effects(jsonb)','diagnostic_ownership_disposal_scope(text,timestamp without time zone,text)'];
const rows=[];
for(const x of m.runs){const f=Object.fromEntries(x.functions.map(y=>[y.function,y]));
 const clean=x.hostBefore.busy.length===0&&x.hostAfter.busy.length===0;
 rows.push({round:x.round,name:x.name,ms:Math.round(x.elapsedMs),clean,scope:x.receipt.scope,msPerEntry:+(x.elapsedMs/x.receipt.scope).toFixed(2),hashEqSizing:x.receipt.scopeHash===exp[x.name].scopeHash,keys:x.receipt.keys,effects:x.receipt.effects,
  fn:Object.fromEntries(keyFns.map(k=>[k.split('(')[0],f[k]?[f[k].calls,Math.round(f[k].totalMs),Math.round(f[k].selfMs)]:null]))});}
console.table(rows.map(r=>({round:r.round,name:r.name,ms:r.ms,clean:r.clean,scope:r.scope,msPerEntry:r.msPerEntry,hashEqSizing:r.hashEqSizing})));
for(const r of rows.filter(r=>r.round===1))console.log(r.name,JSON.stringify(r.fn));
const by={};for(const x of m.runs){(by[x.name]??=[]).push(x.receipt.scopeHash+x.receipt.keysHash+x.receipt.effectsHash)}
console.log('repeat-output-equal',Object.fromEntries(Object.entries(by).map(([k,v])=>[k,new Set(v).size===1])));
console.log('top self r1 w40',JSON.stringify(m.runs.find(x=>x.round===1&&x.name==='w40_prefix').functions.slice(0,8).map(y=>[y.function.split('(')[0],y.calls,Math.round(y.selfMs)])));
L.write('analysis.json',rows);
