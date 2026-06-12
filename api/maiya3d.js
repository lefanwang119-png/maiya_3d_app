import config from '../config/index';

const HUNYUAN_STATUS_DONE = ['DONE', 'SUCCESS', 'SUCCEED', 'COMPLETED', 'FINISH', 'FINISHED'];
const HUNYUAN_STATUS_RUNNING = ['WAIT', 'RUN', 'QUEUED', 'PENDING', 'PROCESSING', 'IN_PROGRESS'];
const HUNYUAN_STATUS_FAILED = ['FAIL', 'FAILED', 'ERROR'];

function getBaseUrl() {
  return (config.hunyuanApiBaseUrl || config.ai3dApiBaseUrl || '').replace(/\/$/, '');
}

function getCloudFunctionName() {
  return config.hunyuanCloudFunctionName || 'hunyuan3d';
}

function canUseCloudHunyuan() {
  return config.useCloudHunyuan !== false && wx.cloud && wx.cloud.callFunction;
}

function formatError(error, fallback = '请求失败') {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (typeof error.message === 'string') return error.message;
  if (typeof error.errMsg === 'string') return error.errMsg;
  if (typeof error.error === 'string') return error.error;
  if (error.error && typeof error.error.message === 'string') return error.error.message;

  try {
    return JSON.stringify(error);
  } catch (err) {
    return fallback;
  }
}

function getErrorMessage(data, fallback) {
  if (!data) return fallback;
  if (typeof data.detail === 'string') return data.detail;
  if (Array.isArray(data.detail) && data.detail[0]) {
    return data.detail[0].msg || fallback;
  }
  const response = data.Response || data.response || {};
  const message = formatError(data.info || data.error || data.message || response.ErrorMessage || response.Error?.Message, fallback);
  if (message.includes('资源不足') || message.toLowerCase().includes('insufficient')) {
    return '腾讯混元 3D 资源不足，请购买或开通资源包后再生成';
  }
  return message;
}

function pickResponse(data) {
  if (!data) return {};
  if (data.Response) return data.Response;
  if (data.response) return data.response;
  if (data.data && !Array.isArray(data.data) && typeof data.data === 'object') return data.data;
  if (data.result && !Array.isArray(data.result) && typeof data.result === 'object') return data.result;
  return data;
}

function normalizeStatus(status, fallback = 'RUN') {
  return String(status || fallback).trim().toUpperCase();
}

function normalizeSubmitResponse(data) {
  const response = pickResponse(data);
  const jobId = response.JobId || response.jobId || response.job_id || data.jobId || data.task_id || data.id;
  if (!jobId) {
    throw new Error(getErrorMessage(data, 'MAIYA未返回任务ID'));
  }

  return {
    jobId,
    requestId: response.RequestId || response.requestId || '',
    status: response.Status || response.status || 'WAIT',
    info: data.info || 'MAIYA任务已提交',
  };
}

function pickResultFiles(response) {
  return response.ResultFile3Ds || response.resultFile3Ds || response.result_files || response.files || response.data || [];
}

function normalizeFileUrls(files) {
  const urls = {
    glbUrl: '',
    glbViewUrl: '',
    objUrl: '',
    videoUrl: '',
    previewImageUrl: '',
    glbFileID: '',
    objFileID: '',
    videoFileID: '',
    previewImageFileID: '',
  };

  files.forEach((file) => {
    const type = String(file.Type || file.type || '').toLowerCase();
    const url = file.Url || file.url || file.FileUrl || file.fileUrl || '';
    const cloudUrl = file.MaiyaCloudUrl || file.maiyaCloudUrl || '';
    const cloudFileID = file.maiyaCloudFileID || file.MaiyaCloudFileID || file.CloudFileID || file.cloudFileID || '';
    const preview = file.PreviewImageUrl || file.previewImageUrl || file.PreviewUrl || file.previewUrl || '';
    const previewCloudUrl = file.MaiyaPreviewCloudUrl || file.maiyaPreviewCloudUrl || '';
    const previewCloudFileID = file.MaiyaPreviewCloudFileID || file.maiyaPreviewCloudFileID || '';

    if (!urls.glbUrl && (type.includes('glb') || /\.glb(\?|$)/i.test(url))) {
      urls.glbUrl = cloudUrl || url;
      urls.glbViewUrl = cloudUrl || url;
      urls.glbFileID = cloudFileID;
    }
    if (!urls.objUrl && (type.includes('obj') || /\.zip(\?|$)/i.test(url) || /\.obj(\?|$)/i.test(url))) {
      urls.objUrl = cloudUrl || url;
      urls.objFileID = cloudFileID;
    }
    if (!urls.videoUrl && (type.includes('video') || type.includes('mp4') || /\.mp4(\?|$)/i.test(url))) {
      urls.videoUrl = cloudUrl || url;
      urls.videoFileID = cloudFileID;
    }
    if (!urls.videoUrl && /\.mp4(\?|$)/i.test(preview)) {
      urls.videoUrl = preview;
    }
    if (!urls.previewImageUrl && (previewCloudUrl || preview)) {
      urls.previewImageUrl = previewCloudUrl || preview;
      urls.previewImageFileID = previewCloudFileID;
    }
  });

  return urls;
}

