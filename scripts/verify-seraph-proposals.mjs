// Structural review checks, not creative approval or production integration.
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const proposals = [
  ['eclipse', 'Eclipse Seraph'],
  ['talon', 'Vesper Talon'],
  ['halo', 'Reliquary Sentinel'],
];
const finite = (values, label) => assert(Array.isArray(values) && values.every(Number.isFinite), `${label}: nonfinite values`);
const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function multiply(a, b) {
  return Array.from({ length: 16 }, (_, index) => {
    const row = index % 4, column = Math.floor(index / 4);
    return [0, 1, 2, 3].reduce((sum, k) => sum + a[k * 4 + row] * b[column * 4 + k], 0);
  });
}
function transform(node) {
  if (node.matrix) { assert.equal(node.matrix.length, 16); finite(node.matrix, 'Node matrix'); return node.matrix; }
  const t = node.translation ?? [0, 0, 0], q = node.rotation ?? [0, 0, 0, 1], s = node.scale ?? [1, 1, 1];
  assert.equal(t.length, 3); assert.equal(q.length, 4); assert.equal(s.length, 3);
  finite(t, 'Node translation'); finite(q, 'Node rotation'); finite(s, 'Node scale');
  assert(s.every((value) => Math.abs(value) > 1e-8), 'Collapsed node scale');
  assert(Math.abs(q.reduce((sum, value) => sum + value * value, 0) - 1) < 1e-4, 'Invalid node quaternion');
  const [x, y, z, w] = q, [sx, sy, sz] = s;
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    ...t, 1,
  ];
}

function readGlb(bytes) {
  assert(bytes.length > 100_000, 'Missing or implausibly small modeled GLB');
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'Missing glTF signature');
  assert.equal(bytes.readUInt32LE(4), 2, 'Expected GLB version 2');
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'GLB length mismatch');
  let json, bin, offset = 12;
  while (offset < bytes.length) {
    assert(offset + 8 <= bytes.length, 'Truncated GLB chunk header');
    const size = bytes.readUInt32LE(offset), kind = bytes.readUInt32LE(offset + 4);
    assert.equal(size % 4, 0, 'Unaligned GLB chunk');
    assert(offset + 8 + size <= bytes.length, 'Truncated GLB chunk');
    const data = bytes.subarray(offset + 8, offset + 8 + size);
    if (kind === 0x4e4f534a) { assert(!json, 'Duplicate JSON chunk'); json = JSON.parse(data.toString('utf8')); }
    if (kind === 0x004e4942) { assert(!bin, 'Duplicate BIN chunk'); bin = data; }
    offset += size + 8;
  }
  assert(json && bin, 'GLB needs JSON and binary geometry');
  assert.equal(json.asset.version, '2.0');
  assert.equal(json.materials.length, 6, 'Expected six shared authored materials');
  assert.equal(json.buffers.length, 1, 'Expected one embedded geometry buffer');
  assert(!json.buffers[0].uri && (json.images ?? []).every((image) => !image.uri), 'External GLB dependency');
  assert(json.buffers[0].byteLength <= bin.length && bin.length - json.buffers[0].byteLength < 4, 'Embedded buffer length mismatch');
  return { json, bin };
}

function accessorLayout(json, bin, accessor, components, bytesPerComponent) {
  assert(accessor && !accessor.sparse, 'Missing or unsupported sparse accessor');
  assert(Number.isSafeInteger(accessor.count) && accessor.count > 0, 'Empty accessor');
  const view = json.bufferViews[accessor.bufferView];
  assert(view && (view.buffer ?? 0) === 0, 'Missing embedded buffer view');
  const viewStart = view.byteOffset ?? 0, localStart = accessor.byteOffset ?? 0;
  const width = components * bytesPerComponent, stride = view.byteStride ?? width;
  for (const value of [viewStart, localStart, view.byteLength, stride]) assert(Number.isSafeInteger(value) && value >= 0, 'Invalid accessor offset/length');
  assert(stride >= width, 'Accessor stride smaller than element');
  assert.equal(localStart % bytesPerComponent, 0, 'Misaligned accessor');
  assert(viewStart + view.byteLength <= json.buffers[0].byteLength && viewStart + view.byteLength <= bin.length, 'Buffer view exceeds geometry buffer');
  assert(localStart + (accessor.count - 1) * stride + width <= view.byteLength, 'Accessor exceeds its buffer view');
  return { start: viewStart + localStart, stride };
}

