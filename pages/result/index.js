function formatCreditDetails(details) {
  if (!details || typeof details !== 'object') return [];
  return Object.keys(details).map((key) => ({
    key,
    value: details[key],
  }));
}

function getCloudUrl(file) {
  return file.MaiyaCloudUrl || file.maiyaCloudUrl || file.CloudUrl || file.cloudUrl || '';
}

function getCloudFileID(file) {
  return file.maiyaCloudFileID || file.MaiyaCloudFileID || file.CloudFileID || file.cloudFileID || '';
}

function getSourceUrl(file) {
  return file.Url || file.url || file.FileUrl || file.fileUrl || '';
}

function getPreviewUrl(file) {
  return file.MaiyaPreviewCloudUrl || file.maiyaPreviewCloudUrl || file.PreviewImageUrl || file.previewImageUrl || '';
}

function getPreviewFileID(file) {
  return file.MaiyaPreviewCloudFileID || file.maiyaPreviewCloudFileID || '';
}

function normalizeFileItems(files = []) {
  return files.map((file, index) => {
    const type = String(file.Type || file.type || 'FILE').toUpperCase();
    const sourceUrl = getSourceUrl(file);
    const cloudUrl = getCloudUrl(file);
    return {
      id: `${type}-${index}`,
      type,
      url: cloudUrl || sourceUrl,
      fileID: getCloudFileID(file),
      sourceUrl,
      previewImageUrl: getPreviewUrl(file),
      title: type === 'OBJ' ? 'OBJ 源文件包' : `${type} 文件`,
      desc: type === 'OBJ' ? '包含 OBJ 模型与贴图资源' : '可用于 3D 预览或外部软件',
    };
  });
}

function deriveAssetsFromFiles(assets) {
  const next = { ...assets };
  const files = Array.isArray(assets.resultFiles) ? assets.resultFiles : [];

  files.forEach((file) => {
    const type = String(file.Type || file.type || '').toLowerCase();
    const sourceUrl = getSourceUrl(file);
    const cloudUrl = getCloudUrl(file);
    const fileID = getCloudFileID(file);
    const previewUrl = getPreviewUrl(file);
    const previewFileID = getPreviewFileID(file);

    if (!next.glbUrl && (type.includes('glb') || /\.glb(\?|$)/i.test(sourceUrl))) {
      next.glbUrl = cloudUrl || sourceUrl;
      next.glbViewUrl = cloudUrl || sourceUrl;
      next.glbFileID = fileID || '';
    }

    if (!next.objUrl && (type.includes('obj') || /\.zip(\?|$)/i.test(sourceUrl) || /\.obj(\?|$)/i.test(sourceUrl))) {
      next.objUrl = cloudUrl || sourceUrl;
      next.objFileID = fileID || '';
    }

    if (!next.videoUrl && (type.includes('mp4') || type.includes('video') || /\.mp4(\?|$)/i.test(sourceUrl))) {
      next.videoUrl = cloudUrl || sourceUrl;
      next.videoFileID = fileID || '';
    }

    if (!next.previewImageUrl && previewUrl) {
      next.previewImageUrl = previewUrl;
      next.previewImageFileID = previewFileID || '';
    }
  });

  return next;
}

function getFileName(type) {
  const lower = String(type || 'file').toLowerCase();
  if (lower === 'obj') return 'maiya3d-model-obj.zip';
  if (lower === 'glb') return 'maiya3d-model.glb';
  if (lower === 'mp4') return 'maiya3d-preview.mp4';
  if (lower === 'preview') return 'maiya3d-preview.png';
  return `maiya3d-${lower}`;
}

function formatError(error, fallback = '操作失败') {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (typeof error.message === 'string') return error.message;
  if (typeof error.errMsg === 'string') return error.errMsg;
  try {
    return JSON.stringify(error);
  } catch (err) {
    return fallback;
  }
}

function showToast(title) {
  wx.showToast({ title, icon: 'none' });
}

function getExportTitle(type) {
  const lower = String(type || '').toLowerCase();
  if (lower === 'glb') return 'GLB 文件已准备好';
  if (lower === 'obj') return 'OBJ 文件已准备好';
  if (lower === 'preview') return '预览图已准备好';
  if (lower === 'mp4') return 'MP4 已准备好';
  return '文件已准备好';
}

