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
    this.inlineActive = false;
    this.inlineLoopRunning = false;
    this.resizeHandler = null;
    this.pointerCleanup = null;
    this.poseTick = 0;
    this.previewActive = false;
    this.previewMedia = null;
    this.lookBound = false;
    this.pointerId = null;
    this.pointerLast = null;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.yaw = 0;
    this.pitch = 0;
  }

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

  async ensureThree(requireXrSession = true) {
    if (requireXrSession && !isSecureContextForXr()) {
      const secureUrl = `https://${location.host}${location.pathname}`;
      throw new Error(
        `Immersive VR needs HTTPS. Open ${secureUrl} on the headset, accept the certificate warning, then tap Enter VR again. If HTTPS is not enabled yet, run "npm run https:setup" on the gateway PC and restart it. Flat playback still works here.`,
      );
    }
    if (requireXrSession && !navigator.xr) {
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
    if (requireXrSession && this.xrSupported === false) {
      throw new Error('Immersive VR is not available in this browser session.');
    }
    return three;
  }

  async ensureThreeForXr() {
    return this.ensureThree(true);
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
      this.renderer.xr.setReferenceSpaceType('local');
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
    this.camera.position.set(0, 0, 0);
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
    const disposedGeometries = new Set();
    const disposedMaterials = new Set();
    this.content.traverse((node) => {
      if (node.geometry && !disposedGeometries.has(node.geometry)) {
        disposedGeometries.add(node.geometry);
        node.geometry.dispose();
      }
      if (node.material) {
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) {
          if (!disposedMaterials.has(material)) {
            disposedMaterials.add(material);
            material.dispose();
          }
        }
      }
    });
    this.content = null;
    if (this.texture) {
      this.texture.dispose();
      this.texture = null;
    }
  }

  /**
   * Create a material for a single eye.
   *
   * For mono content a plain MeshBasicMaterial is used. For SBS / OU stereo a
   * custom ShaderMaterial samples only the relevant half of the video texture
   * for each eye.
   *
   * SBS videos store the left-eye panorama in the left half and the
   * right-eye panorama in the right half. The mirrored sphere geometry
   * changes the panorama's viewing direction, but does not change which
   * half belongs to each eye.
   *
   * For OU the vertical inversion caused by `flipY` on VideoTexture is already
   * accounted for: image-top is at v=1 in the texture.
   */
  createMaterial({ eye, layout, stereo, projection }) {
    const THREE = this.three;
    // SphereGeometry is mirrored on X below to make its interior visible.
    // That reflection reverses its winding, so the interior is front-facing
    // and must use FrontSide. BackSide culls the video surface and leaves VR
    // with audio but no picture. Flat screens can face either direction.
    const isSphere = projection === '360' || projection === '180';
    const side = isSphere
      ? (THREE.FrontSide !== undefined ? THREE.FrontSide : 0)
      : (THREE.DoubleSide !== undefined ? THREE.DoubleSide : 2);

    if (!stereo) {
      return new THREE.MeshBasicMaterial({
        map: this.texture,
        side,
        toneMapped: false,
      });
    }
    return new THREE.ShaderMaterial({
      side,
      toneMapped: false,
      uniforms: {
        map: { value: this.texture },
        eye: { value: eye },
        stereoLayout: { value: layout === 'sbs' ? 1 : 2 },
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
        precision mediump int;
        uniform sampler2D map;
        uniform int eye;
        uniform int stereoLayout;
        varying vec2 vUv;
        void main() {
          vec2 uv = vUv;
          if (stereoLayout == 1) {
            // SBS: left-eye image is stored first, then right-eye image.
            uv.x = eye == 0 ? uv.x * 0.5 : 0.5 + uv.x * 0.5;
          } else if (stereoLayout == 2) {
            // OU: image top is at v=1 because VideoTexture uses flipY.
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

    if (projection === '360') {
      const geometry = new THREE.SphereGeometry(12, 64, 40, Math.PI / 2, Math.PI * 2);
      geometry.scale(-1, 1, 1);
      geometry.rotateY(-Math.PI / 2);

      this.content = new THREE.Group();
      this.content.position.set(0, 0, 0);

      if (stereo) {
        // Each eye needs its own geometry clone so mutations (dispose, etc.)
        // on one do not affect the other.
        const leftGeom = geometry;
        const rightGeom = geometry.clone();
        const left = new THREE.Mesh(leftGeom, this.createMaterial({ eye: 0, layout, stereo: true, projection }));
        left.layers.set(1);
        const right = new THREE.Mesh(rightGeom, this.createMaterial({ eye: 1, layout, stereo: true, projection }));
        right.layers.set(2);
        this.content.add(left, right);
      } else {
        const mesh = new THREE.Mesh(geometry, this.createMaterial({ eye: 0, layout, stereo: false, projection }));
        this.content.add(mesh);
      }
    } else if (projection === '180') {
      const geometry = new THREE.SphereGeometry(60, 64, 40, Math.PI, Math.PI);
      geometry.scale(-1, 1, 1);

      this.content = new THREE.Group();
      this.content.position.set(0, 0, 0);

      if (stereo) {
        const leftGeom = geometry;
        const rightGeom = geometry.clone();
        const left = new THREE.Mesh(leftGeom, this.createMaterial({ eye: 0, layout, stereo: true, projection }));
        left.layers.set(1);
        const right = new THREE.Mesh(rightGeom, this.createMaterial({ eye: 1, layout, stereo: true, projection }));
        right.layers.set(2);
        this.content.add(left, right);
      } else {
        const mesh = new THREE.Mesh(geometry, this.createMaterial({ eye: 0, layout, stereo: false, projection }));
        this.content.add(mesh);
      }
    } else {
      const aspect =
        this.video.videoWidth && this.video.videoHeight
          ? this.video.videoWidth / this.video.videoHeight
          : 16 / 9;
      const height = 2.7;
      const width = height * aspect;
      const geometry = new THREE.PlaneGeometry(width, height);

      this.content = new THREE.Group();
      this.content.position.set(0, 0, -3.5);

      if (stereo) {
        const leftGeom = geometry;
        const rightGeom = geometry.clone();
        const left = new THREE.Mesh(leftGeom, this.createMaterial({ eye: 0, layout, stereo: true, projection }));
        left.layers.set(1);
        const right = new THREE.Mesh(rightGeom, this.createMaterial({ eye: 1, layout, stereo: true, projection }));
        right.layers.set(2);
        this.content.add(left, right);
      } else {
        const mesh = new THREE.Mesh(geometry, this.createMaterial({ eye: 0, layout, stereo: false, projection }));
        this.content.add(mesh);
      }
    }

    this.scene.add(this.content);
  }

  setupPointerControls() {
    if (this.pointerCleanup) return;
    let isDragging = false;
    let prevX = 0;
    let prevY = 0;

    const onPointerDown = (e) => {
      if (this.active || !this.inlineActive) return;
      isDragging = true;
      prevX = e.clientX;
      prevY = e.clientY;
      if (this.canvas.setPointerCapture) {
        try {
          this.canvas.setPointerCapture(e.pointerId);
        } catch {}
      }
    };

    const onPointerMove = (e) => {
      if (!isDragging || this.active || !this.inlineActive || !this.camera) return;
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      prevX = e.clientX;
      prevY = e.clientY;
      this.yaw += dx * 0.003;
      this.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, this.pitch + dy * 0.003));
      this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    };

    const onPointerUp = (e) => {
      if (!isDragging) return;
      isDragging = false;
      if (this.canvas.releasePointerCapture) {
        try {
          this.canvas.releasePointerCapture(e.pointerId);
        } catch {}
      }
    };

    this.canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    this.pointerCleanup = () => {
      this.canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      this.pointerCleanup = null;
    };
  }

  async startInline(media) {
    if (this.active || this.session) return;
    this.media = media;
    const isSphere = media?.projectionType === '360' || media?.projectionType === '180';
    if (!isSphere) {
      this.stopInline();
      return;
    }
    try {
      await this.ensureThree(false);
      this.buildRenderer();
      if (!this.camera) return;
      this.camera.layers.enable(1);
      this.setupPointerControls();
      if (this.video && this.video.readyState >= 2) {
        this.buildContent(media);
      }
      this.canvas.hidden = false;
      this.inlineActive = true;
      if (!this.inlineLoopRunning) {
        this.inlineLoopRunning = true;
        const loop = () => {
          if (!this.inlineActive || this.active || this.session) {
            this.inlineLoopRunning = false;
            return;
          }
          if (!this.content && this.video && this.video.readyState >= 2 && this.media) {
            try {
              this.buildContent(this.media);
            } catch {}
          }
          if (this.texture && this.video && this.video.readyState >= 2) {
            this.texture.needsUpdate = true;
          }
          if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
          }
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      }
    } catch {
      this.stopInline();
    }
  }

  stopInline() {
    this.inlineActive = false;
    this.inlineLoopRunning = false;
    if (!this.active && !this.session) {
      this.canvas.hidden = true;
      if (this.camera) {
        this.camera.layers.disable(1);
      }
    }
  }

  setMedia(media) {
    this.media = media;
    if (this.active || this.previewActive) {
      try {
        this.buildContent(media);
        if (this.previewActive && !this.active) this.previewMedia = media;
      } catch (error) {
        this.onError(error instanceof Error ? error.message : 'Unable to build the immersive scene.');
      }
      return;
    }
    const isSphere = media?.projectionType === '360' || media?.projectionType === '180';
    if (isSphere) {
      void this.startInline(media);
    } else {
      this.stopInline();
    }
  }

  /** Render a 180/360 video on the canvas without entering WebXR. */
  async showPreview(media) {
    if (!media || media.projectionType === 'flat') {
      this.stopPreview();
      return false;
    }
    if (this.active) {
      this.setMedia(media);
      return true;
    }
    await this.startInline(media);
    return this.isPreviewActive();
  }

  stopPreview() {
    this.previewActive = false;
    this.previewMedia = null;
    if (this.active) return;
    this.stopInline();
  }

  isPreviewActive() {
    return (this.previewActive || this.inlineActive) && !this.active;
  }

  bindLookControls() {
    if (this.lookBound) return;
    this.lookBound = true;
    this.handlePointerDown = (event) => {
      if (this.active || !this.previewActive) return;
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
      if (this.active || !this.previewActive || this.pointerId === null) return;
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
    this.video.style.opacity = '';
    this.video.style.pointerEvents = '';
    if (this.previewActive && this.previewMedia) {
      this.canvas.hidden = false;
      this.video.style.opacity = '0';
      this.video.style.pointerEvents = 'none';
      this.renderer?.setAnimationLoop(() => this.renderPreviewFrame());
    } else if (this.media?.projectionType === '360' || this.media?.projectionType === '180') {
      void this.startInline(this.media);
    } else {
      this.canvas.hidden = true;
    }
    this.onSessionChange(false);
  }

  async enter(media) {
    if (this.active) return;
    this.stopPreview();
    this.stopInline();
    await this.ensureThreeForXr();
    this.buildRenderer();
    if (this.video.readyState < 2) {
      throw new Error('The video is still loading. Wait for the first frame, then try again.');
    }
    if (this.camera) {
      this.camera.layers.disable(1);
      this.camera.rotation.set(0, 0, 0);
    }
    this.buildContent(media);

    if (this.video.paused && this.video.readyState >= 2) {
      try {
        await this.video.play();
      } catch {
        // Autoplay may be blocked; the user can tap play in the overlay.
      }
    }

    const session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'dom-overlay'],
      ...(this.overlayRoot ? { domOverlay: { root: this.overlayRoot } } : {}),
    });
    this.session = session;
    this.active = true;
    this.canvas.hidden = false;
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
    if (this.texture && this.video && this.video.readyState >= 2) {
      this.texture.needsUpdate = true;
    }
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
    this.stopInline();
    this.pointerCleanup?.();
    this.clearContent();
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
  return new ImmersivePlayer(options);
}
