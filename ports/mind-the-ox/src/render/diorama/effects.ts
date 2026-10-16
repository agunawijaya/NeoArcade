import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  MeshBasicMaterial,
  NormalBlending,
  Object3D,
  Points,
  ShaderMaterial,
  SphereGeometry,
} from 'three';
import type { World } from '../../engine/world';
import type { Palette } from '../palette';
import type { Particle } from '../particles';
import { mix, shade } from '../side/colour';
import { canopyColour, contrailColour } from '../side/effects';

const MAX_POINTS = 1600;
const MAX_SHOTS = 400;
const MAX_SHELLS = 64;
const MAX_PIECES = 300;
const MAX_CANOPIES = 24;

const VERTEX = /* glsl */ `
  attribute vec4 tint;
  attribute float size;
  varying vec4 vTint;
  uniform float pixelsPerUnit;
  void main() {
    vTint = tint;
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * view;
    gl_PointSize = size * pixelsPerUnit * (430.0 / -view.z);
  }
`;

const FRAGMENT = /* glsl */ `
  varying vec4 vTint;
  void main() {
    float distance = length(gl_PointCoord - vec2(0.5));
    float soft = smoothstep(0.5, 0.18, distance);
    gl_FragColor = vec4(vTint.rgb, vTint.a * soft);
    if (gl_FragColor.a < 0.01) discard;
  }
`;

/** One cloud of soft round points: smoke in one, fire and sparks in another, added on top. */
class PointCloud {
  readonly points: Points;
  private readonly positions = new Float32Array(MAX_POINTS * 3);
  private readonly tints = new Float32Array(MAX_POINTS * 4);
  private readonly sizes = new Float32Array(MAX_POINTS);
  private readonly geometry = new BufferGeometry();
  readonly material: ShaderMaterial;

