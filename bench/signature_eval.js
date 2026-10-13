const fs=require('fs');
const html=fs.readFileSync(process.argv[2],'utf8');
const a=html.indexOf('const SIGNATURES = [');
const b=html.indexOf('\n];',a)+3;
const ATTR=new Proxy({}, {get:()=> 'attr'});
const SIGNATURES=eval('(function(){ const ATTR=new Proxy({}, {get:()=> "x"}); '+html.slice(a,b).replace('const SIGNATURES =','return ')+' })()');
const cases=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
let covered=0; const rows=[];
for(const c of cases){
  const txt=c.tail+'\n'+(c.diag||'');
  const hits=SIGNATURES.filter(s=>s.re.test(txt)).map(s=>s.title);
  if(hits.length) covered++;
  rows.push({id:c.id,family:c.family,round:c.round,hits});
}
console.log('signatures:',SIGNATURES.length,' broken cases:',cases.length,' with at least one signature hit:',covered);
const byFam={}; rows.forEach(r=>{const f=r.family; byFam[f]=byFam[f]||{n:0,h:0}; byFam[f].n++; if(r.hits.length) byFam[f].h++;});
console.log(byFam);
if(process.argv[4]==='list') rows.forEach(r=>console.log(r.id.padEnd(32),r.hits.join(' | ')));
