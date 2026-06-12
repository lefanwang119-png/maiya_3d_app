const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

exports.main = async (event) => {
  console.log('[payCallback]', event);
  return {
    errcode: 0,
    errmsg: 'ok',
  };
};
