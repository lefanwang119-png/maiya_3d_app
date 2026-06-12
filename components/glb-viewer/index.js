const TYPE_SIZE = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
};

const COMPONENT = {
  5120: { size: 1, read: 'getInt8', array: Int8Array },
  5121: { size: 1, read: 'getUint8', array: Uint8Array },
  5122: { size: 2, read: 'getInt16', array: Int16Array },
  5123: { size: 2, read: 'getUint16', array: Uint16Array },
  5125: { size: 4, read: 'getUint32', array: Uint32Array },
  5126: { size: 4, read: 'getFloat32', array: Float32Array },
};

const TEXTURE_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function mat4Identity() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function mat4Multiply(a, b) {
  const out = new Array(16);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[col * 4 + row] =
        a[row] * b[col * 4] +
        a[4 + row] * b[col * 4 + 1] +
        a[8 + row] * b[col * 4 + 2] +
        a[12 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

function mat4Perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  const nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}

function mat4Translate(z) {
  const out = mat4Identity();
  out[14] = z;
  return out;
}

function mat4RotateX(rad) {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
}

function mat4RotateY(rad) {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}

function readText(buffer, offset, length) {
  const bytes = new Uint8Array(buffer, offset, length);
  let text = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    text += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return decodeURIComponent(escape(text));
}

function makeFallbackNormals(count) {
  const normals = new Float32Array(count * 3);
  for (let i = 0; i < normals.length; i += 3) {
    normals[i + 2] = 1;
  }
  return normals;
}

function makeFallbackUvs(count) {
  return new Float32Array(count * 2);
}

function convertTexcoords(accessor) {
  if (accessor.array instanceof Float32Array && !accessor.normalized) {
    return accessor.array;
  }
  const out = new Float32Array(accessor.array.length);
  let divisor = 1;
  if (accessor.normalized) {
    if (accessor.componentType === 5121) divisor = 255;
    if (accessor.componentType === 5123) divisor = 65535;
  }
  for (let i = 0; i < accessor.array.length; i += 1) {
    out[i] = accessor.array[i] / divisor;
  }
  return out;
}

function convertColors(accessor, count) {
  if (!accessor) {
    const colors = new Float32Array(count * 4);
    for (let i = 0; i < count; i += 1) {
      colors[i * 4] = 1;
      colors[i * 4 + 1] = 1;
      colors[i * 4 + 2] = 1;
      colors[i * 4 + 3] = 1;
    }
    return { colors, enabled: false };
  }

  const itemSize = accessor.itemSize || 3;
  const colors = new Float32Array(count * 4);
  let divisor = 1;
  if (accessor.normalized) {
    if (accessor.componentType === 5121) divisor = 255;
    if (accessor.componentType === 5123) divisor = 65535;
  }
  for (let i = 0; i < count; i += 1) {
    colors[i * 4] = accessor.array[i * itemSize] / divisor;
    colors[i * 4 + 1] = accessor.array[i * itemSize + 1] / divisor;
    colors[i * 4 + 2] = accessor.array[i * itemSize + 2] / divisor;
    colors[i * 4 + 3] = itemSize >= 4 ? accessor.array[i * itemSize + 3] / divisor : 1;
  }
  return { colors, enabled: true };
}

function parseGlb(buffer) {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67) {
    throw new Error('Invalid GLB file');
  }

  let offset = 12;
  let json = null;
  let binStart = 0;
  let binLength = 0;
  while (offset + 8 <= view.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    offset += 8;
    if (chunkType === 0x4e4f534a) {
      json = JSON.parse(readText(buffer, offset, chunkLength).trim());
    } else if (chunkType === 0x004e4942) {
      binStart = offset;
      binLength = chunkLength;
    }
    offset += chunkLength;
  }

  if (!json || !binStart || !binLength) {
    throw new Error('Incomplete GLB content');
  }

  const getBufferViewRange = (bufferViewIndex) => {
    const bufferView = json.bufferViews[bufferViewIndex];
    if (!bufferView) return null;
    const start = binStart + (bufferView.byteOffset || 0);
    const length = bufferView.byteLength || 0;
    return { start, length };
  };

  const readAccessor = (accessorIndex) => {
    const accessor = json.accessors[accessorIndex];
    const bufferView = json.bufferViews[accessor.bufferView];
    const component = COMPONENT[accessor.componentType];
    const itemSize = TYPE_SIZE[accessor.type];
    const count = accessor.count;
    const stride = bufferView.byteStride || component.size * itemSize;
    const start = binStart + (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
    const total = count * itemSize;

    if (stride === component.size * itemSize) {
      const byteLength = total * component.size;
      return {
        array: new component.array(buffer.slice(start, start + byteLength)),
        itemSize,
        componentType: accessor.componentType,
        normalized: Boolean(accessor.normalized),
      };
    }

    const out = new component.array(total);
    for (let i = 0; i < count; i += 1) {
      for (let j = 0; j < itemSize; j += 1) {
        out[i * itemSize + j] = view[component.read](start + i * stride + j * component.size, true);
      }
    }
    return { array: out, itemSize, componentType: accessor.componentType, normalized: Boolean(accessor.normalized) };
  };

  const images = (json.images || []).map((image, index) => {
    if (image.bufferView !== undefined) {
      const range = getBufferViewRange(image.bufferView);
      const mimeType = image.mimeType || 'image/png';
      return {
        index,
        mimeType,
        ext: TEXTURE_EXT[mimeType] || 'png',
        buffer: buffer.slice(range.start, range.start + range.length),
      };
    }
    if (image.uri && image.uri.indexOf('data:') === 0) {
      return { index, dataUri: image.uri };
    }
    return { index, uri: image.uri || '' };
  });

  const getTextureSource = (textureIndex) => {
    if (textureIndex === undefined || textureIndex === null) return null;
    const texture = json.textures && json.textures[textureIndex];
    if (!texture) return null;
    if (texture.source !== undefined && texture.source !== null) return texture.source;
    const textureExt = texture.extensions || {};
    const basisu = textureExt.KHR_texture_basisu || textureExt.EXT_texture_webp;
    if (basisu && basisu.source !== undefined) return basisu.source;
    return null;
  };

  const materials = (json.materials || []).map((material) => {
    const pbr = material.pbrMetallicRoughness || {};
    const extensions = material.extensions || {};
    const specGloss = extensions.KHR_materials_pbrSpecularGlossiness || {};
    const textureInfo = pbr.baseColorTexture || specGloss.diffuseTexture || material.emissiveTexture || null;
    const textureIndex = textureInfo && textureInfo.index;
    const imageIndex = getTextureSource(textureIndex);
    return {
      baseColor: pbr.baseColorFactor || specGloss.diffuseFactor || [0.86, 0.9, 0.92, 1],
      imageIndex,
    };
  });

  const primitives = [];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const stats = {
    meshCount: (json.meshes || []).length,
    imageCount: images.length,
    textureCount: (json.textures || []).length,
    materialCount: materials.length,
    texturedPrimitiveCount: 0,
    coloredPrimitiveCount: 0,
  };

  (json.meshes || []).forEach((mesh) => {
    (mesh.primitives || []).forEach((primitive) => {
      if (!primitive.attributes || primitive.attributes.POSITION === undefined) return;
      const position = readAccessor(primitive.attributes.POSITION);
      const normal = primitive.attributes.NORMAL === undefined ? null : readAccessor(primitive.attributes.NORMAL);
      const texcoord = primitive.attributes.TEXCOORD_0 === undefined ? null : readAccessor(primitive.attributes.TEXCOORD_0);
      const color = primitive.attributes.COLOR_0 === undefined ? null : readAccessor(primitive.attributes.COLOR_0);
      const indices = primitive.indices === undefined ? null : readAccessor(primitive.indices);
      const positions = position.array instanceof Float32Array ? position.array : Float32Array.from(position.array);
      const normals = normal ? (normal.array instanceof Float32Array ? normal.array : Float32Array.from(normal.array)) : makeFallbackNormals(positions.length / 3);
      const uvs = texcoord ? convertTexcoords(texcoord) : makeFallbackUvs(positions.length / 3);
      const vertexColor = convertColors(color, positions.length / 3);
      const material = materials[primitive.material || 0] || materials[0] || { baseColor: [0.86, 0.9, 0.92, 1], imageIndex: null };
      if (material.imageIndex !== null && material.imageIndex !== undefined) stats.texturedPrimitiveCount += 1;
      if (vertexColor.enabled) stats.coloredPrimitiveCount += 1;

      for (let i = 0; i < positions.length; i += 3) {
        min[0] = Math.min(min[0], positions[i]);
        min[1] = Math.min(min[1], positions[i + 1]);
        min[2] = Math.min(min[2], positions[i + 2]);
        max[0] = Math.max(max[0], positions[i]);
        max[1] = Math.max(max[1], positions[i + 1]);
        max[2] = Math.max(max[2], positions[i + 2]);
      }

      primitives.push({
        positions,
        normals,
        uvs,
        colors: vertexColor.colors,
        useVertexColor: vertexColor.enabled,
        indices: indices && indices.array,
        indexType: indices && indices.componentType,
        baseColor: material.baseColor,
        imageIndex: material.imageIndex,
      });
    });
  });

  if (!primitives.length || !Number.isFinite(min[0])) {
    throw new Error('No renderable mesh in GLB');
  }

  const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const maxDim = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 0.0001);
  const fitScale = 2.1 / maxDim;
  primitives.forEach((primitive) => {
    for (let i = 0; i < primitive.positions.length; i += 3) {
      primitive.positions[i] = (primitive.positions[i] - center[0]) * fitScale;
      primitive.positions[i + 1] = (primitive.positions[i + 1] - center[1]) * fitScale;
      primitive.positions[i + 2] = (primitive.positions[i + 2] - center[2]) * fitScale;
    }
  });

  return { primitives, images, stats };
}

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || 'Shader compile failed');
  }
  return shader;
}

