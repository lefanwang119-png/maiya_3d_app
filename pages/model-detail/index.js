import images from '../../config/images';

function formatError(error, fallback = '操作失败') {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (typeof error.message === 'string') return error.message;
  if (typeof error.errMsg === 'string') return error.errMsg;
  return fallback;
}

function isLocalPath(value = '') {
  return /^(wxfile:|http:\/\/tmp\/|\/|[a-zA-Z]:\\)/.test(String(value));
}

function getAssetUrl(assets = {}, type) {
  const lower = String(type || '').toLowerCase();
  if (lower === 'glb') return assets.glbViewUrl || assets.glbUrl || assets.glbPath || '';
  if (lower === 'obj') return assets.objUrl || assets.objPath || '';
  if (lower === 'preview') return assets.previewImageUrl || assets.previewImagePath || '';
  return '';
}

function getAssetFileID(assets = {}, type) {
  const lower = String(type || '').toLowerCase();
  if (lower === 'glb') return assets.glbFileID || '';
  if (lower === 'obj') return assets.objFileID || '';
  if (lower === 'preview') return assets.previewImageFileID || '';
  return '';
}

function getDownloadName(type) {
  const lower = String(type || 'file').toLowerCase();
  if (lower === 'glb') return 'maiya3d-model.glb';
  if (lower === 'obj') return 'maiya3d-model-obj.zip';
  if (lower === 'preview') return 'maiya3d-preview.png';
  return `maiya3d-${lower}`;
}

Page({
  data: {
    defaultImage: images.figma.cardRibbed,
    model: {},
    assets: {},
    primaryFormat: 'GLB',
    showPreview: false,
    preparingPreview: false,
    previewSrc: '',
    previewFileID: '',
    preparedExportPath: '',
    preparedExportName: '',
  },

  onLoad(options = {}) {
    const stored = wx.getStorageSync('maiya3d_model_detail') || {};
    const fromQuery = options.payload ? this.safeParsePayload(options.payload) : {};
    const model = { ...stored, ...fromQuery };
    const assets = model.assets || stored.assets || {};
    this.setData({
      model,
      assets,
      primaryFormat: getAssetUrl(assets, 'obj') || getAssetFileID(assets, 'obj') ? 'GLB / OBJ' : 'GLB',
    });
  },

  safeParsePayload(payload) {
    try {
      return JSON.parse(decodeURIComponent(payload));
    } catch (err) {
      return {};
    }
  },

  goBack() {
    wx.navigateBack({ fail: () => wx.showToast({ title: '已在当前页面', icon: 'none' }) });
  },

  noop() {},

  openPreview() {
    const { assets } = this.data;
    if (!getAssetFileID(assets, 'glb') && !getAssetUrl(assets, 'glb')) {
      wx.showToast({ title: '暂无可预览的 GLB 文件', icon: 'none' });
      return;
    }

    this.setData({ showPreview: true, preparingPreview: true, previewSrc: '', previewFileID: '' });
    this.resolveAsset('glb', assets)
      .then((asset) => this.downloadAsset(asset))
      .then((res) => {
        if (!res.tempFilePath) throw new Error('文件下载失败');
        this.setData({ preparingPreview: false, previewSrc: res.tempFilePath, previewFileID: '' });
      })
      .catch((err) => {
        this.setData({ preparingPreview: false });
        wx.showToast({ title: formatError(err, '预览准备失败'), icon: 'none' });
      });
  },

  closePreview() {
    this.setData({ showPreview: false, preparingPreview: false, previewSrc: '', previewFileID: '' });
  },

  onPreviewError(event) {
    const message = event.detail && event.detail.message;
    wx.showToast({ title: message || '预览失败', icon: 'none' });
  },

  exportGlb() {
    this.prepareExport('glb');
  },

  exportObj() {
    this.prepareExport('obj');
  },

  exportPreview() {
    this.prepareExport('preview');
  },

  resolveAsset(type, assets = this.data.assets) {
    const fileID = getAssetFileID(assets, type);
    const url = getAssetUrl(assets, type);
    if (fileID || isLocalPath(url)) return Promise.resolve({ fileID, url });
    if (!url) return Promise.reject(new Error('暂无可导出的文件'));

    if (!wx.cloud || !wx.cloud.callFunction) {
      return Promise.resolve({ fileID: '', url });
    }

    return wx.cloud.callFunction({
      name: 'hunyuan3d',
      data: {
        action: 'copyAsset',
        payload: {
          jobId: assets.jobId || `model-${Date.now()}`,
          type,
          url,
        },
      },
    }).then((res) => {
      const result = res.result || {};
      if (result.error) throw new Error(result.error);
      return { fileID: result.fileID || '', url: result.url || url };
    });
  },

  downloadAsset(asset = {}) {
    if (asset.fileID && wx.cloud && wx.cloud.downloadFile) {
      return wx.cloud.downloadFile({ fileID: asset.fileID });
    }
    if (asset.url && isLocalPath(asset.url)) return Promise.resolve({ tempFilePath: asset.url });
    if (asset.url) {
      return new Promise((resolve, reject) => wx.downloadFile({ url: asset.url, success: resolve, fail: reject }));
    }
    return Promise.reject(new Error('暂无可导出的文件'));
  },

  prepareExport(type) {
    this.setData({ preparedExportPath: '', preparedExportName: '' });
    this.resolveAsset(type)
      .then((asset) => this.downloadAsset(asset))
      .then((res) => {
        if (!res.tempFilePath) throw new Error('文件下载失败');
        return this.persistExport(type, res.tempFilePath);
      })
      .catch((err) => wx.showToast({ title: formatError(err, '导出失败'), icon: 'none' }));
  },

  persistExport(type, tempFilePath) {
    return new Promise((resolve, reject) => {
      const ext = type === 'preview' ? 'png' : type;
      const destPath = `${wx.env.USER_DATA_PATH}/maiya3d-${Date.now()}.${ext}`;
      wx.getFileSystemManager().copyFile({
        srcPath: tempFilePath,
        destPath,
        success: () => {
          this.setData({
            preparedExportPath: destPath,
            preparedExportName: getDownloadName(type),
          });
          wx.showToast({ title: '文件已准备好', icon: 'none' });
          resolve(destPath);
        },
        fail: reject,
      });
    });
  },

  openPreparedExport() {
    const { preparedExportPath, preparedExportName } = this.data;
    if (!preparedExportPath) {
      wx.showToast({ title: '请先准备导出文件', icon: 'none' });
      return;
    }
    if (wx.shareFileMessage) {
      wx.shareFileMessage({
        filePath: preparedExportPath,
        fileName: preparedExportName || 'maiya3d-model',
        fail: (err) => wx.showToast({ title: formatError(err, '打开导出失败'), icon: 'none' }),
      });
      return;
    }
    wx.setClipboardData({ data: preparedExportPath });
  },
});
