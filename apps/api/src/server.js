import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createYoga, createSchema } from 'graphql-yoga';
import { typeDefs, resolvers } from './schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, '../../web');
const PORT = process.env.PORT || 8787;

const yoga = createYoga({ schema: createSchema({ typeDefs, resolvers }), graphqlEndpoint: '/graphql', maskedErrors: false });

const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.png':'image/png', '.svg':'image/svg+xml', '.ico':'image/x-icon' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/healthz') { res.writeHead(200, {'content-type':'application/json'}); return res.end(JSON.stringify({ok:true, service:'aiseki', ts:new Date().toISOString()})); }
  if (url.pathname.startsWith('/graphql')) return yoga(req, res);
  // static PWA
  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.join(WEB_DIR, p);
  if (!file.startsWith(WEB_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, {'content-type':'text/plain'}); return res.end('not found');
  }
  res.writeHead(200, {'content-type': MIME[path.extname(file)] || 'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
});
server.listen(PORT, () => console.log(`AIseki listening on http://localhost:${PORT}  graphql=/graphql  healthz=/healthz`));