function createProgram(gl) {
  const vertex = createShader(gl, gl.VERTEX_SHADER, `
    attribute vec3 a_position;
    attribute vec3 a_normal;
    attribute vec2 a_uv;
    attribute vec4 a_color;
    uniform mat4 u_matrix;
    uniform mat4 u_model;
    varying float v_light;
    varying vec2 v_uv;
    varying vec4 v_color;
    void main() {
      vec3 normal = normalize((u_model * vec4(a_normal, 0.0)).xyz);
      vec3 light = normalize(vec3(0.35, 0.7, 0.55));
      v_light = 0.56 + max(dot(normal, light), 0.0) * 0.44;
      v_uv = a_uv;
      v_color = a_color;
      gl_Position = u_matrix * vec4(a_position, 1.0);
    }
  `);
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, `
    precision mediump float;
    varying float v_light;
    varying vec2 v_uv;
    varying vec4 v_color;
    uniform sampler2D u_texture;
    uniform vec4 u_baseColor;
    uniform float u_useTexture;
    uniform float u_useVertexColor;
    void main() {
      vec4 tex = texture2D(u_texture, v_uv);
      vec4 base = mix(u_baseColor, v_color, u_useVertexColor);
      vec4 color = mix(base, tex, u_useTexture);
      gl_FragColor = vec4(color.rgb * v_light, color.a);
    }
  `);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || 'WebGL program failed');
  }
  return program;
}