  constructor(additive: boolean) {
    this.geometry.setAttribute(
      'position',
      new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage),
    );
    this.geometry.setAttribute(
      'tint',
      new BufferAttribute(this.tints, 4).setUsage(DynamicDrawUsage),
    );
    this.geometry.setAttribute(
      'size',
      new BufferAttribute(this.sizes, 1).setUsage(DynamicDrawUsage),
    );
    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: { pixelsPerUnit: { value: 4 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
    });
    this.points = new Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 12 : 10;
  }

  fill(items: { x: number; y: number; z: number; colour: Color; alpha: number; size: number }[]) {
    const count = Math.min(MAX_POINTS, items.length);
    for (let index = 0; index < count; index++) {
      const item = items[index] as (typeof items)[number];
      this.positions.set([item.x, item.y, item.z], index * 3);
      this.tints.set([item.colour.r, item.colour.g, item.colour.b, item.alpha], index * 4);
      this.sizes[index] = item.size;
    }
    this.geometry.setDrawRange(0, count);
    for (const name of ['position', 'tint', 'size'])
      (this.geometry.getAttribute(name) as BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/**
 * Particles, bullets, bombs, rockets, flares and wreckage in the diorama,
 * from the same Frame the side view paints. Everything stays on the line of
 * play (z = 0), so nothing hides behind the scenery.
 */
export class DioramaEffects {
  readonly group = new Group();
  private readonly smoke = new PointCloud(false);
  private readonly glow = new PointCloud(true);
  private readonly shots: InstancedMesh;
  /** Anti-aircraft shells on their way up: dark dots, a spark of fuze by night. */
  private readonly shells: InstancedMesh;
  private readonly pieces: InstancedMesh;
  private readonly bombs: InstancedMesh;
  /** Parachutes: a little silk dome each, coloured for its side. */
  private readonly canopies: InstancedMesh;
  private readonly dummy = new Object3D();

  constructor() {
    const box = new BoxGeometry(1, 1, 1);
    this.shots = new InstancedMesh(box, new MeshBasicMaterial({ color: '#ffd27a' }), MAX_SHOTS);
    this.shells = new InstancedMesh(
      new SphereGeometry(1, 8, 6),
      new MeshBasicMaterial({ color: '#2a2622' }),
      MAX_SHELLS,
    );
    this.pieces = new InstancedMesh(box, new MeshBasicMaterial({ color: '#4a3a2a' }), MAX_PIECES);
    this.bombs = new InstancedMesh(box, new MeshBasicMaterial({ color: '#56534c' }), 64);
    this.canopies = new InstancedMesh(
      new SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      new MeshBasicMaterial({ color: '#ffffff' }),
      MAX_CANOPIES,
    );
    for (const mesh of [this.shots, this.shells, this.pieces, this.bombs, this.canopies]) {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
    this.group.add(this.smoke.points, this.glow.points);
  }

  update(
    world: World,
    particles: readonly Particle[],
    palette: Palette,
    pixelsPerUnit: number,
    time: number,
  ) {
    for (const cloud of [this.smoke, this.glow]) {
      const uniform = cloud.material.uniforms.pixelsPerUnit;
      if (uniform) uniform.value = pixelsPerUnit;
    }
    (this.shots.material as MeshBasicMaterial).color.set(palette.tracer);
    (this.shells.material as MeshBasicMaterial).color.set(
      palette.daylight < 0.5 ? palette.fire[1] : palette.ink,
    );
    // The Airshow drops flour, not high explosive.
    (this.bombs.material as MeshBasicMaterial).color.set(
      palette.theme === 'airshow' ? '#f6f0e0' : '#56534c',
    );
    let canopies = 0;
    const soft: Parameters<PointCloud['fill']>[0] = [];
    const bright: Parameters<PointCloud['fill']>[0] = [];
    const smokeLight = new Color(mix(palette.cloud.light, palette.smoke, 0.35));
    const smokeDark = new Color(shade(palette.smoke, -0.4));
    for (const particle of particles) {
      const t = particle.age / particle.life;
      switch (particle.kind) {
        case 'smoke':
        case 'puff':
        case 'dirt':
          soft.push({
            x: particle.x,
            y: particle.y,
            z: 0.5,
            colour:
              particle.kind === 'dirt'
                ? new Color(palette.soil[0])
                : smokeLight.clone().lerp(smokeDark, particle.darkness),
            alpha: (particle.kind === 'dirt' ? 1 : 0.55) * (1 - t),
            size: particle.kind === 'dirt' ? particle.size * 1.4 : particle.size * (1.4 + t * 3.2),
          });
          break;
        case 'fire':
          bright.push({
            x: particle.x,
            y: particle.y,
            z: 1,
            colour: new Color(t < 0.4 ? palette.fire[0] : palette.fire[1]),
            alpha: 0.9 * (1 - t),
            size: particle.size * 2.4 * (1 - t * 0.5),
          });
          break;
        case 'flash':
          bright.push({
            x: particle.x,
            y: particle.y,
            z: 1.5,
            colour: new Color(palette.fire[0]),
            alpha: 1 - t,
            size: particle.size * 2.2 * (0.6 + t),
          });
          break;
        case 'spark':
          bright.push({
            x: particle.x,
            y: particle.y,
            z: 1,
            colour: new Color(palette.fire[0]),
            alpha: 1 - t,
            size: 0.9,
          });
          break;
        case 'feather':
          soft.push({
            x: particle.x,
            y: particle.y,
            z: 0.5,
            colour: new Color(palette.cloud.light),
            alpha: 1 - t * 0.7,
            size: 1.2,
          });
          break;
        case 'parachute':
          if (canopies < MAX_CANOPIES) {
            this.dummy.position.set(particle.x, particle.y + 5, 0.5);
            this.dummy.rotation.set(0, 0, Math.sin(particle.age * 1.3) * 0.2);
            this.dummy.scale.set(3.4, 2, 3.4);
            this.dummy.updateMatrix();
            this.canopies.setMatrixAt(canopies, this.dummy.matrix);
            this.canopies.setColorAt(canopies, new Color(canopyColour(particle, palette)));
            canopies += 1;
          }
          soft.push({
            x: particle.x,
            y: particle.y + 0.6,
            z: 0.6,
            colour: new Color(palette.ink),
            alpha: 1,
            size: 1.4,
          });
          break;
        case 'confetti':
          soft.push({
            x: particle.x,
            y: particle.y,
            z: 0.8,
            colour: new Color(palette.festive[particle.seed % palette.festive.length] as string),
            alpha: 1 - t * 0.6,
            size: 1.1,
          });
          break;
        case 'spray':
          soft.push({
            x: particle.x,
            y: particle.y,
            z: 0.8,
            colour: new Color(palette.sea.foam),
            alpha: 0.85 * (1 - t * 0.5),
            size: particle.size * 1.6,
          });
          break;
        case 'column':
          for (let step = 0; step < 4; step++) {
            const rise =
              Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) * (1 - Math.max(0, t - 0.55) * 1.6);
            soft.push({
              x: particle.x,
              y: particle.y + Math.max(0, rise) * particle.size * 18 * (step / 4),
              z: 0.8,
              colour: new Color(palette.sea.foam),
              alpha: 0.7 * (1 - t),
              size: particle.size * (5 - step) * 1.6,
            });
          }
          break;
        case 'flour':
          soft.push({
            x: particle.x,
            y: particle.y,
            z: 0.5,
            colour: new Color('#fbf8f0'),
            alpha: 0.9 * (1 - t),
            size: particle.size * 2.2,
          });
          break;
        case 'contrail':
          soft.push({
            x: particle.x,
            y: particle.y,
            z: 0.2,
            colour: new Color(contrailColour(particle)),
            alpha: 0.55 * (1 - t),
            size: particle.size * (1.4 + t * 2.4),
          });
          break;
        default:
          break;
      }
    }
    for (const burst of world.bursts) {
      bright.push({
        x: burst.x,
        y: burst.y,
        z: 1,
        colour: new Color('#fff6d0'),
        alpha: 0.75 + Math.sin(time * 30 + burst.id) * 0.25,
        size: 9,
      });
    }
    this.canopies.count = canopies;
    this.canopies.instanceMatrix.needsUpdate = true;
    if (this.canopies.instanceColor) this.canopies.instanceColor.needsUpdate = true;
    this.smoke.fill(soft);
    this.glow.fill(bright);
    this.placeShots(world);
    this.placePieces(world, time);
  }

  private placeShots(world: World) {
    let count = 0;
    let shells = 0;
    for (const shot of world.shots) {
      if (shot.shell) {
        if (shells >= MAX_SHELLS) continue;
        this.dummy.position.set(shot.x, shot.y, 0.3);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.setScalar(0.45);
        this.dummy.updateMatrix();
        this.shells.setMatrixAt(shells++, this.dummy.matrix);
        continue;
      }
      if (count >= MAX_SHOTS) break;
      this.dummy.position.set(shot.x - shot.vx, shot.y - shot.vy, 0.3);
      this.dummy.rotation.set(0, 0, Math.atan2(shot.vy, shot.vx));
      this.dummy.scale.set(Math.hypot(shot.vx, shot.vy) * 2.2, 0.45, 0.45);
      this.dummy.updateMatrix();
      this.shots.setMatrixAt(count++, this.dummy.matrix);
    }
    this.shots.count = count;
    this.shots.instanceMatrix.needsUpdate = true;
    this.shells.count = shells;
    this.shells.instanceMatrix.needsUpdate = true;
    let bombs = 0;
    for (const bomb of [...world.bombs, ...world.missiles]) {
      if (bombs >= 64) break;
      this.dummy.position.set(bomb.x, bomb.y, 0);
      this.dummy.rotation.set(0, 0, Math.atan2(bomb.vy, bomb.vx));
      this.dummy.scale.set(3, 1.1, 1.1);
      this.dummy.updateMatrix();
      this.bombs.setMatrixAt(bombs++, this.dummy.matrix);
    }
    this.bombs.count = bombs;
    this.bombs.instanceMatrix.needsUpdate = true;
  }

  private placePieces(world: World, time: number) {
    let count = 0;
    for (const piece of world.debris) {
      if (count >= MAX_PIECES) break;
      this.dummy.position.set(piece.x, piece.y, 0);
      this.dummy.rotation.set(time * 3 + piece.id, time * 2, time * (3 + piece.shape));
      this.dummy.scale.set(1.8, 0.8, 0.8);
      this.dummy.updateMatrix();
      this.pieces.setMatrixAt(count++, this.dummy.matrix);
    }
    this.pieces.count = count;
    this.pieces.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.smoke.dispose();
    this.glow.dispose();
    this.group.clear();
  }
}
