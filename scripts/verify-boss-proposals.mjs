// Structural checks for review artifacts, not approval or gameplay integration.
import { readFileSync, statSync } from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
for(const id of ['harrow','bastion','crown']){
  const source=path.join(root,'assets/boss-proposals-v1',id+'.glb');
  const review=path.join(root,'public/reviews/boss-proposals-v1');
  const bytes=readFileSync(source);
  assert(bytes.equals(readFileSync(path.join(review,id+'.glb'))),'Review is not the source GLB');
  assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);
  assert.equal(bytes.readUInt32LE(8),bytes.length);assert(bytes.length>100_000);
  let json,bin;
  for(let offset=12;offset<bytes.length;){const size=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4);assert(offset+8+size<=bytes.length);if(type===0x4e4f534a)json=JSON.parse(bytes.subarray(offset+8,offset+8+size).toString('utf8'));if(type===0x004e4942)bin=bytes.subarray(offset+8,offset+8+size);offset+=size+8;}
  assert(json&&bin);assert.equal(json.asset.version,'2.0');assert.equal(json.materials.length,6);
  assert(json.buffers.every(buffer=>!buffer.uri),'External GLB dependency');
  assert.equal(json.nodes.filter(n=>/^Turret_\d\d_assembly$/.test(n.name)).length,6);
  const seen=new Set();
  function walk(index){assert(!seen.has(index),'Node reused or cycle');seen.add(index);assert(json.nodes[index]);for(const child of json.nodes[index].children||[])walk(child);}
  for(const node of json.scenes[json.scene||0].nodes)walk(node);
  let triangles=0;
  for(const mesh of json.meshes)for(const primitive of mesh.primitives){
    assert.equal(primitive.mode??4,4);const position=json.accessors[primitive.attributes.POSITION],normal=json.accessors[primitive.attributes.NORMAL],indices=json.accessors[primitive.indices];
    assert.equal(position.componentType,5126);assert.equal(position.type,'VEC3');assert.equal(position.count,normal.count);assert.equal(indices.count%3,0);triangles+=indices.count/3;
    for(const accessor of [position,normal]){const view=json.bufferViews[accessor.bufferView],stride=view.byteStride||12,start=(view.byteOffset||0)+(accessor.byteOffset||0);assert(start+(accessor.count-1)*stride+12<=bin.length);for(let i=0;i<accessor.count;i++)for(let axis=0;axis<3;axis++)assert(Number.isFinite(bin.readFloatLE(start+i*stride+axis*4)),'Nonfinite geometry');}
    const view=json.bufferViews[indices.bufferView],size=indices.componentType===5125?4:2,start=(view.byteOffset||0)+(indices.byteOffset||0);assert(start+indices.count*size<=bin.length);for(let i=0;i<indices.count;i++){const value=size===4?bin.readUInt32LE(start+i*size):bin.readUInt16LE(start+i*size);assert(value<position.count,'Index outside vertex array');}
  }
  const metadata=JSON.parse(readFileSync(path.join(review,id+'.json'),'utf8'));
  assert.equal(metadata.glbBytes,bytes.length);assert.equal(metadata.triangles,triangles);assert.equal(metadata.productionReplaced,false);
  assert.equal(metadata.status,'proposal-awaiting-owner-selection');
  assert(statSync(path.join(root,'assets/boss-proposals-v1',id+'.blend')).size>100_000);
  for(const view of ['hero','top']){const png=readFileSync(path.join(review,`${id}-${view}.png`));assert.equal(png.subarray(1,4).toString(),'PNG');assert(png.readUInt32BE(16)>=1280);assert(png.readUInt32BE(20)>=1080);}
  console.log(`${metadata.name}: ${triangles} triangles; ${bytes.length} bytes; six independent turret assemblies; source/review match.`);
}
