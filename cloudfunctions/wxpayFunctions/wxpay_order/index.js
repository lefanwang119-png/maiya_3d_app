/**
 * 微信支付 - 下单
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const points = Number(event.points) || 0;
  const amountFen = Number(event.amountFen) || 0;

  if (!points || !amountFen) {
    return {
      code: -1,
      msg: '积分或金额无效',
    };
  }

  if (amountFen !== Math.round(points * 10)) {
    return {
      code: -1,
      msg: '充值金额与积分规则不匹配',
    };
  }

  // 商户自行生成商户订单号，此处仅为代码示例
  const outTradeNo = `MY${Date.now()}${Math.round(Math.random() * 10 ** 6)}`;

  // 商户存储订单号到数据库，便于后续与微信侧订单号关联。例如使用云开发云存储能力：
  // db.collection('orders').add({ data: { outTradeNo } });

  const res = await cloud.callFunction({
    name: 'cloudbase_module',
    data: {
      name: 'wxpay_order',
      data: {
        description: `MAIYA3D积分充值-${points}积分`,
        amount: {
          total: amountFen, // 订单金额，单位：分
          currency: 'CNY',
        },
        // 商户生成的订单号
        out_trade_no: outTradeNo,
        payer: {
          // 服务端云函数中直接获取当前用户openId
          openid: wxContext.OPENID,
        },
        attach: JSON.stringify({
          type: 'points_recharge',
          points,
        }),
      },
    },
  });
  return {
    ...res.result,
    outTradeNo,
    points,
    amountFen,
  };
};
