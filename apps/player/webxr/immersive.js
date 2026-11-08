/**
 * WebXR renderer for immersive 180/360 and stereo playback.
 *
 * Three.js is loaded lazily from the gateway's local vendor route so the
 * player has no runtime dependency on a CDN. WebXR requires a secure context
 * (HTTPS or localhost); the non-XR spherical preview works over plain HTTP.
 */

const THREE_URL = '/player/vendor/three.module.js';
const LOOK_SPEED = 0.0035;
const MIN_PITCH = -Math.PI / 2 + 0.05;
const MAX_PITCH = Math.PI / 2 - 0.05;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isSecureContextForXr() {
  return (
    window.isSecureContext ||
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1'
  );
}

export class ImmersivePlayer {
  constructor({
    video,
    canvas,
    overlayRoot,
    onHeadPose,
    onSessionChange,
    onControllerSelect,
    onError,
  }) {
    this.video = video;
    this.canvas = canvas;
    this.overlayRoot = overlayRoot;
    this.onHeadPose = onHeadPose ?? (() => {});
    this.onSessionChange = onSessionChange ?? (() => {});
    this.onControllerSelect = onControllerSelect ?? (() => {});
    this.onError = onError ?? (() => {});
    this.three = null;
    this.preparePromise = null;
    this.xrSupported = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.texture = null;
    this.content = null;
    this.media = null;
    this.session = null;
    this.active = false;
    this.stereo = false;
    this.resizeHandler = null;
    this.poseTick = 0;

    // Non-XR preview state.
    this.previewActive = false;
    this.previewMedia = null;
    this.lookBound = false;
    this.pointerId = null;
    this.pointerLast = null;
    this.lookYaw = 0;
    this.lookPitch = 0;
  }

  /**
   * Load Three.js and cache XR support. Safe to call before a click so the
   * network import does not consume the user activation required by
   * requestSession(). Also used by the non-XR spherical preview.
   */
  prepare() {
    if (this.three) return Promise.resolve(this.three);
    if (this.preparePromise) return this.preparePromise;
    this.preparePromise = (async () => {
      const three = await import(THREE_URL);
      this.three = three;
      if (
        isSecureContextForXr() &&
        navigator.xr &&
        typeof navigator.xr.isSessionSupported === 'function'
      ) {
        try {
          this.xrSupported = await navigator.xr.isSessionSupported('immersive-vr');
        } catch {
          this.xrSupported = false;
        }
      } else {
        this.xrSupported = false;
      }
      return three;
    })().catch((error) => {
      this.preparePromise = null;
      throw error;
    });
    return this.preparePromise;
  }

  async ensureThreeForXr() {
    if (!isSecureContextForXr()) {
      throw new Error(
        'Immersive WebXR needs a secure context. Open the player over HTTPS (accept the local certificate once) or use localhost; flat 2D playback still works.',
      );
    }
    if (!navigator.xr) {
      throw new Error('This browser does not expose WebXR. Use Meta Quest Browser over HTTPS.');
    }
    let three;
    try {
      three = await this.prepare();
    } catch {
      throw new Error(
        'Could not load the immersive renderer. Check the gateway connection and try again.',
      );
    }
    if (!three) {
      throw new Error(
        'Could not load the immersive renderer. Check the gateway connection and try again.',
      );
    }
    if (this.xrSupported === false) {
      throw new Error('Immersive VR is not available in this browser session.');
    }
    return three;
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
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.05,
      1000,
    );
    this.camera.rotation.order = 'YXZ';
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

    const projection =
      media?.projectionType === '180' ? '180' : media?.projectionType === '360' ? '360' : 'flat';
    const layout = media?.stereoLayout ?? 'mono';
    const stereo = layout === 'sbs' || layout === 'ou';
    this.stereo = stereo;

    let geometry;
    if (projection === '360') {
      // Start the equirectangular texture at -Z (in front of the default
      // camera) instead of at the seam, so the centre of the video is the
      // initial view.
      geometry = new THREE.SphereGeometry(12, 64, 40, Math.PI / 2, Math.PI * 2);
      geometry.scale(-1, 1, 1);
    } else if (projection === '180') {
      geometry = new THREE.SphereGeometry(12, 64, 40, Math.PI, Math.PI);
      geometry.scale(-1, 1, 1);
    } else {
      const aspect =
        this.video.videoWidth && this.video.videoHeight
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
    if (!this.active && !this.previewActive) return;
    try {
      this.buildContent(media);
      if (this.previewActive && !this.active) this.previewMedia = media;
    } catch (error) {
      this.onError(error instanceof Error ? error.message : 'Unable to build the immersive scene.');
    }
  }

