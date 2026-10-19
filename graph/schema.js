import { z } from 'zod';
export const statuses=['confirmed','partial','inferred','unknown'];
export const nodeTypes=['ProductCapability','BusinessDomain','BusinessFlow','ArchitectureLayer','TechnicalModule','API','File','Class','Function','FlowStep'];
const Evidence=z.object({id:z.string(),file:z.string(),line:z.number().int().positive(),endLine:z.number().int().positive(),snippet:z.string(),hash:z.string()});
const Node=z.object({id:z.string(),type:z.enum(nodeTypes),name:z.string(),summary:z.string(),status:z.enum(statuses),evidence:z.array(z.string()),moduleId:z.string().optional(),layer:z.string().optional(),userProblem:z.string().optional(),value:z.string().optional(),mechanism:z.string().optional(),parent:z.string().optional()});
const Edge=z.object({id:z.string(),source:z.string(),target:z.string(),type:z.enum(['Implements','DependsOn','Calls','BelongsTo','Supports','Contains','FlowsTo','RelatedTo']),status:z.enum(statuses),evidence:z.array(z.string()),basis:z.string()});
export const Graph=z.object({schemaVersion:z.literal(1),project:z.object({name:z.string(),description:z.string(),languages:z.array(z.string()),frameworks:z.array(z.string())}),nodes:z.array(Node),edges:z.array(Edge),evidence:z.array(Evidence),warnings:z.array(z.string()),metadata:z.record(z.string(),z.unknown())});
export function validateGraph(raw) {
  const g=Graph.parse(raw), ids=new Set(), evidence=new Map();
  for(const e of g.evidence){if(evidence.has(e.id)||e.endLine<e.line||e.file.startsWith('/')||e.file.split('/').includes('..'))throw new Error('无效证据');evidence.set(e.id,e);}
  for(const n of g.nodes){if(ids.has(n.id))throw new Error('重复节点'); ids.add(n.id);}
  const edgeIds=new Set();
  for(const item of [...g.nodes,...g.edges]) {
    if(item.evidence.some(id=>!evidence.has(id)))throw new Error('证据引用不存在');
    if(item.status==='confirmed'&&!item.evidence.length)throw new Error('已确认结论缺少证据');
    if(item.moduleId&&!ids.has(item.moduleId))throw new Error('模块引用不存在');
    if(item.parent&&!ids.has(item.parent))throw new Error('父节点引用不存在');
  }
  for(const e of g.edges){if(edgeIds.has(e.id)||!ids.has(e.source)||!ids.has(e.target)||e.source===e.target)throw new Error('关系引用无效');edgeIds.add(e.id);}
  return g;
}
