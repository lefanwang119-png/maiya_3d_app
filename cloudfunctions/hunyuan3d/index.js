const cloud = require('wx-server-sdk');
const https = require('https');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const AI3D_BASE_URL = 'https://api.ai3d.cloud.tencent.com';
const SUBMIT_URL = `${AI3D_BASE_URL}/v1/ai3d/submit`;
const QUERY_URL = `${AI3D_BASE_URL}/v1/ai3d/query`;
const DEFAULT_HUNYUAN_API_KEY = '';
const COPIED_FILE_MARK = 'maiyaCloudFileID';

function formatError(error, fallback = '混元云函数调用失败') {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (typeof error.message === 'string') return error.message;
  if (typeof error.errMsg === 'string') return error.errMsg;
  if (typeof error.error === 'string') return error.error;

  try {
    return JSON.stringify(error);
  } catch (err) {
    return fallback;
  }
}

function normalizeProviderError(message) {
  const text = formatError(message);
  if (text.includes('资源不足') || text.toLowerCase().includes('insufficient')) {
    return '腾讯混元生3D资源不足：请在腾讯云购买/开通资源包或后付费后再生成';
  }
  return text;
}

function requestJson(url, data, stage) {
  const startedAt = Date.now();
  const apiKey = normalizeApiKey(
    process.env.HUNYUAN_API_KEY ||
    process.env.HUNYUAN_TOKENHUB_API_KEY ||
    process.env.AI3D_API_KEY ||
    DEFAULT_HUNYUAN_API_KEY,
  );
  if (!apiKey) {
    return Promise.reject(new Error('云函数缺少环境变量 HUNYUAN_API_KEY'));
  }

  const body = JSON.stringify(data);
  const target = new URL(url);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: target.hostname,
        path: `${target.pathname}${target.search}`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 30000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = {};
          try {
            json = text ? JSON.parse(text) : {};
          } catch (err) {
            reject(new Error(`混元接口返回非JSON：${res.statusCode}`));
            return;
          }

          if (res.statusCode >= 200 && res.statusCode < 300) {
            const payload = json.Response || json.response || json.data || json;
            console.log(`[hunyuan3d:${stage}] ok`, {
              statusCode: res.statusCode,
              durationMs: Date.now() - startedAt,
              responseStatus: payload.Status || payload.status,
              jobId: payload.JobId || payload.jobId || payload.id,
              filesCount: Array.isArray(payload.ResultFile3Ds) ? payload.ResultFile3Ds.length : 0,
              requestId: payload.RequestId || payload.request_id,
            });
            resolve(json);
          } else {
            console.error(`[hunyuan3d:${stage}] failed`, {
              statusCode: res.statusCode,
              body: json,
            });
            reject(new Error(`${stage}失败：${normalizeProviderError(json.message || json.error || json)}`));
          }
        });
      },
    );

    req.on('timeout', () => {
      req.destroy(new Error('混元接口请求超时'));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function downloadRemoteFile(url, redirectCount = 0) {
  if (!url) return Promise.resolve(null);
  if (redirectCount > 3) return Promise.reject(new Error('文件下载重定向次数过多'));

  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const req = https.get(
      {
        hostname: target.hostname,
        path: `${target.pathname}${target.search}`,
        headers: {
          'User-Agent': 'MAIYA3D-CloudFunction',
        },
        timeout: 45000,
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          resolve(downloadRemoteFile(res.headers.location, redirectCount + 1));
          return;
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`文件下载失败：${res.statusCode}`));
          return;
        }

        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      },
    );

    req.on('timeout', () => {
      req.destroy(new Error('文件下载超时'));
    });
    req.on('error', reject);
  });
}

function getOutputExtension(file) {
  const type = String(file.Type || file.type || '').toLowerCase();
  const url = String(file.Url || file.url || '').toLowerCase();
  if (type.includes('glb') || url.includes('.glb')) return 'glb';
  if (type.includes('obj') || url.includes('.zip')) return 'zip';
  if (url.includes('.png')) return 'png';
  if (url.includes('.jpg') || url.includes('.jpeg')) return 'jpg';
  return 'bin';
}

async function copyGeneratedFile(jobId, file, index) {
  if (!file || file[COPIED_FILE_MARK]) return file;
  const url = file.Url || file.url;
  if (!url) return file;

  const ext = getOutputExtension(file);
  const type = String(file.Type || file.type || 'file').toLowerCase();
  const cloudPath = `ai3d-output/${jobId}/${type}-${index}.${ext}`;
  const fileContent = await downloadRemoteFile(url);

  const uploadRes = await cloud.uploadFile({
    cloudPath,
    fileContent,
  });

  return {
    ...file,
    [COPIED_FILE_MARK]: uploadRes.fileID,
  };
}

async function addCloudTempUrls(files) {
  const fileList = files
    .map((file) => file[COPIED_FILE_MARK])
    .filter(Boolean);
  if (!fileList.length) return files;

  const res = await cloud.getTempFileURL({ fileList });
  const urlMap = {};
  (res.fileList || []).forEach((file) => {
    urlMap[file.fileID] = file.tempFileURL;
  });

  return files.map((file) => ({
    ...file,
    MaiyaCloudUrl: urlMap[file[COPIED_FILE_MARK]] || '',
  }));
}

