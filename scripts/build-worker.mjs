import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('dist');
const assets={};
async function collect(dir){
 for(const entry of await fs.readdir(dir,{withFileTypes:true})){
  if(entry.name.startsWith('.') || (dir===root && entry.name==='server'))continue;
  const full=path.join(dir,entry.name);
  if(entry.isDirectory())await collect(full);
  else assets['/'+path.relative(root,full).replaceAll('\\','/')]=(await fs.readFile(full)).toString('base64');
 }
}
await collect(root);
const source=(await fs.readFile('worker/index.js','utf8')).replace('/* EMBED_ASSETS */ {}',JSON.stringify(assets));
await fs.mkdir('dist/server',{recursive:true});
await fs.mkdir('dist/.openai',{recursive:true});
await fs.writeFile('dist/server/index.js',source);
await fs.copyFile('.openai/hosting.json','dist/.openai/hosting.json');
console.log('Built Worker with '+Object.keys(assets).length+' embedded public assets ('+Buffer.byteLength(source)+' bytes).');