for (const [id, name] of proposals) {
  const source = path.join(root, 'assets/seraph-proposals-v1', `${id}.glb`);
  const review = path.join(root, 'public/reviews/seraph-proposals-v1');
  const bytes = readFileSync(source);
  assert(bytes.equals(readFileSync(path.join(review, `${id}.glb`))), `${name}: source/review GLBs differ`);
  const { json, bin } = readGlb(bytes);
  const seen = new Set(), world = new Map();
  function walk(index, parent = identity()) {
    assert(Number.isSafeInteger(index) && json.nodes[index], 'Invalid scene node index');
    assert(!seen.has(index), 'Node reused or hierarchy cycle');
    seen.add(index);
    const node = json.nodes[index], matrix = multiply(parent, transform(node));
    finite(matrix, 'World transform'); world.set(index, matrix);
    if (node.mesh !== undefined) assert(Number.isSafeInteger(node.mesh) && json.meshes[node.mesh], 'Invalid mesh reference');
    for (const child of node.children ?? []) walk(child, matrix);
  }
  const scene = json.scenes[json.scene ?? 0];
  assert(scene?.nodes?.length, 'Missing review scene roots');
  for (const index of scene.nodes) walk(index);
  let triangles = 0;
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
    assert.equal(primitive.mode ?? 4, 4, 'Only triangular meshes are supported');
    assert(Number.isSafeInteger(primitive.material) && json.materials[primitive.material], 'Missing material reference');
    const position = json.accessors[primitive.attributes.POSITION], normal = json.accessors[primitive.attributes.NORMAL];
    for (const accessor of [position, normal]) {
      assert.equal(accessor?.componentType, 5126); assert.equal(accessor.type, 'VEC3');
      const { start, stride } = accessorLayout(json, bin, accessor, 3, 4);
      for (let i = 0; i < accessor.count; i++) for (let axis = 0; axis < 3; axis++) {
        assert(Number.isFinite(bin.readFloatLE(start + i * stride + axis * 4)), 'Nonfinite vertex/normal');
      }
    }
    assert.equal(position.count, normal.count, 'Normal count mismatch');
    const indices = json.accessors[primitive.indices];
    assert.equal(indices?.type, 'SCALAR');
    const size = ({ 5121: 1, 5123: 2, 5125: 4 })[indices.componentType];
    assert(size, 'Unsupported index component type'); assert.equal(indices.count % 3, 0);
    const { start, stride } = accessorLayout(json, bin, indices, 1, size);
    for (let i = 0; i < indices.count; i++) {
      const offset = start + i * stride;
      const index = size === 4 ? bin.readUInt32LE(offset) : size === 2 ? bin.readUInt16LE(offset) : bin.readUInt8(offset);
      assert(index < position.count, 'Index outside vertex array');
    }
    triangles += indices.count / 3;
  }
  const hinges = ['Wing_L_hinge', 'Wing_R_hinge'].map((hingeName) => {
    const matches = json.nodes.map((node, index) => ({ node, index })).filter(({ node }) => node.name === hingeName);
    assert.equal(matches.length, 1, `${name}: expected one ${hingeName}`);
    const { node, index } = matches[0];
    assert(seen.has(index), 'Wing hinge is not in the rendered scene');
    assert(node.children?.length, 'Wing hinge has no child assembly');
    let meshChildren = 0;
    function countMeshes(child) { const descendant = json.nodes[child]; if (descendant.mesh !== undefined) meshChildren++; for (const next of descendant.children ?? []) countMeshes(next); }
    for (const child of node.children) countMeshes(child);
    assert(meshChildren > 0, 'Wing hinge has no actual geometry descendants');
    return world.get(index).slice(12, 15);
  });
  assert(hinges[0][0] * hinges[1][0] < 0, 'Wing pivots must sit on opposite sides of the authored centerline');
  assert(Math.abs(hinges[0][0] - hinges[1][0]) > .1, 'Wing pivots coincide instead of occupying separate bearings');

  const metadata = JSON.parse(readFileSync(path.join(review, `${id}.json`), 'utf8'));
  assert.equal(metadata.name, name); assert.equal(metadata.glbBytes, bytes.length);
  assert.equal(metadata.triangles, triangles); assert.equal(metadata.wingAssemblies, 2);
  assert.equal(metadata.productionReplaced, false);
  assert.equal(metadata.status, 'proposal-awaiting-owner-selection');
  assert(statSync(path.join(root, 'assets/seraph-proposals-v1', `${id}.blend`)).size > 100_000, 'Missing editable Blender source');
  for (const [view, width, height] of [['hero', 1440, 1080], ['top', 1280, 1280], ['game', 640, 328]]) {
    const png = readFileSync(path.join(review, `${id}-${view}.png`));
    assert(png.length > 10_000, 'Empty or truncated review render');
    assert(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'Missing PNG signature');
    assert.equal(png.toString('ascii', 12, 16), 'IHDR');
    assert.equal(png.readUInt32BE(16), width, `${view} width mismatch`);
    assert.equal(png.readUInt32BE(20), height, `${view} height mismatch`);
    assert.equal(png.toString('ascii', png.length - 8, png.length - 4), 'IEND', 'Truncated PNG');
  }
  console.log(`${name}: ${triangles} triangles; ${bytes.length} bytes; two independent wing hinges; source/review match.`);
}
