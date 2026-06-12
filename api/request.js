import config from '~/config';

const { baseUrl } = config;
const delay = config.isMock ? 500 : 0;
const REQUEST_TIMEOUT = 8000;

function normalizeResponse(res) {
  const isWxResponse = typeof res.statusCode === 'number';
  const statusCode = isWxResponse ? res.statusCode : 200;
  const body = isWxResponse ? res.data : res;
  const businessCode = body.code;
  const okStatus = statusCode >= 200 && statusCode < 300;
  const okBusiness = businessCode === undefined || businessCode === 200;

  return {
    ok: okStatus && okBusiness,
    data: body,
    raw: res,
  };
}

function request(url, method = 'GET', data = {}) {
  const hasAbsoluteUrl = /^https?:\/\//i.test(String(url || ''));
  if (!hasAbsoluteUrl && !baseUrl) {
    return Promise.reject(new Error('API baseUrl is empty'));
  }

  const header = {
    'content-type': 'application/json',
  };

  const tokenString = wx.getStorageSync('access_token');
  if (tokenString) {
    header.Authorization = `Bearer ${tokenString}`;
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: hasAbsoluteUrl ? url : baseUrl + url,
      method,
      data,
      dataType: 'json',
      header,
      timeout: REQUEST_TIMEOUT,
      success(res) {
        setTimeout(() => {
          const response = normalizeResponse(res);
          if (response.ok) {
            resolve(response.data);
          } else {
            reject(response.raw);
          }
        }, delay);
      },
      fail(err) {
        setTimeout(() => {
          reject(err);
        }, delay);
      },
    });
  });
}

export default request;