function isLocalPath(value = '') {
  return /^(wxfile:|http:\/\/tmp\/|\/|[a-zA-Z]:\\)/.test(String(value));
}

Component({
  properties: {
    fileId: String,
    src: String,
  },

  data: {
    loading: true,
    error: '',
    renderMode: 'texture',
  },

  lifetimes: {
    ready() {
      this.initCanvas();
    },
    detached() {
      this.stopRender();
    },
  },

  observers: {
    'fileId, src': function watchSource() {
      if (this.canvasReady) this.loadModel();
    },
  },

  methods: {
    initCanvas() {
      wx.createSelectorQuery()
        .in(this)
        .select('#glb-canvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          const canvas = res && res[0] && res[0].node;
          if (!canvas) {
            this.setData({ loading: false, error: 'Canvas not found' });
            return;
          }
          this.canvas = canvas;
          const sys = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
          const pixelRatio = sys.pixelRatio || 1;
          canvas.width = Math.max(1, Math.floor((res[0].width || 300) * pixelRatio));
          canvas.height = Math.max(1, Math.floor((res[0].height || 260) * pixelRatio));
          this.gl = canvas.getContext('webgl', { antialias: true, alpha: true });
          if (!this.gl) {
            this.setData({ loading: false, error: 'WebGL is unavailable' });
            return;
          }
          this.canvasReady = true;
          this.setupGL();
          this.loadModel();
        });
    },

    setupGL() {
      const gl = this.gl;
      this.program = createProgram(gl);
      this.locations = {
        position: gl.getAttribLocation(this.program, 'a_position'),
        normal: gl.getAttribLocation(this.program, 'a_normal'),
        uv: gl.getAttribLocation(this.program, 'a_uv'),
        color: gl.getAttribLocation(this.program, 'a_color'),
        matrix: gl.getUniformLocation(this.program, 'u_matrix'),
        model: gl.getUniformLocation(this.program, 'u_model'),
        texture: gl.getUniformLocation(this.program, 'u_texture'),
        baseColor: gl.getUniformLocation(this.program, 'u_baseColor'),
        useTexture: gl.getUniformLocation(this.program, 'u_useTexture'),
        useVertexColor: gl.getUniformLocation(this.program, 'u_useVertexColor'),
      };
      gl.enable(gl.DEPTH_TEST);
      gl.clearColor(0.02, 0.025, 0.04, 1);
      this.defaultTexture = this.createSolidTexture([255, 255, 255, 255]);
      this.rotationX = -0.18;
      this.rotationY = 0.55;
    },

    loadModel() {
      const { fileId, src } = this.properties;
      if (!fileId && !src) return;
      this.setData({ loading: true, error: '' });
      this.getArrayBuffer(fileId, src)
        .then((buffer) => {
          const parsed = parseGlb(buffer);
          console.log('[glb-viewer:parsed]', parsed.stats);
          return this.loadTextures(parsed.images).then((textures) => ({ primitives: parsed.primitives, textures, stats: parsed.stats }));
        })
        .then(({ primitives, textures, stats }) => {
          const loadedTextureCount = Object.keys(textures).length;
          console.log('[glb-viewer:textures]', {
            available: loadedTextureCount,
            expectedImages: stats.imageCount,
            texturedPrimitiveCount: stats.texturedPrimitiveCount,
            coloredPrimitiveCount: stats.coloredPrimitiveCount,
          });
          if (stats.texturedPrimitiveCount > 0 && loadedTextureCount === 0) {
            console.warn('[glb-viewer:textures] GLB has texture references, but no texture image was loaded.');
          }
          if (stats.texturedPrimitiveCount === 0) {
            console.warn('[glb-viewer:textures] GLB has no baseColorTexture. Check EnablePBR/GenerateType in submit payload.');
          }
          this.uploadPrimitives(primitives, textures);
          this.setData({ loading: false, error: '' });
          this.triggerEvent('loaded', { primitiveCount: primitives.length });
          this.startRender();
        })
        .catch((err) => {
          console.warn('[glb-viewer:error]', err);
          this.setData({ loading: false, error: err.message || 'Preview failed' });
          this.triggerEvent('error', err);
        });
    },

    getArrayBuffer(fileId, src) {
      if (src && isLocalPath(src)) {
        return this.readFileAsArrayBuffer(src);
      }

      const download = fileId && wx.cloud && wx.cloud.downloadFile
        ? wx.cloud.downloadFile({ fileID: fileId })
        : new Promise((resolve, reject) => wx.downloadFile({ url: src, success: resolve, fail: reject }));

      return download.then((res) => this.readFileAsArrayBuffer(res.tempFilePath));
    },

    readFileAsArrayBuffer(filePath) {
      return new Promise((resolve, reject) => {
        wx.getFileSystemManager().readFile({
          filePath,
          success: (file) => resolve(file.data),
          fail: reject,
        });
      });
    },

    loadTextures(images) {
      const tasks = (images || []).map((image) => this.loadTexture(image).catch((err) => {
        console.warn('[glb-viewer:texture-failed]', image.index, err);
        return null;
      }));
      return Promise.all(tasks).then((list) => {
        const map = {};
        list.forEach((texture, index) => {
          if (texture) map[images[index].index] = texture;
        });
        return map;
      });
    },

    loadTexture(image) {
      if (!image) return Promise.resolve(null);
      if (image.buffer) {
        const fs = wx.getFileSystemManager();
        const filePath = `${wx.env.USER_DATA_PATH}/maiya-texture-${Date.now()}-${image.index}.${image.ext || 'png'}`;
        return new Promise((resolve, reject) => {
          fs.writeFile({
            filePath,
            data: image.buffer,
            success: () => this.createTextureFromPath(filePath).then(resolve).catch(reject),
            fail: reject,
          });
        });
      }
      if (image.dataUri) return this.createTextureFromPath(image.dataUri);
      if (image.uri) return this.createTextureFromPath(image.uri);
      return Promise.resolve(null);
    },

    createSolidTexture(color) {
      const gl = this.gl;
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(color));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return texture;
    },

    createTextureFromPath(path) {
      return new Promise((resolve, reject) => {
        const image = this.canvas.createImage();
        image.onload = () => {
          const gl = this.gl;
          const texture = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          resolve(texture);
        };
        image.onerror = reject;
        image.src = path;
      });
    },

    uploadPrimitives(primitives, textures) {
      const gl = this.gl;
      const canUseUint32 = Boolean(gl.getExtension('OES_element_index_uint'));
      this.meshes = primitives.map((primitive) => {
        if (primitive.indexType === 5125 && primitive.indices && !canUseUint32) {
          const positions = new Float32Array(primitive.indices.length * 3);
          const normals = new Float32Array(primitive.indices.length * 3);
          const uvs = new Float32Array(primitive.indices.length * 2);
          const colors = new Float32Array(primitive.indices.length * 4);
          primitive.indices.forEach((sourceIndex, index) => {
            positions[index * 3] = primitive.positions[sourceIndex * 3];
            positions[index * 3 + 1] = primitive.positions[sourceIndex * 3 + 1];
            positions[index * 3 + 2] = primitive.positions[sourceIndex * 3 + 2];
            normals[index * 3] = primitive.normals[sourceIndex * 3];
            normals[index * 3 + 1] = primitive.normals[sourceIndex * 3 + 1];
            normals[index * 3 + 2] = primitive.normals[sourceIndex * 3 + 2];
            uvs[index * 2] = primitive.uvs[sourceIndex * 2];
            uvs[index * 2 + 1] = primitive.uvs[sourceIndex * 2 + 1];
            colors[index * 4] = primitive.colors[sourceIndex * 4];
            colors[index * 4 + 1] = primitive.colors[sourceIndex * 4 + 1];
            colors[index * 4 + 2] = primitive.colors[sourceIndex * 4 + 2];
            colors[index * 4 + 3] = primitive.colors[sourceIndex * 4 + 3];
          });
          primitive.positions = positions;
          primitive.normals = normals;
          primitive.uvs = uvs;
          primitive.colors = colors;
          primitive.indices = null;
          primitive.indexType = null;
        }

        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, primitive.positions, gl.STATIC_DRAW);

        const normalBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, primitive.normals, gl.STATIC_DRAW);

        const uvBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, primitive.uvs, gl.STATIC_DRAW);

        const colorBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, primitive.colors, gl.STATIC_DRAW);

        let indexBuffer = null;
        let indexType = null;
        let count = primitive.positions.length / 3;
        if (primitive.indices) {
          indexBuffer = gl.createBuffer();
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
          gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, primitive.indices, gl.STATIC_DRAW);
          count = primitive.indices.length;
          indexType = primitive.indexType === 5125 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
        }

        const texture = textures[primitive.imageIndex] || null;
        return {
          positionBuffer,
          normalBuffer,
          uvBuffer,
          colorBuffer,
          indexBuffer,
          indexType,
          count,
          texture,
          baseColor: primitive.baseColor || [0.86, 0.9, 0.92, 1],
          useVertexColor: primitive.useVertexColor,
        };
      });
    },

    startRender() {
      this.stopRender();
      const render = () => {
        this.draw();
        this.frameId = this.canvas.requestAnimationFrame(render);
      };
      this.frameId = this.canvas.requestAnimationFrame(render);
    },

    stopRender() {
      if (this.canvas && this.frameId) {
        this.canvas.cancelAnimationFrame(this.frameId);
      }
      this.frameId = null;
    },

    draw() {
      const gl = this.gl;
      if (!gl || !this.meshes || !this.meshes.length) return;
      const width = this.canvas.width || 1;
      const height = this.canvas.height || 1;
      gl.viewport(0, 0, width, height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(this.program);

      const projection = mat4Perspective(Math.PI / 4, width / height, 0.01, 100);
      const view = mat4Translate(-4.2);
      const model = mat4Multiply(mat4RotateY(this.rotationY), mat4RotateX(this.rotationX));
      const matrix = mat4Multiply(mat4Multiply(projection, view), model);
      gl.uniformMatrix4fv(this.locations.matrix, false, new Float32Array(matrix));
      gl.uniformMatrix4fv(this.locations.model, false, new Float32Array(model));
      gl.uniform1i(this.locations.texture, 0);

      this.meshes.forEach((mesh) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer);
        gl.enableVertexAttribArray(this.locations.position);
        gl.vertexAttribPointer(this.locations.position, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normalBuffer);
        gl.enableVertexAttribArray(this.locations.normal);
        gl.vertexAttribPointer(this.locations.normal, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.uvBuffer);
        gl.enableVertexAttribArray(this.locations.uv);
        gl.vertexAttribPointer(this.locations.uv, 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.colorBuffer);
        gl.enableVertexAttribArray(this.locations.color);
        gl.vertexAttribPointer(this.locations.color, 4, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        const whiteMode = this.data.renderMode === 'white';
        gl.bindTexture(gl.TEXTURE_2D, whiteMode ? this.defaultTexture : (mesh.texture || this.defaultTexture));
        gl.uniform4fv(this.locations.baseColor, new Float32Array(whiteMode ? [0.92, 0.94, 0.96, 1] : (mesh.texture ? [1, 1, 1, 1] : mesh.baseColor)));
        gl.uniform1f(this.locations.useTexture, !whiteMode && mesh.texture ? 1 : 0);
        gl.uniform1f(this.locations.useVertexColor, !whiteMode && mesh.useVertexColor ? 1 : 0);

        if (mesh.indexBuffer) {
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
          gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0);
        } else {
          gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
        }
      });
    },

    handleTouchStart(event) {
      const touch = event.touches && event.touches[0];
      if (!touch) return;
      this.touchStart = {
        x: touch.clientX,
        y: touch.clientY,
        rx: this.rotationX,
        ry: this.rotationY,
      };
    },

    handleTouchMove(event) {
      const touch = event.touches && event.touches[0];
      if (!touch || !this.touchStart) return;
      this.rotationY = this.touchStart.ry + (touch.clientX - this.touchStart.x) * 0.012;
      this.rotationX = Math.max(-1.3, Math.min(1.3, this.touchStart.rx + (touch.clientY - this.touchStart.y) * 0.012));
    },

    handleTouchEnd() {
      this.touchStart = null;
    },

    switchRenderMode(event) {
      const mode = event.currentTarget.dataset.mode;
      if (mode !== 'white' && mode !== 'texture') return;
      this.setData({ renderMode: mode });
    },
  },
});