async function copyPreviewImage(jobId, file) {
  const previewUrl = file.PreviewImageUrl || file.previewImageUrl;
  if (!previewUrl || file.MaiyaPreviewCloudFileID) return file;

  const fileContent = await downloadRemoteFile(previewUrl);
  const uploadRes = await cloud.uploadFile({
    cloudPath: `ai3d-output/${jobId}/preview.png`,
    fileContent,
  });
  const tempRes = await cloud.getTempFileURL({
    fileList: [uploadRes.fileID],
  });
  const tempFile = tempRes.fileList && tempRes.fileList[0];

  return {
    ...file,
    MaiyaPreviewCloudFileID: uploadRes.fileID,
    MaiyaPreviewCloudUrl: tempFile ? tempFile.tempFileURL : '',
  };
}

async function copyDoneResultFiles(jobId, json) {
  const response = json.Response || json.response || json.data || json;
  if (!response || response.Status !== 'DONE' || !Array.isArray(response.ResultFile3Ds)) {
    return json;
  }

  try {
    const copiedFiles = await Promise.all(
      response.ResultFile3Ds.map((file, index) => copyGeneratedFile(jobId, file, index)),
    );
    const withPreview = copiedFiles.length ? await Promise.all(copiedFiles.map((file) => copyPreviewImage(jobId, file))) : copiedFiles;
    response.ResultFile3Ds = await addCloudTempUrls(withPreview);
    console.log('[hunyuan3d:copy] ok', {
      jobId,
      filesCount: response.ResultFile3Ds.length,
    });
  } catch (err) {
    console.error('[hunyuan3d:copy] failed', {
      jobId,
      error: formatError(err),
    });
  }

  return json;
}

async function copySingleAsset(payload = {}) {
  const url = payload.url || payload.Url;
  if (!url) {
    throw new Error('缺少文件地址');
  }

  const type = String(payload.type || 'file').toLowerCase();
  const jobId = String(payload.jobId || `manual-${Date.now()}`).replace(/[^\w-]/g, '');
  const ext = getOutputExtension({ Type: type, Url: url });
  const cloudPath = `ai3d-output/${jobId}/${type}-${Date.now()}.${ext}`;
  const fileContent = await downloadRemoteFile(url);
  const uploadRes = await cloud.uploadFile({
    cloudPath,
    fileContent,
  });
  const tempRes = await cloud.getTempFileURL({
    fileList: [uploadRes.fileID],
  });
  const tempFile = tempRes.fileList && tempRes.fileList[0];

  return {
    fileID: uploadRes.fileID,
    url: tempFile ? tempFile.tempFileURL : '',
    type,
  };
}

function normalizeApiKey(value) {
  return String(value || '')
    .trim()
    .replace(/^HUNYUAN_API_KEY\s*=\s*/i, '')
    .replace(/^AI3D_API_KEY\s*=\s*/i, '')
    .replace(/^Bearer\s+/i, '')
    .replace(/^['"]|['"]$/g, '')
    .replace(/\s+/g, '')
    .trim();
}

async function getImageUrl(fileID) {
  if (!fileID) return '';

  const res = await cloud.getTempFileURL({
    fileList: [fileID],
  });
  const file = res.fileList && res.fileList[0];
  if (!file || !file.tempFileURL) {
    throw new Error('图片临时地址获取失败');
  }

  return file.tempFileURL;
}

function buildSubmitPayload(payload, imageUrl) {
  const generateType = payload.generateType || 'Normal';
  const data = {
    Model: payload.model || '3.0',
    EnablePBR: payload.enablePBR !== false,
    FaceCount: payload.faceCount || 150000,
    GenerateType: generateType,
  };

  if (imageUrl) {
    data.ImageUrl = imageUrl;
    // Tencent HY3D allows Prompt + image only in Sketch generation.
    if (generateType === 'Sketch' && payload.prompt) {
      data.Prompt = payload.prompt;
    }
    return data;
  }

  data.Prompt = payload.prompt || '';
  return data;
}

async function submit(payload = {}) {
  const imageUrl = await getImageUrl(payload.imageFileID);
  const data = buildSubmitPayload(payload, imageUrl);
  console.log('[hunyuan3d:submit-payload]', {
    generateType: data.GenerateType,
    faceCount: data.FaceCount,
    enablePBR: data.EnablePBR,
    hasPrompt: Boolean(data.Prompt),
    hasImageUrl: Boolean(data.ImageUrl),
  });
  return requestJson(SUBMIT_URL, data, 'submit');
}

async function query(jobId, payload = {}) {
  if (!jobId) {
    return Promise.reject(new Error('缺少混元任务 ID'));
  }

  const result = await requestJson(QUERY_URL, {
    JobId: jobId,
  }, 'query');
  if (payload.copyFiles) {
    return copyDoneResultFiles(jobId, result);
  }
  return result;
}

exports.main = async (event) => {
  try {
    if (event.action === 'whoami') {
      const wxContext = cloud.getWXContext();
      return {
        openid: wxContext.OPENID,
        appid: wxContext.APPID,
        unionid: wxContext.UNIONID || '',
      };
    }

    if (event.action === 'submit') {
      return await submit(event.payload || {});
    }

    if (event.action === 'query') {
      return await query(event.jobId, event.payload || {});
    }

    if (event.action === 'copyAsset') {
      return await copySingleAsset(event.payload || {});
    }

    throw new Error('未知云函数动作');
  } catch (err) {
    return {
      error: formatError(err),
    };
  }
};

