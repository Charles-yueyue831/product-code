import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import ignore from 'ignore';
import { canonicalDir, sensitivePath, safeRead, redact } from './safety.js';
const languages = {'.js':'JavaScript','.mjs':'JavaScript','.cjs':'JavaScript','.jsx':'JavaScript','.ts':'TypeScript','.tsx':'TypeScript','.py':'Python','.go':'Go','.rs':'Rust','.java':'Java','.c':'C','.cpp':'C++','.cs':'C#','.rb':'Ruby','.php':'PHP','.vue':'Vue','.svelte':'Svelte'};
const excluded = new Set(['node_modules','.git','.hg','.svn','dist','build','coverage','vendor','.next','.venv','venv','__pycache__']);
export async function scan(input, config, signal) {
  const root = await canonicalDir(input), files = [], skipped = []; let bytes = 0, entries = 0, truncated = false;
  const visit = async (dir, inherited=[]) => {
    signal?.throwIfAborted();
    const rules = [...inherited];
    try { const text = await safeRead(root, path.posix.join(dir,'.gitignore'), 65536, signal); rules.push({base:dir, matcher:ignore().add(text)}); } catch(e) { if(e.name==='AbortError') throw e; }
    const listing = await fs.opendir(path.join(root,dir));
    for await (const entry of listing) {
      signal?.throwIfAborted();
      if (++entries > config.maxFiles * 20 || files.length >= config.maxFiles || bytes >= config.maxTotalBytes) { truncated=true; break; }
      const rel = path.posix.join(dir,entry.name);
      if (entry.isSymbolicLink() || excluded.has(entry.name) || sensitivePath(rel)) continue;
      if (rules.some(r=>r.matcher.ignores(path.posix.relative(r.base,rel)+(entry.isDirectory()?'/':'')))) continue;
      if (entry.isDirectory()) { if(rel.split('/').length < 30) await visit(rel,rules); continue; }
      if (!entry.isFile()) continue;
      const ext=path.extname(rel), language=languages[ext];
      if (!language && !/^(?:package\.json|README(?:\.md)?|pyproject\.toml|go\.mod|Cargo\.toml|Dockerfile)$/i.test(entry.name)) continue;
      try {
        const raw=await safeRead(root,rel,Math.min(config.maxFileBytes,config.maxTotalBytes-bytes),signal);
        if(raw.includes('\0')) continue;
        bytes+=Buffer.byteLength(raw);
        const text=redact(raw);
        files.push({path:rel,language:language||'Metadata',text,hash:createHash('sha256').update(text).digest('hex')});
      } catch(e) { signal?.throwIfAborted(); skipped.push({file:rel,reason:'读取失败或超过大小限制'}); }
    }
  };
  await visit('');
  files.sort((a,b)=>a.path.localeCompare(b.path));
  let pkg={}; try {pkg=JSON.parse(files.find(f=>f.path==='package.json')?.text||'{}');}catch{}
  return {root,files,skipped,truncated,bytes,project:{name:typeof pkg.name==='string'?pkg.name:path.basename(root),description:typeof pkg.description==='string'?pkg.description:'产品用途尚需结合能力证据确认',languages:[...new Set(files.filter(f=>f.language!=='Metadata').map(f=>f.language))],frameworks:Object.keys({...pkg.dependencies,...pkg.devDependencies}).filter(x=>/^(react|vue|next|express|fastify|koa|@nestjs\/core|svelte)$/.test(x))}};
}
