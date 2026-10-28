import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const material = new T.MeshStandardMaterial({
  color: '#ffffff',
  vertexColors: true,
  roughness: 0.9,
});

/** Pack rigid, articulated original shapes into one draw per character. */
export function skinCharacter(root: T.Group, animated: T.Object3D[]) {
  root.updateMatrixWorld(true);
  const bones = animated.map(() => new T.Bone());
  const base = new T.Bone();
  const allBones = [base, ...bones];
  const lookup = new Map<T.Object3D, number>(animated.map((object, index) => [object, index + 1]));
  const ancestor = (object: T.Object3D | null): number => {
    while (object) {
      const index = lookup.get(object);
      if (index !== undefined) return index;
      object = object.parent;
    }
    return 0;
  };
  animated.forEach((object, index) => {
    const parent = ancestor(object.parent);
    const parentMatrix = parent ? animated[parent - 1].matrixWorld : new T.Matrix4();
    const local = parentMatrix.clone().invert().multiply(object.matrixWorld);
    local.decompose(bones[index].position, bones[index].quaternion, bones[index].scale);
    allBones[parent].add(bones[index]);
  });
  const pieces: T.BufferGeometry[] = [];
  root.traverse((object) => {
    if (!(object instanceof T.Mesh) || !(object.material instanceof T.MeshStandardMaterial)) return;
    const geometry = object.geometry.index
      ? object.geometry.toNonIndexed()
      : object.geometry.clone();
    for (const name of Object.keys(geometry.attributes))
      if (!['position', 'normal'].includes(name)) geometry.deleteAttribute(name);
    geometry.applyMatrix4(object.matrixWorld);
    const count = geometry.attributes.position.count;
    const colors = new Float32Array(count * 3),
      indices = new Uint16Array(count * 4),
      weights = new Float32Array(count * 4);
    const bone = ancestor(object),
      color = object.material.color;
    for (let i = 0; i < count; i++) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
      indices[i * 4] = bone;
      weights[i * 4] = 1;
    }
    geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
    geometry.setAttribute('skinIndex', new T.BufferAttribute(indices, 4));
    geometry.setAttribute('skinWeight', new T.BufferAttribute(weights, 4));
    pieces.push(geometry);
  });
  const geometry = mergeGeometries(pieces)!;
  const mesh = new T.SkinnedMesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.clear();
  root.add(base, mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new T.Skeleton(allBones));
  mesh.computeBoundingSphere();
  // The little bodies can stretch their arms well past the resting silhouette.
  mesh.boundingSphere!.radius += 0.65;
  pieces.forEach((piece) => piece.dispose());
  return bones;
}
