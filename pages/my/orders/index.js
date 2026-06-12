import { getPointLogs } from '~/utils/points';

function formatTime(value) {
  const date = new Date(value);
  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function normalizeOrders() {
  return getPointLogs().map((item) => {
    const isRecharge = item.type === 'recharge';
    const amountFen = Number(item.amountFen || Math.abs(item.points || 0) * 10);
    return {
      ...item,
      timeText: formatTime(item.createdAt || Date.now()),
      typeText: isRecharge ? '积分充值' : 'AI 生成消耗',
      amountText: isRecharge ? `￥${(amountFen / 100).toFixed(2)}` : `${Math.abs(item.points || 0)} 积分`,
      pointText: `${item.points > 0 ? '+' : ''}${item.points}`,
      pointClass: item.points > 0 ? 'plus' : 'minus',
      statusText: isRecharge ? '支付成功' : '已完成',
    };
  });
}

Page({
  data: {
    orders: [],
  },

  onShow() {
    this.setData({ orders: normalizeOrders() });
  },

  handleBack() {
    wx.navigateBack();
  },
});
