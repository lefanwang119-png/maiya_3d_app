const gradientVasePreview = require('../../static/models/gradient-vase-preview-data');

const TONES = {
  dark: 0x3c3c3c,
  silver: 0xd6d7d5,
  cyan: 0x16d5c8,
};

Component({
  properties: {
    src: {
      type: String,
      value: '',
    },
    cover: {
      type: String,
      value: '',
    },
  },

  data: {
    activeTone: 'dark',
    errorText: '',
    statusText: 'Tap Start, then drag to rotate',
    viewerReady: false,
  },

  lifetimes: {
    detached() {
      this.disposeViewer();
    },
  },

  methods: {
    startViewer() {
      if (this._started) return;
      this._started = true;
      this.setData({
        errorText: '',
        statusText: 'Loading model...',
        viewerReady: true,
      }, () => {
        wx.nextTick(() => this.initViewer());
      });
    },

    initViewer() {
      let createScopedThreejs;
      let registerGLTFLoader;
      try {
        ({ createScopedThreejs } = require('./vendor/threejs-miniprogram'));
        registerGLTFLoader = require('./vendor/GLTFLoader');
      } catch (error) {
        console.warn('[glb-viewer:runtime-not-ready]', error);
        this._started = false;
        this.setData({
          viewerReady: false,
          statusText: '3D runtime unavailable',
          errorText: `3D runtime failed: ${this.getErrorMessage(error)}`,
        });
        return;
      }

      this.createSelectorQuery()
        .select('#glb-canvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          const canvasInfo = res && res[0];
          if (!canvasInfo || !canvasInfo.node) {
            this._started = false;
            this.setData({
              viewerReady: false,
              statusText: 'Canvas init failed',
              errorText: 'WebGL canvas is unavailable. Please check the base library version.',
            });
            return;
          }
          this.setupScene(createScopedThreejs, registerGLTFLoader, canvasInfo);
        });
    },

    setupScene(createScopedThreejs, registerGLTFLoader, canvasInfo) {
      const canvas = canvasInfo.node;
      const width = canvasInfo.width;
      const height = canvasInfo.height;
      const systemInfo = wx.getSystemInfoSync();
      const pixelRatio = Math.min(systemInfo.pixelRatio || 1, 2);
      const THREE = createScopedThreejs(canvas);
      const GLTFLoader = registerGLTFLoader(THREE);

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        canvas,
      });
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height);
      renderer.setClearColor(0x1d1d1f, 1);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(36, width / height, 0.01, 100);
      camera.position.set(0, 0.25, 5.6);

      const root = new THREE.Group();
      scene.add(root);

      scene.add(new THREE.HemisphereLight(0xffffff, 0x343434, 1.8));
      const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
      keyLight.position.set(3, 4, 5);
      scene.add(keyLight);
      const rimLight = new THREE.DirectionalLight(0x9ff7ef, 1.2);
      rimLight.position.set(-3, 2, -3);
      scene.add(rimLight);

      this._three = THREE;
      this._renderer = renderer;
      this._scene = scene;
      this._camera = camera;
      this._root = root;
      this._canvas = canvas;
      this._autoRotate = true;
      this._loader = new GLTFLoader();
      this._baseCameraZ = 5.6;
      this._minCameraZ = 2.6;
      this._maxCameraZ = 9.2;

      this.loadModelBuffer(this.properties.src)
        .then((arrayBuffer) => this.parseModel(arrayBuffer))
        .then((gltf) => {
          const model = gltf.scene || gltf.scenes[0];
          root.add(model);
          this.fitModel(model);
          this.applyTone(this.data.activeTone);
          this.setData({ statusText: 'Drag to rotate - pinch to zoom' });
          this.renderLoop();
        })
        .catch((error) => {
          console.warn('[glb-viewer:load-failed]', error);
          this._started = false;
          this.setData({
            statusText: 'Model load failed',
            errorText: `Model load failed: ${this.getErrorMessage(error)}`,
          });
        });
    },

    loadModelBuffer(src) {
      if (src && src.indexOf('gradient-vase-preview') >= 0) {
        return Promise.resolve(gradientVasePreview.createArrayBuffer());
      }
      return this.readLocalFile(src);
    },

    readLocalFile(src) {
      if (!src) return Promise.reject(new Error('Missing GLB path'));
      if (/^https?:\/\//i.test(src)) {
        return Promise.reject(new Error('Remote GLB loading is not enabled in this local demo'));
      }

      const normalized = src.replace(/^\/+/, '');
      const candidates = Array.from(new Set([src, normalized, `/${normalized}`]));
      const fs = wx.getFileSystemManager();

      const tryRead = (index) => new Promise((resolve, reject) => {
        const filePath = candidates[index];
        if (!filePath) {
          reject(new Error(`Cannot read model file: ${src}`));
          return;
        }
        fs.readFile({
          filePath,
          success: (res) => {
            const data = this.toArrayBuffer(res.data);
            if (!data || data.byteLength < 20) {
              tryRead(index + 1).then(resolve).catch(reject);
              return;
            }
            resolve(data);
          },
          fail: () => {
            tryRead(index + 1).then(resolve).catch(reject);
          },
        });
      });

      return tryRead(0);
    },

    parseModel(arrayBuffer) {
      return new Promise((resolve, reject) => {
        const loader = this._loader;
        if (!loader) {
          reject(new Error('GLTFLoader is not initialized'));
          return;
        }
        loader.parse(arrayBuffer, '', resolve, reject);
      });
    },

    toArrayBuffer(data) {
      if (data instanceof ArrayBuffer) return data;
      if (data && data.buffer instanceof ArrayBuffer) {
        return data.buffer.slice(data.byteOffset || 0, (data.byteOffset || 0) + data.byteLength);
      }
      if (typeof data === 'string') {
        const buffer = new ArrayBuffer(data.length);
        const view = new Uint8Array(buffer);
        for (let i = 0; i < data.length; i += 1) {
          view[i] = data.charCodeAt(i) & 0xff;
        }
        return buffer;
      }
      return null;
    },

    fitModel(model) {
      const THREE = this._three;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxSize = Math.max(size.x, size.y, size.z) || 1;
      const scale = 1.62 / maxSize;
      model.position.sub(center);
      model.scale.setScalar(scale);
      this._baseCameraZ = 5.2;
      this._minCameraZ = 2.2;
      this._maxCameraZ = 9.4;
      this.setCameraZoom(this._baseCameraZ);
    },

    renderLoop() {
      if (!this._renderer || !this._scene || !this._camera) return;
      if (this._root && this._autoRotate) this._root.rotation.y += 0.006;
      this._renderer.render(this._scene, this._camera);
      const requestAnimationFrame = this._canvas && this._canvas.requestAnimationFrame;
      this._frameId = requestAnimationFrame
        ? requestAnimationFrame(() => this.renderLoop())
        : setTimeout(() => this.renderLoop(), 16);
    },

    onTouchStart(event) {
      const touches = event.touches || [];
      this._autoRotate = false;
      this._touchState = {
        x: touches[0] ? touches[0].clientX : 0,
        y: touches[0] ? touches[0].clientY : 0,
        distance: this.getTouchDistance(touches),
      };
    },

    onTouchMove(event) {
      if (!this._root || !this._touchState) return;
      const touches = event.touches || [];
      if (touches.length > 1) {
        const nextDistance = this.getTouchDistance(touches);
        if (nextDistance && this._touchState.distance) {
          const ratio = nextDistance / this._touchState.distance;
          this.setCameraZoom(this._camera.position.z / Math.max(0.82, Math.min(ratio, 1.18)));
          this._touchState.distance = nextDistance;
        }
        return;
      }
      const touch = touches[0];
      if (!touch) return;
      const dx = touch.clientX - this._touchState.x;
      const dy = touch.clientY - this._touchState.y;
      this._root.rotation.y += dx * 0.01;
      this._root.rotation.x += dy * 0.006;
      this._root.rotation.x = Math.max(-0.7, Math.min(0.7, this._root.rotation.x));
      this._touchState.x = touch.clientX;
      this._touchState.y = touch.clientY;
    },

    onTouchEnd() {
      this._touchState = null;
    },

    getTouchDistance(touches) {
      if (!touches || touches.length < 2) return 0;
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    },

    resetView() {
      if (!this._root) return;
      this._root.rotation.set(0, 0, 0);
      this.setCameraZoom(this._baseCameraZ || 5.2);
      this._autoRotate = true;
      this.setData({ statusText: 'View reset' });
    },

    zoomIn() {
      if (!this._camera) return;
      this._autoRotate = false;
      this.setCameraZoom(this._camera.position.z * 0.84);
      this.setData({ statusText: 'Zoom in - pinch also works' });
    },

    zoomOut() {
      if (!this._camera) return;
      this._autoRotate = false;
      this.setCameraZoom(this._camera.position.z * 1.18);
      this.setData({ statusText: 'Zoom out - pinch also works' });
    },

    setCameraZoom(nextZ) {
      if (!this._camera) return;
      const minZ = this._minCameraZ || 2.2;
      const maxZ = this._maxCameraZ || 9.4;
      this._camera.position.z = Math.max(minZ, Math.min(maxZ, nextZ));
      this._camera.updateProjectionMatrix();
    },

    chooseTone(event) {
      const tone = event.currentTarget.dataset.tone || 'dark';
      this.setData({ activeTone: tone });
      this.applyTone(tone);
    },

    applyTone(tone) {
      if (!this._root || !this._three) return;
      const color = TONES[tone] || TONES.dark;
      this._root.traverse((node) => {
        if (!node.isMesh || !node.material) return;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach((material) => {
          if (!material.color) return;
          material.color.setHex(color);
          material.needsUpdate = true;
        });
      });
    },

    getErrorMessage(error) {
      if (!error) return 'Unknown error';
      return error.message || error.errMsg || String(error);
    },

    disposeViewer() {
      if (this._canvas && this._frameId && this._canvas.cancelAnimationFrame) {
        this._canvas.cancelAnimationFrame(this._frameId);
      } else if (this._frameId) {
        clearTimeout(this._frameId);
      }
      if (this._renderer) this._renderer.dispose();
      this._renderer = null;
      this._scene = null;
      this._camera = null;
      this._root = null;
      this._canvas = null;
      this._loader = null;
      this._started = false;
    },
  },
});
