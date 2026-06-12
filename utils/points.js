const POINTS_KEY = 'maiya_points_balance';
const POINT_LOG_KEY = 'maiya_points_logs';

export const GENERATION_COSTS = {
  image: 0,
  text: 0,
  multi: 0,
};

function createLog(log) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: Date.now(),
    ...log,
  };
}

export function getPointsBalance() {
  const value = Number(wx.getStorageSync(POINTS_KEY));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function setPointsBalance(value) {
  const nextValue = Math.max(0, Number(value) || 0);
  wx.setStorageSync(POINTS_KEY, nextValue);
  return nextValue;
}

export function addPointLog(log) {
  const logs = wx.getStorageSync(POINT_LOG_KEY) || [];
  const nextLogs = [createLog(log), ...logs].slice(0, 80);
  wx.setStorageSync(POINT_LOG_KEY, nextLogs);
  return nextLogs;
}

export function getPointLogs() {
  return wx.getStorageSync(POINT_LOG_KEY) || [];
}

export function fetchPointsAccount(limit = 20) {
  const logs = getPointLogs().slice(0, limit);
  return Promise.resolve({ balance: getPointsBalance(), logs });
}

export function rechargePoints(points, meta = {}) {
  const amount = Number(points) || 0;
  const balance = setPointsBalance(getPointsBalance() + amount);
  addPointLog({
    type: 'recharge',
    title: meta.title || '积分充值',
    points: amount,
    balance,
    ...meta,
  });
  return balance;
}

export function consumePoints(points, meta = {}) {
  const amount = Number(points) || 0;
  const current = getPointsBalance();
  if (current < amount) {
    return {
      success: false,
      balance: current,
      logs: getPointLogs(),
      error: 'POINTS_NOT_ENOUGH',
      consumeLogId: '',
    };
  }

  const balance = setPointsBalance(current - amount);
  const consumeLog = createLog({
    type: 'consume',
    title: meta.title || 'AI 3D 生成',
    points: -amount,
    balance,
    ...meta,
  });
  const logs = [consumeLog, ...getPointLogs()].slice(0, 80);
  wx.setStorageSync(POINT_LOG_KEY, logs);
  return {
    success: true,
    balance,
    logs,
    error: '',
    consumeLogId: consumeLog.id,
  };
}

export function refundPoints(consumeLogId, meta = {}) {
  const logs = getPointLogs();
  const consumeLog = logs.find((item) => item.id === consumeLogId);
  const amount = consumeLog ? Math.abs(Number(consumeLog.points || 0)) : Number(meta.points || 0);
  if (!amount) return Promise.resolve({ balance: getPointsBalance(), logs });

  const balance = setPointsBalance(getPointsBalance() + amount);
  const nextLogs = [
    createLog({
      type: 'refund',
      title: meta.title || '生成失败退回积分',
      points: amount,
      balance,
      refundFor: consumeLogId,
      ...meta,
    }),
    ...logs,
  ].slice(0, 80);
  wx.setStorageSync(POINT_LOG_KEY, nextLogs);
  return Promise.resolve({ balance, logs: nextLogs });
}

export function getGenerationCost(mode) {
  return GENERATION_COSTS[mode] || 0;
}
