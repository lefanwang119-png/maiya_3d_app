const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

function createOutTradeNo() {
  return `MY${Date.now()}${Math.random().toString(10).slice(2, 8)}`;
}

exports.main = async (event) => {
  if (event.action !== 'createRechargeOrder') {
    return { error: '未知支付动作' };
  }

  const points = Number(event.points) || 0;
  const amountFen = Number(event.amountFen) || 0;
  const subMchId = process.env.WECHAT_PAY_SUB_MCH_ID || process.env.SUB_MCH_ID;
  const envId = event.envId || process.env.WX_CLOUD_ENV || cloud.DYNAMIC_CURRENT_ENV;
  const functionName = process.env.WECHAT_PAY_CALLBACK || 'payCallback';

  if (!points || !amountFen) {
    return { error: '充值积分或金额无效' };
  }

  if (!subMchId) {
    return { error: '微信支付尚未配置：请在 payment 云函数环境变量中设置 WECHAT_PAY_SUB_MCH_ID' };
  }

  const outTradeNo = createOutTradeNo();
  const res = await cloud.cloudPay.unifiedOrder({
    body: `MAIYA3D积分充值-${points}积分`,
    outTradeNo,
    spbillCreateIp: '127.0.0.1',
    subMchId,
    totalFee: amountFen,
    envId,
    functionName,
    attach: JSON.stringify({
      type: 'points_recharge',
      points,
    }),
  });

  if (!res || !res.payment) {
    return { error: '微信支付统一下单失败，请检查商户号与云支付配置' };
  }

  return {
    payment: res.payment,
    order: {
      outTradeNo,
      points,
      amountFen,
    },
  };
};
