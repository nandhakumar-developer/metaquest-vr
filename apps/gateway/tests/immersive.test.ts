import { describe, expect, it } from 'vitest';
import { ImmersivePlayer } from '../../player/webxr/immersive.js';

class TestGeometry {
  rotations: number[] = [];
  scales: number[][] = [];

  scale(x: number, y: number, z: number): void {
    this.scales.push([x, y, z]);
  }

  rotateY(angle: number): void {
    this.rotations.push(angle);
  }

  clone(): TestGeometry {
    const cloned = new TestGeometry();
    cloned.scales = [...this.scales];
    cloned.rotations = [...this.rotations];
    return cloned;
  }

  dispose(): void {}
}

class TestGroup {
  position = { set: () => {} };

  add(): void {}
}

class TestMesh {
  layers = { set: () => {} };

  constructor(
    readonly geometry: TestGeometry,
    readonly material: unknown,
  ) {}
}

class TestShaderMaterial {
  constructor(readonly options: {
    uniforms: Record<string, { value: unknown }>;
    vertexShader: string;
    fragmentShader: string;
  }) {}
}

function createPlayer() {
  const geometries: TestGeometry[] = [];
  const shaderMaterials: TestShaderMaterial[] = [];
  class SphereGeometry extends TestGeometry {
    constructor() {
      super();
      geometries.push(this);
    }
  }

  class ShaderMaterial extends TestShaderMaterial {
    constructor(options: ConstructorParameters<typeof TestShaderMaterial>[0]) {
      super(options);
      shaderMaterials.push(this);
    }
  }

  const player = new ImmersivePlayer({
    video: { readyState: 2, videoWidth: 3840, videoHeight: 1920 } as HTMLVideoElement,
    canvas: {} as HTMLCanvasElement,
    overlayRoot: null,
  });
  player.three = {
    VideoTexture: class {
      colorSpace = '';
      minFilter = 0;
      magFilter = 0;
      generateMipmaps = true;
      dispose(): void {}
    },
    SRGBColorSpace: 'srgb',
    LinearFilter: 1,
    SphereGeometry,
    PlaneGeometry: class extends TestGeometry {},
    Group: TestGroup,
    Mesh: TestMesh,
    MeshBasicMaterial: class {},
    ShaderMaterial,
    FrontSide: 0,
  } as unknown as typeof player.three;
  player.scene = { add: () => {} } as unknown as typeof player.scene;

  return { player, geometries, shaderMaterials };
}

describe('immersive equirectangular projection', () => {
  it('centers a 360° panorama in front of the viewer', () => {
    const { player, geometries } = createPlayer();
    player.buildContent({ projectionType: '360', stereoLayout: 'mono' });

    expect(geometries[0].scales).toEqual([[-1, 1, 1]]);
    expect(geometries[0].rotations).toEqual([-Math.PI / 2]);
  });

  it('keeps the existing 180° hemisphere orientation', () => {
    const { player, geometries } = createPlayer();
    player.buildContent({ projectionType: '180', stereoLayout: 'mono' });

    expect(geometries[0].scales).toEqual([[-1, 1, 1]]);
    expect(geometries[0].rotations).toEqual([]);
  });

  it('uses a WebGL 2-safe uniform to select each side-by-side eye image', () => {
    const { player, shaderMaterials } = createPlayer();
    player.buildContent({ projectionType: '360', stereoLayout: 'sbs' });

    expect(shaderMaterials).toHaveLength(2);
    expect(shaderMaterials[0].options.uniforms.stereoLayout.value).toBe(1);
    expect(shaderMaterials[1].options.uniforms.stereoLayout.value).toBe(1);
    expect(shaderMaterials[0].options.fragmentShader).toContain('uniform int stereoLayout;');
    expect(shaderMaterials[0].options.fragmentShader).not.toMatch(/\blayout\b/);
  });
});