function parseCreditDetails(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (err) {
    return {};
  }
}

function normalizeStatusResponse(jobId, data) {
  const response = pickResponse(data);
  const status = normalizeStatus(response.Status || response.status || data.status);
  const files = pickResultFiles(response);
  const hasResultFiles = Array.isArray(files) && files.length > 0;
  const done = HUNYUAN_STATUS_DONE.includes(status) || hasResultFiles;
  const running = HUNYUAN_STATUS_RUNNING.includes(status);
  const failed = HUNYUAN_STATUS_FAILED.includes(status);
  const urls = normalizeFileUrls(files);
  const rawError = getErrorMessage(data, response.ErrorMessage || '');

  return {
    jobId,
    status,
    done,
    running: running || (!done && !failed),
    failed,
    progress: done ? 100 : running ? 0 : 0,
    info: done ? '生成完成' : failed ? '生成失败' : `MAIYA正在生成模型（${status}）`,
    glbUrl: response.glbUrl || response.GlbUrl || urls.glbUrl,
    glbViewUrl: response.glbViewUrl || response.GlbViewUrl || urls.glbViewUrl || urls.glbUrl,
    objUrl: response.objUrl || response.ObjUrl || urls.objUrl,
    videoUrl: response.videoUrl || response.VideoUrl || urls.videoUrl,
    previewImageUrl: response.previewImageUrl || response.PreviewImageUrl || urls.previewImageUrl,
    glbFileID: response.glbFileID || response.GlbFileID || urls.glbFileID,
    objFileID: response.objFileID || response.ObjFileID || urls.objFileID,
    videoFileID: response.videoFileID || response.VideoFileID || urls.videoFileID,
    previewImageFileID: response.previewImageFileID || response.PreviewImageFileID || urls.previewImageFileID,
    error: failed ? rawError : '',
    requestId: response.RequestId || response.requestId || '',
    resultCreditConsumed: response.ResultCreditConsumed || response.resultCreditConsumed || 0,
    resultCreditDetails: parseCreditDetails(response.ResultCreditDetails || response.resultCreditDetails),
    resultFiles: files,
  };
}

function callHunyuanCloud(data) {
  if (!canUseCloudHunyuan()) {
    return Promise.reject(new Error('请先开通微信云开发，或配置后端代理地址'));
  }

  return wx.cloud
    .callFunction({
      name: getCloudFunctionName(),
      data,
    })
    .then((res) => {
      const result = res.result || {};
      if (result.error) {
        throw new Error(formatError(result.error, 'MAIYA云函数调用失败'));
      }
      return result;
    })
    .catch((err) => {
      throw new Error(formatError(err, 'MAIYA云函数调用失败'));
    });
}

