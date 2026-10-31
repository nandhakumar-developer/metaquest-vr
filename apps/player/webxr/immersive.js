/**
 * WebXR renderer for immersive 180/360 and stereo playback.
 *
 * Three.js is loaded lazily from the gateway's local vendor route so the
 * player has no runtime dependency on a CDN. WebXR requires a secure context
 * (HTTPS or localhost); callers should present a clear error when unavailable.
 */

const THREE_URL = '/player/vendor/three.module.js';

function isSecureContextForXr() {
  return window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
}

export class ImmersivePlayer {
  constructor({ video, canvas, onHeadPose, onSessionChange, onError }) {
    this.video = video;
    this.canvas = canvas;
    this.onHeadPose = onHeadPose ?? (() => {});
    this.onSessionChange = onSessionChange ?? (() => {});
    this.onError = onError ?? (() => {});
    this.three = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.texture = null;
    this.content = null;
    this.media = null;
    this.session = null;
    this.active = false;
    this.resizeHandler = null;
    this.poseTick = 0;
  }

  async ensureThree() {
    if (!isSecureContextForXr()) {
      throw new Error(
        'Immersive WebXR needs HTTPS or localhost. Open the player over HTTPS to use 180/360 VR; flat playback still works.',
      );
    }
    if (!navigator.xr) {
      throw new Error('This browser does not expose WebXR. Use Meta Quest Browser over HTTPS.');
    }
    const supported = await navigator.xr.isSessionSupported('immersive-vr');
    if (!supported) {
      throw new Error('Immersive VR is not available in this browser session.');
    }
    if (!this.three) {
      this.three = await import(THREE_URL);
    }
    return this.three;
  }

  buildRenderer() {
    const THREE = this.three;
    if (this.renderer) return;
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.xr.enabled = true;
    try {
      this.renderer.xr.setReferenceSpaceType('local-floor');
    } catch {
      // Older browsers default to local space.
    }
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02040a);
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 1000);
    this.resizeHandler = () => this.resize();
    window.addEventListener('resize', this.resizeHandler);
  }

  resize() {
    if (!this.renderer || !this.camera || this.active) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  clearContent() {
    if (!this.scene || !this.content) return;
    this.scene.remove(this.content);
    this.content.traverse((node) => {
      if (node.geometry) node.geometry.dispose();
      if (node.material) {
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) material.dispose();
      }
    });
    this.content = null;
    if (this.texture) {
      this.texture.dispose();
      this.texture = null;
    }
  }

  createMaterial({ eye, layout, stereo }) {
    const THREE = this.three;
    if (!stereo) {
      return new THREE.MeshBasicMaterial({
        map: this.texture,
        side: THREE.FrontSide,
        toneMapped: false,
      });
    }
    return new THREE.ShaderMaterial({
      side: THREE.FrontSide,
      toneMapped: false,
      uniforms: {
        map: { value: this.texture },
        eye: { value: eye },
        layout: { value: layout === 'sbs' ? 1 : 2 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        uniform sampler2D map;
        uniform int eye;
        uniform int layout;
        varying vec2 vUv;
        void main() {
          vec2 uv = vUv;
          if (layout == 1) {
            uv.x = eye == 0 ? uv.x * 0.5 : 0.5 + uv.x * 0.5;
          } else if (layout == 2) {
            // Image top is sampled at v=1 because video textures use flipY.
            uv.y = eye == 0 ? 0.5 + uv.y * 0.5 : uv.y * 0.5;
          }
          gl_FragColor = texture2D(map, uv);
        }
      `,
    });
  }

  buildContent(media) {
    if (!this.scene || !this.video) return;
    this.clearContent();
    this.media = media;
    if (this.video.readyState < 2) {
      throw new Error('The video has not loaded far enough for immersive playback.');
    }

    const THREE = this.three;
    this.texture = new THREE.VideoTexture(this.video);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;

    const projection = media?.projectionType === '180' ? '180' : media?.projectionType === '360' ? '360' : 'flat';
    const layout = media?.stereoLayout ?? 'mono';
    const stereo = layout === 'sbs' || layout === 'ou';

    let geometry;
    if (projection === '360') {
      geometry = new THREE.SphereGeometry(12, 64, 40);
      geometry.scale(-1, 1, 1);
    } else if (projection === '180') {
      geometry = new THREE.SphereGeometry(12, 64, 40, Math.PI, Math.PI);
      geometry.scale(-1, 1, 1);
    } else {
      const aspect = this.video.videoWidth && this.video.videoHeight
        ? this.video.videoWidth / this.video.videoHeight
        : 16 / 9;
      const height = 2.7;
      const width = height * aspect;
      geometry = new THREE.PlaneGeometry(width, height);
    }

    this.content = new THREE.Group();
    this.content.position.set(0, projection === 'flat' ? 1.6 : 0, 0);

    if (stereo) {
      const left = new THREE.Mesh(geometry, this.createMaterial({ eye: 0, layout, stereo: true }));
      left.layers.set(1);
      const right = new THREE.Mesh(geometry, this.createMaterial({ eye: 1, layout, stereo: true }));
      right.layers.set(2);
      this.content.add(left, right);
    } else {
      const mesh = new THREE.Mesh(geometry, this.createMaterial({ eye: 0, layout, stereo: false }));
      this.content.add(mesh);
    }

    if (projection === 'flat') {
      this.content.position.z = -4.6;
    }
    this.scene.add(this.content);
  }

  setMedia(media) {
    this.media = media;
    if (!this.active) return;
    try {
      this.buildContent(media);
    } catch (error) {
      this.onError(error instanceof Error ? error.message : 'Unable to build the immersive scene.');
    }
  }

  async enter(media) {
    if (this.active) return;
    await this.ensureThree();
    this.buildRenderer();
    if (this.video.readyState < 2) {
      throw new Error('Load a video before entering immersive mode.');
    }
    this.buildContent(media);

    const session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
    });
    this.session = session;
    this.active = true;
    this.canvas.hidden = false;
    this.video.hidden = true;

    session.addEventListener('end', () => {
      this.active = false;
      this.session = null;
      this.canvas.hidden = true;
      this.video.hidden = false;
      this.renderer?.setAnimationLoop(null);
      this.onSessionChange(false);
    });

    await this.renderer.xr.setSession(session);
    this.renderer.setAnimationLoop(() => this.renderFrame());
    this.onSessionChange(true);
  }

  renderFrame() {
    if (!this.renderer || !this.scene || !this.camera) return;
    this.renderer.render(this.scene, this.camera);
    this.poseTick += 1;
    if (this.poseTick % 12 === 0) {
      const quaternion = this.camera.quaternion;
      this.onHeadPose({
        x: quaternion.x,
        y: quaternion.y,
        z: quaternion.z,
        w: quaternion.w,
        sampleTimestamp: new Date().toISOString(),
      });
    }
  }

  async exit() {
    if (!this.session) return;
    try {
      await this.session.end();
    } catch {
      // The browser may have already ended the session.
    }
  }

  capture() {
    if (!this.active || !this.renderer) return null;
    try {
      return this.renderer.domElement.toDataURL('image/jpeg', 0.72);
    } catch {
      return null;
    }
  }

  dispose() {
    this.clearContent();
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }
    this.renderer?.setAnimationLoop(null);
    this.renderer?.dispose();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
  }
}

export async function createImmersivePlayer(options) {
  const player = new ImmersivePlayer(options);
  return player;
}