  /** Render a 180/360 video on the canvas without entering WebXR. */
  async showPreview(media) {
    console.info('[projection] showPreview', media?.projectionType, media?.stereoLayout);
    if (!media || media.projectionType === 'flat') {
      this.stopPreview();
      return false;
    }
    if (this.active) {
      this.setMedia(media);
      return true;
    }
    const three = await this.prepare();
    if (!three) return false;
    this.buildRenderer();
    this.buildContent(media);
    this.previewMedia = media;
    this.previewActive = true;
    this.canvas.hidden = false;
    this.video.style.opacity = '0';
    this.video.style.pointerEvents = 'none';
    this.bindLookControls();
    this.applyLook();
    this.renderer.setAnimationLoop(() => this.renderPreviewFrame());
    return true;
  }

  stopPreview() {
    this.previewActive = false;
    this.previewMedia = null;
    if (this.active) return;
    this.renderer?.setAnimationLoop(null);
    this.canvas.hidden = true;
    this.video.style.opacity = '';
    this.video.style.pointerEvents = '';
    this.clearContent();
  }

  isPreviewActive() {
    return this.previewActive && !this.active;
  }

  bindLookControls() {
    if (this.lookBound) return;
    this.lookBound = true;

    this.handlePointerDown = (event) => {
      if (this.active) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      this.pointerId = event.pointerId;
      this.pointerLast = { x: event.clientX, y: event.clientY };
      try {
        this.canvas.setPointerCapture?.(event.pointerId);
      } catch {
        // Ignore browsers that cannot capture this pointer.
      }
      event.preventDefault();
    };

    this.handlePointerMove = (event) => {
      if (this.active || this.pointerId === null) return;
      if (event.pointerId !== this.pointerId || !this.pointerLast) return;
      const dx = event.clientX - this.pointerLast.x;
      const dy = event.clientY - this.pointerLast.y;
      this.pointerLast = { x: event.clientX, y: event.clientY };
      this.lookYaw -= dx * LOOK_SPEED;
      this.lookPitch = clamp(this.lookPitch - dy * LOOK_SPEED, MIN_PITCH, MAX_PITCH);
      event.preventDefault();
    };

    this.handlePointerEnd = (event) => {
      if (event.pointerId !== this.pointerId) return;
      this.pointerId = null;
      this.pointerLast = null;
    };

    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove, { passive: false });
    window.addEventListener('pointerup', this.handlePointerEnd);
    window.addEventListener('pointercancel', this.handlePointerEnd);
  }

  applyLook() {
    if (!this.camera) return;
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.lookYaw;
    this.camera.rotation.x = this.lookPitch;
  }

  renderPreviewFrame() {
    if (!this.renderer || !this.scene || !this.camera || this.active) return;
    this.applyLook();
    this.renderer.render(this.scene, this.camera);
  }

  configureStereoLayers() {
    const xrCamera = this.renderer?.xr?.getCamera?.();
    if (!xrCamera || !Array.isArray(xrCamera.cameras) || xrCamera.cameras.length < 2) return;
    xrCamera.cameras[0].layers.enable(1);
    xrCamera.cameras[1].layers.enable(2);
  }

  handleSessionEnd() {
    this.active = false;
    this.session = null;
    this.renderer?.setAnimationLoop(null);
    if (this.previewActive && this.previewMedia) {
      this.canvas.hidden = false;
      this.video.style.opacity = '0';
      this.video.style.pointerEvents = 'none';
      this.renderer?.setAnimationLoop(() => this.renderPreviewFrame());
    } else {
      this.canvas.hidden = true;
      this.video.style.opacity = '';
      this.video.style.pointerEvents = '';
    }
    this.onSessionChange(false);
  }

  async enter(media) {
    if (this.active) return;
    await this.ensureThreeForXr();
    this.buildRenderer();
    if (this.video.readyState < 2) {
      throw new Error('The video is still loading. Wait for the first frame, then try again.');
    }
    this.buildContent(media);

    const session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'dom-overlay'],
      ...(this.overlayRoot ? { domOverlay: { root: this.overlayRoot } } : {}),
    });
    this.session = session;
    this.active = true;
    this.canvas.hidden = false;
    // Keep the video in the DOM and decoding; WebXR samples it as a texture.
    // display:none can make mobile browsers stop producing frames.
    this.video.style.opacity = '0';
    this.video.style.pointerEvents = 'none';

    if (!session.domOverlayState) {
      session.addEventListener('select', () => this.onControllerSelect());
    }

    session.addEventListener('end', () => this.handleSessionEnd());

    await this.renderer.xr.setSession(session);
    this.renderer.setAnimationLoop(() => this.renderFrame());
    this.onSessionChange(true, Boolean(session.domOverlayState));
  }

  renderFrame() {
    if (!this.renderer || !this.scene || !this.camera) return;
    if (this.stereo) this.configureStereoLayers();
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
    this.stopPreview();
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }
    if (this.lookBound) {
      this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
      window.removeEventListener('pointermove', this.handlePointerMove);
      window.removeEventListener('pointerup', this.handlePointerEnd);
      window.removeEventListener('pointercancel', this.handlePointerEnd);
      this.lookBound = false;
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