function canUseCloud() {
  return Boolean(wx.cloud && wx.cloud.callFunction);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseGlbBounds(buffer) {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67) {
    throw new Error('不是标准 GLB 文件');
  }

  let offset = 12;
  let json = null;
  while (offset + 8 <= view.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    offset += 8;
    if (chunkType === 0x4e4f534a) {
      const jsonText = String.fromCharCode.apply(null, new Uint8Array(buffer, offset, chunkLength));
      json = JSON.parse(jsonText.trim());
      break;
    }
    offset += chunkLength;
  }

  if (!json || !Array.isArray(json.meshes) || !Array.isArray(json.accessors)) {
    throw new Error('GLB 缺少 mesh/accessor 信息');
  }

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  json.meshes.forEach((mesh) => {
    (mesh.primitives || []).forEach((primitive) => {
      const accessorIndex = primitive.attributes && primitive.attributes.POSITION;
      const accessor = json.accessors[accessorIndex];
      if (!accessor || !Array.isArray(accessor.min) || !Array.isArray(accessor.max)) return;
      for (let i = 0; i < 3; i += 1) {
        min[i] = Math.min(min[i], accessor.min[i]);
        max[i] = Math.max(max[i], accessor.max[i]);
      }
    });
  });

  if (!Number.isFinite(min[0]) || !Number.isFinite(max[0])) {
    throw new Error('GLB 未提供 POSITION 边界');
  }

  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const maxDim = Math.max(size[0], size[1], size[2]);
  const scale = clamp(1.6 / Math.max(maxDim, 0.0001), 0.001, 8);
  const position = [
    Number((-center[0] * scale).toFixed(4)),
    Number((-center[1] * scale).toFixed(4)),
    Number((-2 - center[2] * scale).toFixed(4)),
  ];

  return {
    min,
    max,
    size,
    center,
    maxDim,
    scale: Number(scale.toFixed(5)),
    position: `${position[0]} ${position[1]} ${position[2]}`,
  };
}

