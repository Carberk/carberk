const http = require('node:http');
const fs = require('node:fs');
const brand = '11111111-1111-4111-8111-111111111111';
const model = '22222222-2222-4222-8222-222222222222';
const page = (items) => ({items,nextCursor:null,hasMore:false});
http.createServer((req,res) => {
  console.log(req.url);
  const path = req.url.split('?')[0];
  let data = page([]);
  if(path.includes('/catalog/brands') && path.endsWith('/models')) data=page([{id:model,brandId:brand,name:'Camry',slug:'camry'}]);
  else if(path.endsWith('/catalog/brands')) data=page([{id:brand,name:'Toyota',slug:'toyota'}]);
  else if(path.endsWith('/filter-options/models')) data={items:[{modelId:model,totalMatching:10}]};
  else if(path.endsWith('/filter-options/brands')) data={items:[{brandId:brand,totalMatching:10}]};
  else if(path.endsWith('/listings/count')) {
    const state=fs.readFileSync('/tmp/i368-fixture-state','utf8').trim();
    if(state==='loading') return;
    if(state==='error') {res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({code:'SERVICE_UNAVAILABLE',message:'fixture count error'}));return;}
    data={totalMatching:10,priceMinTmt:null,priceMaxTmt:null};
  }
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(data));
}).listen(3098,'127.0.0.1');
