export function requestRechargePayment({ points }) {
  const withTimeout = (promise, ms = 15000, message = 'Payment request timeout') => {
    let timer = null;
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  };

  const rechargePoints = Number(points) || 0;
  const amountFen = Math.round(rechargePoints * 10);

  if (!wx.cloud || !wx.cloud.callFunction) {
    return Promise.reject(new Error('Please enable cloud functions first'));
  }

  return withTimeout(wx.cloud.callFunction({
    name: 'wxpayFunctions',
    data: { type: 'wxpay_order', points: rechargePoints, amountFen },
  }), 15000, 'Create payment order timeout').then((res) => {
    const result = res.result || {};
    if (result.error || result.code === -1) {
      throw new Error(result.error || result.msg || 'Create payment order failed');
    }

    const payment = result.payment || (result.data && result.data.payment) || result;
    const hasParams = payment.timeStamp && payment.nonceStr && payment.package && payment.signType && payment.paySign;
    if (!hasParams) {
      throw new Error(result.msg || 'Missing payment params');
    }

    return new Promise((resolve, reject) => {
      wx.requestPayment({
        ...payment,
        success: () => resolve(result),
        fail: (err) => reject(new Error(err.errMsg || 'Payment canceled')),
      });
    });
  });
}
