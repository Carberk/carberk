const fs = require('node:fs');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const ts = require(require.resolve('typescript', {paths:[process.cwd()+'/apps/api']}));
const root = 'docs/evidence/issue-897/a-06-combined-ci-20261030/prepared-source-boundary-20261103';
const base = '1149953c1237ea362509db7dddbed29c60395d0a';
const candidate = '7a3333dadf8dd668c9b7df886d37988496839598';
const map = JSON.parse(fs.readFileSync(root+'/case-map.json','utf8'));
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const strip = n => {while(ts.isAsExpression(n)||ts.isParenthesizedExpression(n)) n=n.expression; return n;};
function declarations(path, code) {
  const source = ts.createSourceFile(path,code,ts.ScriptTarget.Latest,true);
  const tests=[];
  function walk(node) {
    if (ts.isCallExpression(node) && node.arguments.length >= 2 && ts.isStringLiteral(node.arguments[0])) {
      let table=null;
      const ex=node.expression;
      const isIt=ts.isIdentifier(ex)&&ex.text==='it';
      const isEach=ts.isCallExpression(ex)&&ts.isPropertyAccessExpression(ex.expression)&&ex.expression.expression.getText(source)==='it'&&ex.expression.name.text==='each';
      if (isIt||isEach) {
        if(isEach) table=strip(ex.arguments[0]);
        const body=node.arguments[1];
        const assertions=[];
        function scan(n) {
          if (ts.isExpressionStatement(n)&&/\bexpect\s*\(/.test(n.getText(source))) assertions.push({line:source.getLineAndCharacterOfPosition(n.getStart(source)).line+1,text:n.getText(source)});
          ts.forEachChild(n,scan);
        }
        scan(body);
        tests.push({title:node.arguments[0].text,line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,expanded_cases:table&&ts.isArrayLiteralExpression(table)?table.elements.length:1,parameter_table:table?table.getText(source):null,assertions,placeholder:/feasibilityStop\(/.test(body.getText(source)),body_sha256:hash(body.getText(source)),body:body.getText(source)});
      }
    }
    ts.forEachChild(node,walk);
  }
  walk(source);
  return {path,sha256:hash(code),declarations:tests,expanded_cases:tests.reduce((a,t)=>a+t.expanded_cases,0)};
}
const originals=new Map(), replacements=new Map();
for(const c of map.cases) {
  if(!originals.has(c.source_path)) originals.set(c.source_path,declarations(c.source_path,cp.execFileSync('git',['show',base+':'+c.source_path],{encoding:'utf8'})));
  if(!replacements.has(c.target_path)) replacements.set(c.target_path,declarations(c.target_path,cp.execFileSync('git',['show',candidate+':'+c.target_path],{encoding:'utf8'})));
}
function titleMatches(t,s) { const escaped=t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/%[sj]/g,'.*'); return new RegExp('^'+escaped+'$').test(s); }
const cases=map.cases.map(c=>{
 const o=originals.get(c.source_path).declarations.find(t=>titleMatches(t.title,c.scenario));
 const n=replacements.get(c.target_path).declarations.find(t=>titleMatches(t.title,c.scenario));
 return {id:c.id,scenario:c.scenario,baseline:c.baseline,source_path:c.source_path,target_path:c.target_path,original_declaration:o?{title:o.title,line:o.line,assertions:o.assertions}:null,replacement_declaration:n?{title:n.title,line:n.line,assertions:n.assertions,placeholder:n.placeholder}:null,equivalence:'NOT_PROVEN',reason:!n?'unmapped replacement':n.placeholder?'Original assertions replaced by an unconditional feasibilityStop placeholder. The error is not a lawful-state proof.':'Fixture and oracle changes have not been validated; see admission-gaps.json.'};
});
const unitPaths=['src/modules/identity/infrastructure/PrismaStaffAuthority.spec.ts','src/modules/identity/presentation/StaffAuthorityHttp.spec.ts','src/modules/identity/infrastructure/IdentityAuthorityPrepared.spec.ts','src/modules/identity/infrastructure/DiagnosticMaterialPrepared.spec.ts','src/modules/identity/infrastructure/DiagnosticReportsPrepared.spec.ts'];
const unchanged=unitPaths.map(rel=>{const p='apps/api/'+rel;const a=cp.execFileSync('git',['show',base+':'+p]);const b=fs.readFileSync(p);return {path:p,base_sha256:hash(a),current_sha256:hash(b),byte_equal:a.equals(b)};});
const report={status:'FAIL_ADMISSION_NOT_CODE_READY',created_at:new Date().toISOString(),base,source_commit:candidate,counts:{original_cases:[...originals.values()].reduce((a,x)=>a+x.expanded_cases,0),replacement_declared_cases:[...replacements.values()].reduce((a,x)=>a+x.expanded_cases,0),replacement_placeholder_cases:[...replacements.values()].reduce((a,x)=>a+x.declarations.filter(t=>t.placeholder).reduce((b,t)=>b+t.expanded_cases,0),0),mapped_original_cases:cases.filter(x=>x.original_declaration&&x.replacement_declaration).length,equivalence_proven_cases:0,unchanged_selected_cases_expected:168,combined_required:224,runtime_cases_executed:0},cases,originals:[...originals.values()],replacements:[...replacements.values()],unchanged};
fs.writeFileSync(root+'/assertion-equivalence.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,counts:report.counts,unmapped:cases.filter(c=>!c.original_declaration||!c.replacement_declaration).map(c=>c.id),unchanged:unchanged.every(c=>c.byte_equal)},null,2));
