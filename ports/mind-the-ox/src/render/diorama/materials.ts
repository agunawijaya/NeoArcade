import {
  Color,
  DataTexture,
  MeshToonMaterial,
  NearestFilter,
  RedFormat,
  type Material,
  type Texture,
} from 'three';

/**
 * Three flat tones per surface, like gouache laid in light, middle and
 * shadow, instead of smooth shading. Materials are cached by colour.
 */
let toneRamp: DataTexture | null = null;

function ramp(): DataTexture {
  if (toneRamp) return toneRamp;
  toneRamp = new DataTexture(new Uint8Array([90, 170, 255]), 3, 1, RedFormat);
  toneRamp.minFilter = NearestFilter;
  toneRamp.magFilter = NearestFilter;
  toneRamp.needsUpdate = true;
  return toneRamp;
}

export class MaterialCache {
  private readonly materials = new Map<string, MeshToonMaterial>();

  toon(
    colour: string,
    options: { emissive?: string; transparent?: boolean; opacity?: number } = {},
  ): MeshToonMaterial {
    const key = `${colour}:${options.emissive ?? ''}:${options.opacity ?? 1}`;
    let material = this.materials.get(key);
    if (!material) {
      material = new MeshToonMaterial({
        color: new Color(colour),
        gradientMap: ramp(),
        emissive: new Color(options.emissive ?? '#000000'),
        transparent: options.transparent ?? false,
        opacity: options.opacity ?? 1,
      });
      this.materials.set(key, material);
    }
    return material;
  }

  dispose() {
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
  }
}

/** The same three tones, in a material of its own that can fade out; not cached. */
export function fadingToon(colour: string, emissive = '#000000'): MeshToonMaterial {
  return new MeshToonMaterial({
    color: new Color(colour),
    emissive: new Color(emissive),
    gradientMap: ramp(),
    transparent: true,
  });
}

/** The same three tones over a painted surface, such as a ship's dazzled side; not cached. */
export function paintedToon(map: Texture): MeshToonMaterial {
  return new MeshToonMaterial({ map, gradientMap: ramp() });
}

export function disposeMaterial(material: Material | Material[]) {
  if (Array.isArray(material)) for (const one of material) one.dispose();
  else material.dispose();
}