function uploadSingleImageToCloud(imagePath) {
  if (!canUseCloudHunyuan()) {
    return Promise.reject(new Error('请先开通微信云开发，或配置后端代理地址'));
  }

  const extMatch = String(imagePath || '').match(/\.(jpg|jpeg|png|webp)$/i);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
  const cloudPath = `ai3d-input/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;

  return wx.cloud
    .uploadFile({
      cloudPath,
      filePath: imagePath,
    })
    .then((res) => {
      if (!res.fileID) {
        throw new Error('图片上传云存储失败：未返回fileID');
      }
      return res.fileID;
    })
    .catch((err) => {
      throw new Error(formatError(err, '图片上传云存储失败'));
    });
}

function uploadImageToCloud(imagePath, fallbackImagePath = '') {
  return uploadSingleImageToCloud(imagePath).catch((err) => {
    const fallback = fallbackImagePath && fallbackImagePath !== imagePath ? fallbackImagePath : '';
    console.warn('[ai3d:upload-image] primary failed', {
      imagePath,
      fallbackImagePath: fallback,
      error: formatError(err),
    });
    if (!fallback) throw err;
    return uploadSingleImageToCloud(fallback).catch((fallbackErr) => {
      throw new Error(formatError(fallbackErr, formatError(err, '图片上传云存储失败')));
    });
  });
}

function getSubmitOptions({ mode, prompt, imagePath, texture, quality, topology, pbrMode }) {
  const isFast = quality === '快速';
  const isFine = quality === '精细';
  const useSketch = mode === 'multi' && imagePath && String(prompt || '').trim();
  const wantsBalanced = quality === '均衡' || topology === '均衡';
  const isLowPoly = !useSketch && (topology === '低面数' || texture === '低多边形' || texture === '3D打印' || isFast || wantsBalanced);
  const wantsHighFaces = topology === '高面数';
  const isTextOnly = mode === 'text';

  let faceCount = isTextOnly ? 36000 : (useSketch ? 60000 : 50000);
  if (topology === '低面数' || isFast) {
    faceCount = useSketch ? 36000 : 28000;
  } else if (wantsHighFaces || isFine) {
    faceCount = useSketch ? 120000 : 160000;
  } else if (wantsBalanced || topology === '自动拓扑') {
    faceCount = isTextOnly ? 36000 : (useSketch ? 60000 : 50000);
  }

  let enablePBR = !isFast && topology !== '低面数';
  if (pbrMode === '开启') {
    enablePBR = true;
  } else if (pbrMode === '关闭') {
    enablePBR = false;
  } else {
    enablePBR = !isFast && topology !== '低面数';
  }

  return {
    generateType: useSketch ? 'Sketch' : (isLowPoly ? 'LowPoly' : 'Normal'),
    faceCount,
    enablePBR,
  };
}

function submitHunyuanCloudJob({ mode, prompt, imagePath, imageOriginalPath, texture, quality, topology, pbrMode }) {
  const options = getSubmitOptions({ mode, prompt, imagePath, texture, quality, topology, pbrMode });
  const payload = {
    mode,
    prompt: prompt || '',
    texture: texture || '',
    quality: quality || '',
    topology: topology || '',
    pbrMode: pbrMode || '自动',
    model: '3.0',
    generateType: options.generateType,
    faceCount: options.faceCount,
    enablePBR: options.enablePBR,
  };

  const submit = (extraPayload = {}) =>
    callHunyuanCloud({
      action: 'submit',
      payload: {
        ...payload,
        ...extraPayload,
      },
    }).then(normalizeSubmitResponse);

  if (imagePath && (mode === 'image' || mode === 'multi')) {
    return uploadImageToCloud(imagePath, imageOriginalPath).then((imageFileID) => submit({ imageFileID }));
  }

  return submit();
}

function submitHunyuanImageJob({ mode, prompt, imagePath, imageOriginalPath, texture, quality, topology, pbrMode }) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    return Promise.reject(new Error('请先配置后端代理地址'));
  }
  const options = getSubmitOptions({ mode, prompt, imagePath, texture, quality, topology, pbrMode });

  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${baseUrl}/api/hunyuan3d/jobs`,
      filePath: imagePath,
      name: 'image',
      formData: {
        mode,
        prompt: prompt || '',
        texture: texture || '',
        quality: quality || '',
        topology: topology || '',
        pbrMode: pbrMode || '自动',
        model: '3.0',
        generateType: options.generateType,
        faceCount: options.faceCount,
        enablePBR: options.enablePBR,
      },
      success(res) {
        let data = {};
        try {
          data = typeof res.data === 'string' ? JSON.parse(res.data || '{}') : res.data || {};
        } catch (err) {
          reject(new Error(`接口返回格式异常：${res.statusCode}`));
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(normalizeSubmitResponse(data));
          } catch (err) {
            reject(err);
          }
        } else {
          reject(new Error(getErrorMessage(data, `提交失败：${res.statusCode}`)));
        }
      },
      fail(err) {
        reject(new Error(formatError(err, '提交失败')));
      },
    });
  });
}

