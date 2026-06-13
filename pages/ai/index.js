import { queryAi3dTask, submitAi3dTask } from '../../api/maiya3d';
import { addGeneratedModel } from '../../utils/generatedModels';
import { consumePoints, fetchPointsAccount, getGenerationCost, getPointsBalance, refundPoints } from '../../utils/points';
import images from '../../config/images';

const modes = [
  {
    value: 'image',
    label: '图生3D',
    title: '上传主体图像',
    hint: '适合单个物体、清晰轮廓、纯色背景。',
  },
  {
    value: 'text',
    label: '文生3D',
    title: '描述你想生成的模型',
    hint: '例如：一只低多边形机械猫，适合3D打印。',
  },
  {
    value: 'multi',
    label: '多模态',
    title: '图像 + 描述协同生成',
    hint: '用图片确定主体，用文字补充风格和用途。',
  },
];

const ACTIVE_AI_TASK_KEY = 'maiyaActiveAiTask';

function getModeMeta(mode) {
  return modes.find((item) => item.value === mode) || null;
}

function deriveModeFromInput(prompt, imagePath) {
  const hasPrompt = Boolean(String(prompt || '').trim());
  const hasImage = Boolean(imagePath);
  if (hasPrompt && hasImage) return 'multi';
  if (hasImage) return 'image';
  if (hasPrompt) return 'text';
  return '';
}

function getCostText(mode) {
  if (!mode) return '输入后计费';
  return `${getGenerationCost(mode)} 积分`;
}

function getDetectedModeLabel(mode) {
  const meta = getModeMeta(mode);
  return meta ? meta.label : '智能判断';
}

function getModeHint(mode) {
  if (mode === 'multi') return 'Sketch 多模态：图片定轮廓，文字补细节';
  if (mode === 'image') return '图生 3D：建议主体清晰、背景干净';
  if (mode === 'text') return '文生 3D：描述越具体，结果越稳定';
  return '输入文字、上传图片，MAIYA 会自动选择生成方式';
}

function getSpeedHint(mode, detailLevel) {
  if (!mode) return '均衡参数默认开启';
  if (detailLevel === '精细') return '精细档耗时更久，细节更完整';
  if (detailLevel === '快速') return '快速档偏草模，可能只返回白模；需要贴图请选择均衡或开启PBR';
  if (mode === 'multi') return '多模态使用 Sketch 均衡参数';
  return '均衡档默认保留PBR贴图，速度会比快速档慢';
}

function formatMessageContent(value, fallback = '操作失败') {
  if (!value) return fallback;
  if (typeof value === 'string') return value;
  if (typeof value.message === 'string') return value.message;
  if (typeof value.errMsg === 'string') return value.errMsg;
  if (typeof value.error === 'string') return value.error;
  if (value.error && typeof value.error.message === 'string') return value.error.message;

  try {
    return JSON.stringify(value);
  } catch (err) {
    return fallback;
  }
}

