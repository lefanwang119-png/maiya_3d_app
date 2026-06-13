import {
  approveGeneratedModel,
  getPendingGeneratedModels,
  getStatusMeta,
  rejectGeneratedModel,
} from '../../../utils/generatedModels';
import { demoMyModels } from '../../../utils/demoMyModels';
import {
  approveDemoModelReview,
  getDemoModelReview,
  rejectDemoModelReview,
} from '../../../utils/myModelVisibility';

function formatTime(value) {
  if (!value) return '刚刚';
  const date = new Date(value);
  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

function decorateModel(item) {
  const statusMeta = getStatusMeta(item.reviewStatus);
  return {
    ...item,
    statusText: statusMeta.text,
    submittedAtText: formatTime(item.submittedAt || item.createdAt),
  };
}

function getPendingDemoModels() {
  return demoMyModels
    .map((item) => ({ ...item, ...getDemoModelReview(item.id), isDemoModel: true }))
    .filter((item) => item.reviewStatus === 'pending')
    .map(decorateModel);
}

Page({
  data: {
    models: [],
  },

  onShow() {
    this.loadModels();
  },

  loadModels() {
    this.setData({
      models: [
        ...getPendingGeneratedModels().map((item) => decorateModel({ ...item, isGeneratedModel: true })),
        ...getPendingDemoModels(),
      ],
    });
  },

  handleBack() {
    wx.navigateBack({ fail: () => wx.navigateTo({ url: '/pages/generated/index' }) });
  },

  approveModel(event) {
    const id = event.currentTarget.dataset.id;
    const type = event.currentTarget.dataset.type;
    if (type === 'demo') {
      approveDemoModelReview(id);
    } else {
      approveGeneratedModel(id);
    }
    this.loadModels();
    wx.showToast({ title: '已通过审核', icon: 'success' });
  },

  rejectModel(event) {
    const id = event.currentTarget.dataset.id;
    const type = event.currentTarget.dataset.type;
    wx.showModal({
      title: '驳回发布申请',
      content: '确认驳回？用户端会显示未通过，可重新申请。',
      confirmText: '驳回',
      confirmColor: '#343c3e',
      success: (res) => {
        if (!res.confirm) return;
        if (type === 'demo') {
          rejectDemoModelReview(id);
        } else {
          rejectGeneratedModel(id);
        }
        this.loadModels();
        wx.showToast({ title: '已驳回', icon: 'success' });
      },
    });
  },

  openResult(event) {
    const id = event.currentTarget.dataset.id;
    const model = this.data.models.find((item) => String(item.id) === String(id));
    if (!model || !model.assets) {
      wx.showToast({ title: '暂无生成资产', icon: 'none' });
      return;
    }
    wx.setStorageSync('latestAi3dAssets', model.assets);
    wx.navigateTo({ url: '/pages/result/index' });
  },
});