function submitHunyuanTextJob({ mode, prompt, texture, quality, topology, pbrMode }) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    return Promise.reject(new Error('请先配置后端代理地址'));
  }
  const options = getSubmitOptions({ mode, prompt, imagePath: '', texture, quality, topology, pbrMode });

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/api/hunyuan3d/jobs`,
      method: 'POST',
      data: {
        mode,
        prompt,
        texture,
        quality,
        topology,
        pbrMode,
        model: '3.0',
        generateType: options.generateType,
        faceCount: options.faceCount,
        enablePBR: options.enablePBR,
      },
      success(res) {
        const data = res.data || {};
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(normalizeSubmitResponse(data));
          } catch (err) {
            reject(err);
          }
        } else {
          reject(new Error(getErrorMessage(data, `提交失败：${res.statusCode}`)));
        }
      },
      fail(err) {
        reject(new Error(formatError(err, '提交失败')));
      },
    });
  });
}

export function submitAi3dTask({ mode, prompt, imagePath, imageOriginalPath, texture, quality, topology, pbrMode }) {
  if (!getBaseUrl() && canUseCloudHunyuan()) {
    return submitHunyuanCloudJob({ mode, prompt, imagePath, imageOriginalPath, texture, quality, topology, pbrMode });
  }

  if (imagePath && (mode === 'image' || mode === 'multi')) {
    return submitHunyuanImageJob({ mode, prompt, imagePath, imageOriginalPath, texture, quality, topology, pbrMode });
  }

  return submitHunyuanTextJob({ mode, prompt, texture, quality, topology, pbrMode });
}

export function queryAi3dTask(jobId) {
  const baseUrl = getBaseUrl();
  if (!jobId) return Promise.reject(new Error('Missing jobId'));

  if (!baseUrl && canUseCloudHunyuan()) {
    return callHunyuanCloud({
      action: 'query',
      jobId,
      payload: {
        model: '3.0',
        copyFiles: false,
      },
    }).then((data) => normalizeStatusResponse(jobId, data));
  }

  if (!baseUrl) return Promise.reject(new Error('请先配置后端代理地址'));

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/api/hunyuan3d/jobs/${jobId}`,
      method: 'GET',
      success(res) {
        const data = res.data || {};
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(normalizeStatusResponse(jobId, data));
        } else {
          reject(new Error(getErrorMessage(data, `查询失败：${res.statusCode}`)));
        }
      },
      fail(err) {
        reject(new Error(formatError(err, '查询失败')));
      },
    });
  });
}


function downloadAsset(url, label) {
  if (!url) return Promise.resolve('');

  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.tempFilePath) {
          wx.saveFile({
            tempFilePath: res.tempFilePath,
            success(saveRes) {
              resolve(saveRes.savedFilePath || res.tempFilePath);
            },
            fail() {
              resolve(res.tempFilePath);
            },
          });
        } else {
          reject(new Error(`${label}下载失败：${res.statusCode}`));
        }
      },
      fail(err) {
        reject(new Error(formatError(err, `${label}下载失败`)));
      },
    });
  });
}

export function downloadGeneratedAssets({ glbUrl, glbViewUrl, objUrl, videoUrl, previewImageUrl, resultFiles = [], resultCreditConsumed = 0, resultCreditDetails = {}, requestId = '' }) {
  return Promise.allSettled([
    downloadAsset(glbUrl, 'GLB模型'),
    downloadAsset(objUrl, 'OBJ文件'),
    downloadAsset(videoUrl, 'MP4预览'),
    downloadAsset(previewImageUrl, '预览图'),
  ]).then(([glbResult, objResult, videoResult, previewResult]) => ({
    glbPath: glbResult.status === 'fulfilled' ? glbResult.value : '',
    objPath: objResult.status === 'fulfilled' ? objResult.value : '',
    videoPath: videoResult.status === 'fulfilled' ? videoResult.value : '',
    previewImagePath: previewResult.status === 'fulfilled' ? previewResult.value : '',
    glbUrl,
    glbViewUrl,
    objUrl,
    videoUrl,
    previewImageUrl,
    glbDownloadError: glbResult.status === 'rejected' ? glbResult.reason.message : '',
    objDownloadError: objResult.status === 'rejected' ? objResult.reason.message : '',
    videoDownloadError: videoResult.status === 'rejected' ? videoResult.reason.message : '',
    previewImageDownloadError: previewResult.status === 'rejected' ? previewResult.reason.message : '',
    resultFiles,
    resultCreditConsumed,
    resultCreditDetails,
    requestId,
    savedAt: Date.now(),
  }));
}