Page({
  data: {
    modes,
    mode: '',
    modeIndex: -1,
    detectedModeLabel: '智能判断',
    modeHint: '输入文字、上传图片，MAIYA 会自动选择生成方式',
    speedHint: '均衡参数默认开启',
    costText: '输入后计费',
    prompt: '',
    texture: '细腻写实',
    textureOptions: ['细腻写实', '卡通玩具', '低多边形', '3D打印'],
    quality: '均衡',
    qualityOptions: ['快速', '均衡', '精细'],
    topology: '均衡',
    topologyOptions: ['低面数', '均衡', '高面数'],
    pbrMode: '自动',
    pbrOptions: ['关闭', '自动', '开启'],
    showSettings: false,
    settingsSpinning: false,
    sampleImages: [
      images.figma.cardVase,
      images.figma.cardRibbed,
      images.figma.headphone,
    ],
    imagePath: '',
    imageOriginalPath: '',
    imageName: '',
    task: null,
    progress: 0,
    pointsBalance: 0,
    generationCost: 0,
    isDownloadingAssets: false,
    isSubmitting: false,
    isPolling: false,
    isSwitching: false,
    isPublic: true,
    taskNote: '',
    stageText: '等待输入',
    progressLabel: '0%',
  },

  onUnload() {
    this.clearPolling();
    clearTimeout(this.switchTimer);
    clearTimeout(this.settingsSpinTimer);
  },

  onShow() {
    this.restoreActiveTask();
    this.refreshPoints();
  },

  refreshPoints() {
    const mode = deriveModeFromInput(this.data.prompt, this.data.imagePath);
    this.setData({
      pointsBalance: getPointsBalance(),
      mode,
      modeIndex: modes.findIndex((item) => item.value === mode),
      detectedModeLabel: getDetectedModeLabel(mode),
      modeHint: getModeHint(mode),
      speedHint: getSpeedHint(mode, this.data.quality),
      generationCost: mode ? getGenerationCost(mode) : 0,
      costText: getCostText(mode),
    });
    fetchPointsAccount(3)
      .then((account) => {
        this.setData({ pointsBalance: account.balance });
      })
      .catch(() => {});
  },

  refreshGenerationMode() {
    const mode = deriveModeFromInput(this.data.prompt, this.data.imagePath);
    this.setData({
      mode,
      modeIndex: modes.findIndex((item) => item.value === mode),
      detectedModeLabel: getDetectedModeLabel(mode),
      modeHint: getModeHint(mode),
      speedHint: getSpeedHint(mode, this.data.quality),
      generationCost: mode ? getGenerationCost(mode) : 0,
      costText: getCostText(mode),
    });
  },

  persistActiveTask(extra = {}) {
    const { task, mode, prompt, imagePath, imageOriginalPath, imageName, texture, quality, topology, pbrMode, isPublic, progress, progressLabel, taskNote, stageText } = this.data;
    if (!task && !extra.task) return;
    wx.setStorageSync(ACTIVE_AI_TASK_KEY, {
      task: extra.task || task,
      mode: extra.mode || mode,
      prompt,
      imagePath,
      imageOriginalPath,
      imageName,
      texture,
      quality,
      topology,
      pbrMode,
      isPublic,
      progress,
      progressLabel,
      taskNote,
      stageText,
      status: extra.status || 'running',
      assets: extra.assets || null,
      savedModel: Boolean(extra.savedModel),
      updatedAt: Date.now(),
    });
  },

  restoreActiveTask() {
    let stored = null;
    try {
      stored = wx.getStorageSync(ACTIVE_AI_TASK_KEY);
    } catch (err) {
      stored = null;
    }
    if (!stored || !stored.task || !stored.task.jobId) return;
    if (this.data.task && this.data.task.jobId === stored.task.jobId) return;

    const nextMode = stored.mode || deriveModeFromInput(stored.prompt, stored.imagePath);
    this.setData({
      prompt: stored.prompt || '',
      imagePath: stored.imagePath || '',
      imageOriginalPath: stored.imageOriginalPath || stored.imagePath || '',
      imageName: stored.imageName || '',
      texture: stored.texture || this.data.texture,
      quality: stored.quality || this.data.quality,
      topology: stored.topology || this.data.topology,
      pbrMode: stored.pbrMode || this.data.pbrMode,
      isPublic: typeof stored.isPublic === 'boolean' ? stored.isPublic : this.data.isPublic,
      mode: nextMode,
      modeIndex: modes.findIndex((item) => item.value === nextMode),
      detectedModeLabel: getDetectedModeLabel(nextMode),
      modeHint: getModeHint(nextMode),
      speedHint: getSpeedHint(nextMode, stored.quality || this.data.quality),
      generationCost: nextMode ? getGenerationCost(nextMode) : 0,
      costText: getCostText(nextMode),
      task: {
        ...stored.task,
        ...(stored.assets || {}),
        statusText: stored.status === 'done' ? '模型已生成' : 'MAIYA正在生成',
      },
      progress: stored.status === 'done' ? 100 : Math.max(stored.progress || 58, 58),
      progressLabel: stored.status === 'done' ? '100%' : (stored.progressLabel || '继续中'),
      taskNote: stored.status === 'done' ? '上次生成已完成，可直接查看结果。' : '已恢复上次生成任务，正在继续查询状态。',
      stageText: stored.status === 'done' ? '资产已就绪' : (stored.stageText || '继续查询'),
      isPolling: stored.status !== 'done',
      isSubmitting: false,
      isDownloadingAssets: false,
    });

    if (stored.status === 'done' && stored.assets) {
      wx.setStorageSync('latestAi3dAssets', stored.assets);
      return;
    }
    this.startPolling(stored.task.jobId);
  },

  handleBack() {
    wx.navigateBack({
      fail: () => wx.showToast({ title: '已在当前页面', icon: 'none' }),
    });
  },

  getEstimatedProgress() {
    if (!this.pollStartedAt) return 58;
    const elapsedSeconds = Math.floor((Date.now() - this.pollStartedAt) / 1000);
    if (elapsedSeconds < 6) {
      return 58 + Math.floor(elapsedSeconds * 4);
    }
    if (elapsedSeconds < 24) {
      return 80 + Math.floor((elapsedSeconds - 6) / 2);
    }
    if (elapsedSeconds < 70) {
      return 89 + Math.floor((elapsedSeconds - 24) / 8);
    }
    return 96;
  },

  toggleSettings() {
    clearTimeout(this.settingsSpinTimer);
    this.setData({
      showSettings: !this.data.showSettings,
      settingsSpinning: true,
    });
    this.settingsSpinTimer = setTimeout(() => {
      this.setData({ settingsSpinning: false });
    }, 560);
  },

  getPollingNote(status, progress) {
    if (progress >= 100) {
      return '模型已生成，正在进入结果页。';
    }
    if (!this.pollStartedAt) {
      return '生成通常需要几分钟，请保持页面打开。';
    }
    const elapsedSeconds = Math.floor((Date.now() - this.pollStartedAt) / 1000);
    if (elapsedSeconds >= 120) {
      return `云端仍在生成，当前状态 ${status || 'RUN'}。任务不会丢失，可以先离开页面。`;
    }
    if (elapsedSeconds >= 90) {
      return `云端正在最终收尾，当前状态 ${status || 'RUN'}，完成后会自动进入结果页。`;
    }
    return '生成通常需要几分钟，请保持页面打开。';
  },

  getProgressLabel(progress, status) {
    if (progress >= 100) return '100%';
    if (this.pollStartedAt && Date.now() - this.pollStartedAt >= 120 * 1000) {
      return '云端生成中';
    }
    if (this.pollStartedAt && Date.now() - this.pollStartedAt >= 70 * 1000) {
      return '收尾中';
    }
    return `${progress}%`;
  },

  getStageText(status, progress) {
    if (progress >= 100) return '资产就绪';
    if (!this.pollStartedAt) return '准备中';
    const elapsedSeconds = Math.floor((Date.now() - this.pollStartedAt) / 1000);
    if (elapsedSeconds < 12) return '排队启动';
    if (elapsedSeconds < 75) return '生成主体';
    if (elapsedSeconds < 120) return '细节收尾';
    return `云端${status || 'RUN'}`;
  },

  getNextPollDelay() {
    if (!this.pollStartedAt) return 1200;
    const elapsedSeconds = Math.floor((Date.now() - this.pollStartedAt) / 1000);
    if (elapsedSeconds < 35) return 1200;
    if (elapsedSeconds < 120) return 2200;
    return 3600;
  },

  isPollingTooLong() {
    if (!this.pollStartedAt) return false;
    return Date.now() - this.pollStartedAt > 15 * 60 * 1000;
  },

  handleModeChange(event) {
    this.refreshGenerationMode();
  },

  triggerSoftSwitch() {
    this.setData({ isSwitching: true });
    clearTimeout(this.switchTimer);
    this.switchTimer = setTimeout(() => {
      this.setData({ isSwitching: false });
    }, 260);
  },

  handlePromptInput(event) {
    this.setData({ prompt: event.detail.value }, () => {
      this.refreshGenerationMode();
    });
  },

  chooseTexture(event) {
    this.setData({ texture: event.currentTarget.dataset.value }, () => {
      this.refreshGenerationMode();
    });
  },

  chooseQuality(event) {
    this.setData({ quality: event.currentTarget.dataset.value }, () => {
      this.refreshGenerationMode();
    });
  },

  chooseTopology(event) {
    this.setData({ topology: event.currentTarget.dataset.value }, () => {
      this.refreshGenerationMode();
    });
  },

  choosePbrMode(event) {
    this.setData({ pbrMode: event.currentTarget.dataset.value }, () => {
      this.refreshGenerationMode();
    });
  },

  togglePublic(event) {
    this.setData({ isPublic: Boolean(event.detail.value) });
  },

  prepareInputImage(filePath, done) {
    if (!wx.compressImage || !filePath) {
      done(filePath, filePath);
      return;
    }
    wx.compressImage({
      src: filePath,
      quality: 72,
      success: (res) => done(res.tempFilePath || filePath, filePath),
      fail: () => done(filePath, filePath),
    });
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      camera: 'back',
      success: ({ tempFiles }) => {
        const file = tempFiles[0];
        this.prepareInputImage(file.tempFilePath, (imagePath, imageOriginalPath) => {
          this.setData({
            imagePath,
            imageOriginalPath,
            imageName: imagePath.split('/').pop() || 'image.png',
          }, () => {
            this.refreshGenerationMode();
            this.triggerSoftSwitch();
          });
        });
      },
      fail: (err) => {
        if (err.errMsg && err.errMsg.includes('cancel')) return;
        this.showMessage(formatMessageContent(err, '图片选择失败'), 'error');
      },
    });
  },

  useSample(event) {
    const src = event.currentTarget.dataset.url;
    wx.getImageInfo({
      src,
      success: ({ path }) => {
        const imagePath = path || src;
        this.setData({
          imagePath,
          imageOriginalPath: imagePath,
          imageName: src.split('/').pop() || 'sample.png',
        }, () => {
          this.refreshGenerationMode();
          this.triggerSoftSwitch();
        });
      },
      fail: () => {
        this.showMessage('示例图片读取失败，请选择本地图片', 'warning');
      },
    });
  },

  removeImage() {
    this.setData({ imagePath: '', imageOriginalPath: '', imageName: '' }, () => {
      this.refreshGenerationMode();
      this.triggerSoftSwitch();
    });
  },

  async submitTask() {
    const { prompt, imagePath, imageOriginalPath, texture, quality, topology, pbrMode } = this.data;
    const mode = deriveModeFromInput(prompt, imagePath);
    const modeMeta = getModeMeta(mode);
    const generationCost = getGenerationCost(mode);
    const submitStartedAt = Date.now();
    let pointsBalance = getPointsBalance();

    if (!mode) {
      this.showMessage('请先输入描述或上传图片', 'warning');
      return;
    }

    try {
      const account = await fetchPointsAccount(3);
      pointsBalance = account.balance;
    } catch (err) {
      this.showMessage('积分服务暂时不可用，请稍后再试', 'error');
      return;
    }

    if (pointsBalance < generationCost) {
      this.setData({ pointsBalance });
      wx.showModal({
        title: '\u79ef\u5206\u4e0d\u8db3',
        content: `\u672c\u6b21\u751f\u6210\u9700\u8981 ${generationCost} \u79ef\u5206\uff0c\u5f53\u524d\u5269\u4f59 ${pointsBalance} \u79ef\u5206\u3002`,
        confirmText: '\u53bb\u5145\u503c',
        cancelText: '\u7559\u5728\u6b64\u9875',
        success: (res) => {
          if (res.confirm) {
            wx.showToast({ title: '请接入你的充值页面', icon: 'none' });
          }
        },
      });
      return;
    }

    const consumeResult = await consumePoints(generationCost, {
      title: modeMeta ? modeMeta.label : 'AI生成',
      mode,
    });
    if (!consumeResult.success) {
      this.setData({ pointsBalance: consumeResult.balance });
      wx.showModal({
        title: '\u79ef\u5206\u4e0d\u8db3',
        content: `\u672c\u6b21\u751f\u6210\u9700\u8981 ${generationCost} \u79ef\u5206\uff0c\u5f53\u524d\u5269\u4f59 ${consumeResult.balance} \u79ef\u5206\u3002`,
        confirmText: '\u53bb\u5145\u503c',
        cancelText: '\u7559\u5728\u6b64\u9875',
        success: (res) => {
          if (res.confirm) {
            wx.showToast({ title: '请接入你的充值页面', icon: 'none' });
          }
        },
      });
      return;
    }

    this.setData({
      isSubmitting: true,
      task: null,
      progress: 18,
      progressLabel: '18%',
      stageText: imagePath ? '上传输入' : '提交任务',
      taskNote: imagePath ? '正在上传输入素材，并创建云端生成任务。' : '正在创建云端生成任务。',
      pointsBalance: consumeResult.balance,
      mode,
      modeIndex: modes.findIndex((item) => item.value === mode),
      detectedModeLabel: getDetectedModeLabel(mode),
      generationCost,
      costText: getCostText(mode),
    });
    console.log('[ai3d:submit-start]', {
      mode,
      quality,
      topology,
      pbrMode,
      hasImage: Boolean(imagePath),
      hasPrompt: Boolean(String(prompt || '').trim()),
    });

    submitAi3dTask({ mode, prompt, imagePath, imageOriginalPath, texture, quality, topology, pbrMode })
      .then((task) => {
        console.log('[ai3d:submit-done]', {
          jobId: task.jobId,
          durationMs: Date.now() - submitStartedAt,
        });
        const nextTask = {
          ...task,
          statusText: 'MAIYA正在生成',
        };
        this.setData({
          task: nextTask,
          isSubmitting: false,
          isPolling: true,
          progress: 58,
          progressLabel: '58%',
          stageText: '云端生成',
          taskNote: '任务已进入云端队列，可以离开页面，回来后会自动继续查询。',
        });
        this.persistActiveTask({ task: nextTask, mode, status: 'running' });
        this.showMessage('MAIYA正在生成3D模型', 'success');
        this.startPolling(task.jobId);
      })
      .catch((err) => {
        this.setData({ isSubmitting: false, progress: 0 });
        refundPoints(consumeResult.consumeLogId, {
          title: '生成失败退回积分',
          mode,
        }).then((account) => {
          this.setData({ pointsBalance: account.balance });
        }).catch(() => {});
        this.showMessage(formatMessageContent(err, '提交失败，请检查接口配置或稍后再试'), 'error');
      });
  },

  startPolling(jobId) {
    this.clearPolling();
    this.pollStartedAt = Date.now();
    const query = () => {
      const queryStartedAt = Date.now();
      queryAi3dTask(jobId)
        .then((result) => {
          const progress = result.done ? 100 : Math.max(this.data.progress, result.progress || 58, this.getEstimatedProgress());
          const status = result.status || 'RUN';
          console.log('[ai3d:poll]', {
            jobId,
            status,
            done: result.done,
            progress,
            queryDurationMs: Date.now() - queryStartedAt,
            totalDurationMs: Date.now() - this.pollStartedAt,
            filesCount: Array.isArray(result.resultFiles) ? result.resultFiles.length : 0,
            requestId: result.requestId,
          });
          this.setData({
            progress,
            progressLabel: this.getProgressLabel(progress, status),
            stageText: this.getStageText(status, progress),
            taskNote: this.getPollingNote(status, progress),
            task: {
              ...this.data.task,
              ...result,
              statusText: result.info,
            },
          });
          this.persistActiveTask({ status: 'running' });

          if (result.done || result.status === 'success' || result.status === 'completed') {
            this.clearPolling();
            this.setData({ isPolling: false, progress: 100, progressLabel: '100%', stageText: '资产就绪', taskNote: '模型已生成，正在进入结果页。' });
            this.persistActiveTask({ status: 'running' });
            this.handleGeneratedAssets(result);
            return;
          }

          if (result.failed || result.error || result.status === 'error' || result.status === 'failed') {
            this.clearPolling();
            this.setData({ isPolling: false });
            try {
              wx.removeStorageSync(ACTIVE_AI_TASK_KEY);
            } catch (err) {}
            this.showMessage(result.error || '模型生成失败', 'error');
            return;
          }

          if (this.isPollingTooLong()) {
            this.clearPolling();
            this.setData({
              isPolling: false,
              task: {
                ...this.data.task,
                statusText: 'MAIYA正在生成',
              },
            });
            this.showMessage('MAIYA仍在生成中，可稍后继续查询或重新提交', 'warning');
            return;
          }
          this.pollTimer = setTimeout(query, this.getNextPollDelay());
        })
        .catch((err) => {
          this.clearPolling();
          this.setData({ isPolling: false });
          this.showMessage(formatMessageContent(err, '查询任务失败'), 'error');
        });
    };

    query();
  },

  resumePolling() {
    const jobId = this.data.task && this.data.task.jobId;
    if (!jobId) return;
    this.setData({
      isPolling: true,
      progress: Math.max(this.data.progress, 58),
      progressLabel: this.getProgressLabel(Math.max(this.data.progress, 58), 'RUN'),
      stageText: '继续查询',
      taskNote: '正在继续查询生成状态。',
      task: {
        ...this.data.task,
        statusText: '继续查询MAIYA生成状态',
      },
    });
    this.startPolling(jobId);
  },

  handleGeneratedAssets(result) {
    console.log('[ai3d:done-assets]', {
      jobId: result.jobId || (this.data.task && this.data.task.jobId) || '',
      status: result.status,
      glbUrl: result.glbUrl,
      objUrl: result.objUrl,
      previewImageUrl: result.previewImageUrl,
      glbFileID: result.glbFileID,
      objFileID: result.objFileID,
      files: result.resultFiles,
    });

    if (!result.glbUrl && !result.objUrl && !result.videoUrl && !result.previewImageUrl) {
      this.showMessage('生成完成，但接口未返回可用文件地址', 'warning');
      return;
    }

    const onlineAssets = {
      glbUrl: result.glbUrl,
      glbViewUrl: result.glbViewUrl || result.glbUrl,
      objUrl: result.objUrl,
      videoUrl: result.videoUrl,
      previewImageUrl: result.previewImageUrl,
      glbFileID: result.glbFileID || '',
      objFileID: result.objFileID || '',
      videoFileID: result.videoFileID || '',
      previewImageFileID: result.previewImageFileID || '',
      resultFiles: result.resultFiles || [],
      resultCreditConsumed: result.resultCreditConsumed || 0,
      resultCreditDetails: result.resultCreditDetails || {},
      jobId: result.jobId || (this.data.task && this.data.task.jobId) || '',
      requestId: result.requestId || '',
      savedAt: Date.now(),
    };
    const savedModel = this.saveGeneratedModel(result, onlineAssets);
    wx.setStorageSync('latestAi3dAssets', onlineAssets);
    this.setData({
      isDownloadingAssets: false,
      task: {
        ...this.data.task,
        ...onlineAssets,
        statusText: '资产已准备好',
      },
    });
    this.persistActiveTask({
      status: 'done',
      assets: onlineAssets,
      savedModel: true,
    });
    this.showMessage(savedModel.reviewStatus === 'pending' ? '模型文件已准备好，已提交管理员审核' : '模型文件已准备好，已保存到我的模型', 'success');
    wx.navigateTo({
      url: '/pages/result/index',
      animationType: 'fade',
      animationDuration: 240,
    });
    return;

  },

  saveGeneratedModel(result, assets) {
    const modeLabel = getDetectedModeLabel(this.data.mode);
    const promptTitle = String(this.data.prompt || '').trim();
    return addGeneratedModel({
      title: promptTitle ? promptTitle.slice(0, 18) : `${modeLabel}模型`,
      image: assets.previewImagePath || assets.previewImageUrl || result.previewImageUrl || this.data.imagePath || images.figma.cardRibbed,
      category: '模型',
      isPublic: this.data.isPublic,
      description: promptTitle || `${modeLabel}生成的3D模型`,
      assets: {
        ...assets,
        mode: this.data.mode,
        prompt: this.data.prompt,
        texture: this.data.texture,
        quality: this.data.quality,
        topology: this.data.topology,
        pbrMode: this.data.pbrMode,
        isPublic: this.data.isPublic,
      },
    });
  },

  clearPolling() {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.pollStartedAt = 0;
  },

  previewImage() {
    if (!this.data.imagePath) return;
    wx.previewImage({ urls: [this.data.imagePath] });
  },

  copyResultUrl(event) {
    const url = event.currentTarget.dataset.url;
    if (!url) return;
    wx.setClipboardData({
      data: url,
      success: () => {
        this.showMessage('链接已复制', 'success');
      },
    });
  },

  goResult() {
    const task = this.data.task || {};
    const assets = {
      glbUrl: task.glbUrl,
      glbViewUrl: task.glbViewUrl || task.glbUrl,
      objUrl: task.objUrl,
      videoUrl: task.videoUrl,
      previewImageUrl: task.previewImageUrl,
      glbFileID: task.glbFileID || '',
      objFileID: task.objFileID || '',
      videoFileID: task.videoFileID || '',
      previewImageFileID: task.previewImageFileID || '',
      resultFiles: task.resultFiles || [],
      resultCreditConsumed: task.resultCreditConsumed || 0,
      resultCreditDetails: task.resultCreditDetails || {},
      jobId: task.jobId || '',
      requestId: task.requestId || '',
      savedAt: Date.now(),
    };
    wx.setStorageSync('latestAi3dAssets', assets);
    wx.navigateTo({
      url: '/pages/result/index',
      animationType: 'fade',
      animationDuration: 240,
    });
  },

  showMessage(content, theme) {
    wx.showToast({
      title: formatMessageContent(content),
      icon: theme === 'success' ? 'success' : 'none',
      duration: 2600,
    });
  },
});



