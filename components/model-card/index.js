Component({
  properties: {
    model: {
      type: Object,
      value: {},
    },
    large: {
      type: Boolean,
      value: true,
    },
    showAuthor: {
      type: Boolean,
      value: true,
    },
    waterfall: {
      type: Boolean,
      value: false,
    },
    tall: {
      type: Boolean,
      value: false,
    },
  },
  data: {
    isPreviewing: false,
    isVideoPlaying: false,
    videoError: '',
    resolvedPreviewVideo: '',
    canUploadLocalVideo: false,
    cloudUploadFileID: '',
  },
  observers: {
    model(model) {
      const videoSrc = (model && (model.previewVideoUrl || model.previewVideo)) || '';
      const isLocalPackageVideo = /^\/static\/.+\.mp4($|\?)/i.test(videoSrc);
      const cacheKey = model && model.id ? `model_preview_video_file_id_${model.id}` : '';
      const cachedFileID = cacheKey ? wx.getStorageSync(cacheKey) : '';
      this.setData({
        canUploadLocalVideo: isLocalPackageVideo,
        cloudUploadFileID: cachedFileID || '',
      });
    },
  },
  methods: {
    onTap() {
      if (this.data.isPreviewing) return;
      this.triggerEvent('tapcard', { id: this.properties.model && this.properties.model.id });
    },

    startPreview() {
      this.resolvePlayableVideoSrc()
        .then((videoSrc) => {
          if (!videoSrc) {
            this.setData({
              isPreviewing: false,
              isVideoPlaying: false,
              resolvedPreviewVideo: '',
              videoError: '本地包内 MP4 不能稳定播放，请使用云存储或 HTTPS 视频地址',
            });
            wx.showToast({ title: '请先配置云端视频地址', icon: 'none' });
            return;
          }
          this.setData({
            isPreviewing: true,
            isVideoPlaying: false,
            videoError: '',
            resolvedPreviewVideo: videoSrc,
          });
        })
        .catch((error) => {
          console.warn('[model-card:resolve-video-failed]', error);
          this.setData({
            isPreviewing: false,
            isVideoPlaying: false,
            resolvedPreviewVideo: '',
            videoError: '云端视频地址获取失败，请检查云存储文件是否存在',
          });
          wx.showToast({ title: '云端视频获取失败', icon: 'none' });
        });
    },

    togglePreview() {
      if (this.data.isPreviewing) {
        this.stopPreview();
        return;
      }
      this.startPreview();
    },

    stopPreview() {
      if (!this.properties.model || (!this.properties.model.previewVideo && !this.properties.model.previewVideoUrl)) return;
      this.setData({ isPreviewing: false, isVideoPlaying: false });
    },

    resolvePlayableVideoSrc() {
      const model = this.properties.model || {};
      const videoSrc = model.previewVideoUrl || model.previewVideo || '';
      const fileID = this.data.cloudUploadFileID || model.previewVideoFileID || (/^cloud:\/\//i.test(videoSrc) ? videoSrc : '');
      if (fileID) return this.getCloudTempUrl(fileID);
      if (!videoSrc) return Promise.resolve('');
      if (/^(https?:\/\/|wxfile:\/\/)/i.test(videoSrc)) return Promise.resolve(videoSrc);
      if (/^\/static\/.+\.mp4($|\?)/i.test(videoSrc)) return Promise.resolve('');
      return Promise.resolve(videoSrc);
    },

    uploadLocalPreviewVideo() {
      const model = this.properties.model || {};
      const filePath = model.previewVideo || '';
      if (!/^\/static\/.+\.mp4($|\?)/i.test(filePath)) return;
      if (!wx.cloud || !wx.cloud.uploadFile) {
        wx.showToast({ title: '当前环境未开启云开发', icon: 'none' });
        return;
      }

      const cloudPath = `featured-preview/${model.id || Date.now()}-${Date.now()}.mp4`;
      this.setData({ videoError: '正在上传到云存储，请稍等...' });
      wx.cloud.uploadFile({
        cloudPath,
        filePath,
        success: (res) => {
          const fileID = res.fileID || '';
          const cacheKey = model.id ? `model_preview_video_file_id_${model.id}` : '';
          if (cacheKey) wx.setStorageSync(cacheKey, fileID);
          this.setData({
            cloudUploadFileID: fileID,
            videoError: '上传成功，请点击播放预览',
          });
          wx.showToast({ title: '上传成功', icon: 'success' });
        },
        fail: (error) => {
          console.warn('[model-card:upload-preview-failed]', error);
          this.setData({
            videoError: '自动上传失败：请在云开发控制台上传 MP4，再填 previewVideoFileID',
          });
          wx.showToast({ title: '自动上传失败', icon: 'none' });
        },
      });
    },

    getCloudTempUrl(fileID) {
      if (!wx.cloud || !wx.cloud.getTempFileURL) return Promise.resolve('');
      return wx.cloud.getTempFileURL({ fileList: [fileID] }).then((res) => {
        const file = res.fileList && res.fileList[0];
        return (file && (file.tempFileURL || file.download_url)) || '';
      });
    },

    handleVideoPlay() {
      if (!this.data.isVideoPlaying) this.setData({ isVideoPlaying: true });
    },

    handleVideoError(event) {
      console.warn('[model-card:video-error]', event.detail || event);
      this.setData({
        isPreviewing: false,
        isVideoPlaying: false,
        videoError: '视频加载超时：请确认视频是 HTTPS/云存储地址，且已配置 downloadFile 合法域名',
      });
      wx.showToast({ title: '视频地址无法加载', icon: 'none' });
    },
  },
});