Page({
  data: {
    glbPath: '',
    objPath: '',
    videoPath: '',
    previewImagePath: '',
    glbUrl: '',
    glbViewUrl: '',
    objUrl: '',
    videoUrl: '',
    previewImageUrl: '',
    glbFileID: '',
    objFileID: '',
    videoFileID: '',
    previewImageFileID: '',
    viewerSrc: '',
    viewerReady: false,
    rotateX: 0,
    rotateY: 180,
    scale: 0.8,
    modelPosition: '0 0 -2',
    modelLoaded: false,
    modelLoadFailed: false,
    resultFiles: [],
    fileItems: [],
    resultCreditConsumed: 0,
    resultCreditDetails: {},
    creditItems: [],
    requestId: '',
    jobId: '',
    savedAtText: '',
    exportingType: '',
    preparingPreview: false,
    assetError: '',
    preparedExportPath: '',
    preparedExportType: '',
    preparedExportName: '',
    previewFallbackStarted: false,
  },

  touchStart: null,

  onLoad() {
    const cachedAssets = wx.getStorageSync('latestAi3dAssets') || {};
    const assets = deriveAssetsFromFiles(cachedAssets);
    wx.setStorageSync('latestAi3dAssets', assets);

    const hasCloudGlb = Boolean(assets.glbFileID);
    this.setData({
      ...assets,
      viewerSrc: '',
      viewerReady: false,
      fileItems: normalizeFileItems(assets.resultFiles || []),
      creditItems: formatCreditDetails(assets.resultCreditDetails),
      savedAtText: assets.savedAt ? this.formatTime(assets.savedAt) : '',
      modelLoadFailed: false,
      assetError: !assets.glbUrl && !assets.glbViewUrl ? '接口没有返回 GLB 文件，仅可查看预览图或导出 OBJ。' : '',
    });

    if (hasCloudGlb) {
      this.prepareCloudGlbPreview(assets.glbFileID);
    } else if (assets.glbUrl || assets.glbViewUrl) {
      this.prepareDirectGlbPreview(assets.glbViewUrl || assets.glbUrl);
    }
  },

  formatTime(value) {
    const date = new Date(value);
    const pad = (num) => String(num).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  },

  handleBack() {
    wx.navigateBack();
  },

  handleTouchStart(event) {
    const touch = event.touches[0];
    this.touchStart = {
      x: touch.clientX,
      y: touch.clientY,
      rotateX: this.data.rotateX,
      rotateY: this.data.rotateY,
    };
  },

  handleTouchMove(event) {
    if (!this.touchStart) return;
    const touch = event.touches[0];
    const dx = touch.clientX - this.touchStart.x;
    const dy = touch.clientY - this.touchStart.y;
    this.setData({
      rotateX: Math.max(-70, Math.min(70, this.touchStart.rotateX + dy * 0.35)),
      rotateY: this.touchStart.rotateY + dx * 0.5,
    });
  },

  handleTouchEnd() {
    this.touchStart = null;
  },

  handleViewerReady(event) {
    console.log('[result:xr-ready]', event.detail || {});
  },

  handleModelProgress(event) {
    console.log('[result:xr-progress]', event.detail || {});
  },

  handleModelLoaded() {
    console.log('[result:xr-loaded]');
    this.setData({ modelLoaded: true, modelLoadFailed: false, preparingPreview: false });
  },

  handleModelError(event) {
    console.warn('[result:model-error]', event.detail || event);
    const canFallbackToCloud = !this.data.glbFileID && !this.data.previewFallbackStarted && (this.data.glbUrl || this.data.glbViewUrl) && canUseCloud();
    this.setData({ modelLoadFailed: true, modelLoaded: false });
    if (canFallbackToCloud) {
      this.setData({
        previewFallbackStarted: true,
        viewerReady: false,
        viewerSrc: '',
        modelLoadFailed: false,
        assetError: '直连预览失败，正在切换云端预览通道。',
      });
      this.preparePreviewModel();
    }
  },

  resetView() {
    this.setData({ rotateX: 0, rotateY: 180, scale: 0.8 });
  },

  prepareDirectGlbPreview(url) {
    if (!url) return;
    console.log('[result:direct-glb-preview-url]', url);
    this.setData({
      scale: 0.2,
      modelPosition: '0 0 -2',
      viewerSrc: url,
      viewerReady: true,
      preparingPreview: false,
      modelLoaded: false,
      modelLoadFailed: false,
      assetError: '',
    });
  },

  preparePreviewModel() {
    if (this.data.preparingPreview || !this.data.glbUrl || !canUseCloud()) return;
    this.setData({
      preparingPreview: true,
      viewerReady: false,
      viewerSrc: '',
      modelLoaded: false,
      modelLoadFailed: false,
      assetError: '',
    });

    this.copyAssetToCloud('glb', this.data.glbUrl)
      .then((asset) => {
        const nextAssets = {
          ...wx.getStorageSync('latestAi3dAssets'),
          glbUrl: asset.url || this.data.glbUrl,
          glbViewUrl: asset.url || this.data.glbViewUrl,
          glbFileID: asset.fileID || '',
        };
        wx.setStorageSync('latestAi3dAssets', nextAssets);
        this.setData({
          glbUrl: nextAssets.glbUrl,
          glbViewUrl: nextAssets.glbViewUrl,
          glbFileID: nextAssets.glbFileID,
          preparingPreview: false,
        });
        if (nextAssets.glbFileID) {
          this.prepareCloudGlbPreview(nextAssets.glbFileID);
        }
      })
      .catch((err) => {
        console.warn('[result:prepare-preview-failed]', err);
        this.setData({
          preparingPreview: false,
          assetError: formatError(err, 'GLB 云文件准备失败，请确认 hunyuan3d 云函数已部署并把超时时间调到 60 秒。'),
        });
      });
  },

  prepareCloudGlbPreview(fileID) {
    if (!fileID || !(wx.cloud && wx.cloud.getTempFileURL)) return;
    this.setData({
      preparingPreview: true,
      viewerReady: false,
      viewerSrc: '',
      modelLoaded: false,
      modelLoadFailed: false,
      assetError: '',
    });

    wx.cloud
      .getTempFileURL({ fileList: [fileID] })
      .then((res) => {
        const file = res.fileList && res.fileList[0];
        const url = file && (file.tempFileURL || file.download_url);
        if (!url) {
          throw new Error('云存储没有返回可预览地址');
        }
        console.log('[result:cloud-glb-preview-url]', url);

        this.setData({
          scale: 0.2,
          modelPosition: '0 0 -2',
          viewerSrc: url,
          viewerReady: true,
          preparingPreview: false,
          modelLoaded: false,
          modelLoadFailed: false,
        });

        wx.cloud
          .downloadFile({ fileID })
          .then((downloadRes) => this.readGlbBounds(downloadRes.tempFilePath))
          .then((fit) => {
            console.log('[result:glb-fit]', fit);
            this.setData({
              scale: fit.scale,
              modelPosition: fit.position,
            });
          })
          .catch((err) => {
            console.warn('[result:glb-bounds-skipped]', err);
          });
      })
      .catch((err) => {
        console.warn('[result:cloud-glb-preview-failed]', err);
        this.setData({
          preparingPreview: false,
          assetError: formatError(err, 'GLB 云预览地址准备失败'),
        });
      });
  },

  readGlbBounds(tempFilePath) {
    const fs = wx.getFileSystemManager();
    return new Promise((resolve, reject) => {
      fs.readFile({
        filePath: tempFilePath,
        success: (res) => {
          try {
            resolve(parseGlbBounds(res.data));
          } catch (err) {
            reject(err);
          }
        },
        fail: reject,
      });
    });
  },

  copyTempFileWithExtension(tempFilePath, ext) {
    if (!tempFilePath) {
      return Promise.reject(new Error('临时文件路径为空'));
    }
    const fs = wx.getFileSystemManager();
    const targetPath = `${wx.env.USER_DATA_PATH}/maiya-preview-${Date.now()}.${ext}`;
    return new Promise((resolve, reject) => {
      fs.copyFile({
        srcPath: tempFilePath,
        destPath: targetPath,
        success: () => resolve(targetPath),
        fail: (copyErr) => {
          console.warn('[result:copyFile:fail]', copyErr);
          if (!fs.saveFile) {
            resolve(tempFilePath);
            return;
          }
          fs.saveFile({
            tempFilePath,
            filePath: targetPath,
            success: (saveRes) => resolve(saveRes.savedFilePath || targetPath || tempFilePath),
            fail: (saveErr) => {
              console.warn('[result:saveFile:fail]', saveErr);
              resolve(tempFilePath);
            },
          });
        },
      });
    });
  },

  copyAssetToCloud(type, url) {
    if (!url || !canUseCloud()) {
      return Promise.reject(new Error('无法准备云文件'));
    }

    const startedAt = Date.now();
    return wx.cloud
      .callFunction({
        name: 'hunyuan3d',
        data: {
          action: 'copyAsset',
          payload: {
            jobId: this.data.jobId || this.data.requestId || `manual-${Date.now()}`,
            type,
            url,
          },
        },
      })
      .then((res) => {
        console.log('[result:copyAsset]', {
          durationMs: Date.now() - startedAt,
          response: res,
        });
        const result = res.result || {};
        if (result.error) {
          throw new Error(result.error);
        }
        return result;
      })
      .catch((err) => {
        throw new Error(formatError(err, '云文件准备失败'));
      });
  },

  exportGlb() {
    this.exportFile('glb', this.data.glbPath, this.data.glbUrl || this.data.glbViewUrl, this.data.glbFileID);
  },

  exportObj() {
    this.exportFile('obj', this.data.objPath, this.data.objUrl, this.data.objFileID);
  },

  exportPreview() {
    const filePath = this.data.previewImagePath;
    if (!filePath) {
      this.exportFile('preview', '', this.data.previewImageUrl, this.data.previewImageFileID);
      return;
    }

    wx.saveImageToPhotosAlbum({
      filePath,
      success: () => wx.showToast({ title: '预览图已保存' }),
      fail: () => this.exportFile('preview', filePath, this.data.previewImageUrl, this.data.previewImageFileID),
    });
  },

  exportMp4() {
    const filePath = this.data.videoPath;
    if (!filePath) {
      this.exportFile('mp4', '', this.data.videoUrl, this.data.videoFileID);
      return;
    }

    wx.saveVideoToPhotosAlbum({
      filePath,
      success: () => wx.showToast({ title: 'MP4 已保存' }),
      fail: () => this.exportFile('mp4', filePath, this.data.videoUrl, this.data.videoFileID),
    });
  },

  exportFromItem(event) {
    const { type, url, fileId } = event.currentTarget.dataset;
    const lower = String(type || '').toLowerCase();
    const localPath = lower === 'glb' ? this.data.glbPath : lower === 'obj' ? this.data.objPath : '';
    this.exportFile(lower, localPath, url, fileId);
  },

  exportFile(type, filePath, url, fileID = '') {
    if (filePath) {
      this.openExportedFile(type, filePath);
      return;
    }

    if (fileID && wx.cloud && wx.cloud.downloadFile) {
      this.downloadCloudFile(type, fileID);
      return;
    }

    if (url && canUseCloud()) {
      this.setData({ exportingType: type });
      this.copyAssetToCloud(type, url)
        .then((asset) => {
          if (asset.fileID) {
            this.downloadCloudFile(type, asset.fileID);
            return;
          }
          if (asset.url) {
            this.downloadUrlFile(type, asset.url);
            return;
          }
          this.setData({ exportingType: '' });
          showToast('云文件准备失败');
        })
        .catch((err) => {
          console.warn('[result:copy-before-export-failed]', err);
          this.setData({ exportingType: '' });
          showToast(formatError(err, '云文件准备失败'));
        });
      return;
    }

    this.downloadUrlFile(type, url);
  },

  downloadCloudFile(type, fileID) {
    this.setData({ exportingType: type });
    console.log('[result:downloadCloudFile:start]', { type, fileID });
    wx.cloud
      .downloadFile({ fileID })
      .then((res) => {
        console.log('[result:downloadCloudFile:success]', res);
        if (res.tempFilePath) {
          this.persistAndExportFile(type, res.tempFilePath);
        } else {
          showToast('云文件下载失败');
        }
      })
      .catch((err) => {
        console.warn('[result:downloadCloudFile:fail]', err);
        showToast(formatError(err, '云文件下载失败'));
      })
      .finally(() => this.setData({ exportingType: '' }));
  },

  downloadUrlFile(type, url) {
    if (!url) {
      showToast('暂无可导出的文件');
      return;
    }

    this.setData({ exportingType: type });
    wx.downloadFile({
      url,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.tempFilePath) {
          this.persistAndExportFile(type, res.tempFilePath);
          this.setData({ exportingType: '' });
        } else {
          this.setData({ exportingType: '' });
          showToast(`文件下载失败：${res.statusCode || ''}`);
        }
      },
      fail: (err) => {
        this.setData({ exportingType: '' });
        showToast(formatError(err, '文件下载失败'));
      },
    });
  },

  persistAndExportFile(type, tempFilePath) {
    const lower = String(type || 'file').toLowerCase();
    const ext = lower === 'preview' ? 'png' : lower;
    this.copyTempFileWithExtension(tempFilePath, ext)
      .then((filePath) => {
        const fileName = getFileName(type);
        console.log('[result:export-file-ready]', { type, filePath, fileName });
        this.setData({
          preparedExportPath: filePath,
          preparedExportType: type,
          preparedExportName: fileName,
        });
        wx.showToast({ title: getExportTitle(type), icon: 'none' });
      })
      .catch((err) => {
        console.warn('[result:prepare-export-file:fail]', err);
        showToast(formatError(err, '文件准备失败'));
      });
  },

  openPreparedExport() {
    const { preparedExportPath, preparedExportType, preparedExportName } = this.data;
    if (!preparedExportPath) {
      showToast('请先点击导出准备文件');
      return;
    }
    this.openExportedFile(preparedExportType, preparedExportPath, preparedExportName);
  },

  openExportedFile(type, filePath, fileName = '') {
    this.setData({ exportingType: '' });
    const finalFileName = fileName || getFileName(type);
    console.log('[result:openExportedFile]', { type, filePath, fileName });

    if (wx.shareFileMessage) {
      wx.shareFileMessage({
        filePath,
        fileName: finalFileName,
        success: () => wx.showToast({ title: '已打开导出面板' }),
        fail: (err) => {
          console.warn('[result:shareFileMessage:fail]', err);
          this.showExportHelp(type, filePath, formatError(err, '文件转发面板打开失败'));
        },
      });
      return;
    }

    this.showExportHelp(type, filePath, '当前环境不支持文件转发面板');
  },

  showExportHelp(type, filePath, reason) {
    wx.showModal({
      title: '文件已准备好',
      content: `${getFileName(type)} 已下载到小程序本地文件。当前环境没有成功打开系统导出面板：${reason}`,
      confirmText: '再试一次',
      cancelText: '知道了',
      success: (res) => {
        if (res.confirm && wx.shareFileMessage) {
          wx.shareFileMessage({
            filePath,
            fileName: getFileName(type),
            fail: (err) => showToast(formatError(err, '导出面板仍无法打开')),
          });
        }
      },
    });
  },
});
