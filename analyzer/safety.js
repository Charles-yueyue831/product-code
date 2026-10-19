import fs from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';
export const inside = (root, target) => target === root || (!path.relative(root, target).startsWith('..' + path.sep) && path.relative(root, target) !== '..' && !path.isAbsolute(path.relative(root, target)));
export const sensitivePath = p => /(?:^|\/)(?:\.env(?:\..*)?|\.npmrc|\.netrc|credentials(?:\..*)?|secrets?(?:\..*)?|id_rsa|id_ed25519|.*\.(?:pem|key|p12|pfx))$/i.test(p) || /(?:^|\/)(?:\.ssh|\.aws|\.git)(?:\/|$)/.test(p);
export function redact(text) {
  return text.replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '[私钥块已隐藏]').split('\n').map(line => /(?:password|passwd|api[_-]?key|secret|access[_-]?token|auth[_-]?token|authorization)\s*[:=]|(?:sk-[a-zA-Z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|AKIA[A-Z0-9]{16}|-----BEGIN .*PRIVATE KEY)/i.test(line) ? '[敏感内容已隐藏]' : line.replace(/(https?:\/\/)[^/\s:@]+:[^/\s@]+@/g, '$1[redacted]@')).join('\n');
}
export async function canonicalDir(input) {
  const absolute = path.resolve(input);
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const st = await fs.lstat(current);
    if (st.isSymbolicLink()) throw new Error('路径不能包含符号链接');
    if (!st.isDirectory()) throw new Error('需要目录路径');
  }
  return fs.realpath(absolute);
}
export async function safeRead(root, rel, maxBytes, signal) {
  signal?.throwIfAborted();
  if (path.isAbsolute(rel) || !inside(root, path.resolve(root, rel)) || sensitivePath(rel)) throw new Error('拒绝读取未授权或敏感路径');
  await canonicalDir(path.dirname(path.join(root, rel)));
  const handle = await fs.open(path.join(root, rel), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maxBytes) throw new Error('文件超过限制或不是普通文件');
    const buffer = Buffer.alloc(Math.min(maxBytes + 1, stat.size + 1));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > maxBytes) throw new Error('文件超过限制');
    signal?.throwIfAborted();
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally { await handle.close(); }
}
