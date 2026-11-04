import http from 'node:http';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';

const root = path.resolve('dist');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml',
  '.json':'application/json','.png':'image/png','.mp4':'video/mp4','.vtt':'text/vtt; charset=utf-8',
  '.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation'};

http.createServer(async (req, res) => {
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405, {Allow:'GET, HEAD'}); res.end(); return; }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) throw Error('Outside public root');
    const stat = await fs.stat(file);
    if (!stat.isFile()) throw Error('Not a file');
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    let start=0, end=stat.size-1, code=200;
    if (path.extname(file) === '.mp4') {
      res.setHeader('Accept-Ranges','bytes');
      if (req.headers.range) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
        start = match ? Number(match[1]) : -1;
        end = match?.[2] ? Math.min(Number(match[2]),stat.size-1) : stat.size-1;
        if (!Number.isSafeInteger(start) || start<0 || start>end || !Number.isSafeInteger(end)) {
          res.writeHead(416,{'Content-Range':'bytes */'+stat.size});res.end();return;
        }
        code=206;res.setHeader('Content-Range','bytes '+start+'-'+end+'/'+stat.size);
      }
    }
    res.writeHead(code,{'Content-Length':Math.max(0,end-start+1)});
    if (req.method==='HEAD' || !stat.size) { res.end(); return; }
    createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);
  } catch { if (!res.headersSent) res.writeHead(404); res.end('Not found'); }
}).listen(4187,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4187'));
