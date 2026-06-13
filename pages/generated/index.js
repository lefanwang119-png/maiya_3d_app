import {
  deleteGeneratedModel,
  getGeneratedModels,
  getStatusMeta,
  REVIEW_STATUS,
  submitGeneratedModelReview,
  withdrawGeneratedModelReview,
} from '../../utils/generatedModels';

function formatTime(value) {
  if (!value) return '刚刚';
  const date = new Date(value);
  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

function decorateModel(item) {
  const reviewStatus = item.reviewStatus || REVIEW_STATUS.HIDDEN;
  const statusMeta = getStatusMeta(reviewStatus);
  return {
    ...item,
    reviewStatus,
    isPublic: reviewStatus === REVIEW_STATUS.PUBLISHED,
    statusText: statusMeta.text,
    actionText: statusMeta.actionText,
    actionHint: item.reviewReason || statusMeta.hint,
    createdAtText: formatTime(item.createdAt),
  };
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
      models: getGeneratedModels().map(decorateModel),
    });
  },

  handleBack() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/my/index' }) });
  },

  toggleReview(event) {
    const id = event.currentTarget.dataset.id;
    const target = this.data.models.find((item) => String(item.id) === String(id));
    if (!target) return;

    if (target.reviewStatus === REVIEW_STATUS.PENDING || target.reviewStatus === REVIEW_STATUS.PUBLISHED) {
      withdrawGeneratedModelReview(id);
      wx.showToast({ title: target.reviewStatus === REVIEW_STATUS.PUBLISHED ? '已从模型页隐藏' : '已撤回申请', icon: 'success' });
    } else {
      submitGeneratedModelReview(id);
      wx.showToast({ title: '已提交管理员审核', icon: 'success' });
    }
    this.loadModels();
  },

  openAdminReview() {
    wx.navigateTo({ url: '/pages/admin/review/index' });
  },

  deleteModel(event) {
    const id = event.currentTarget.dataset.id;
    const target = this.data.models.find((item) => String(item.id) === String(id));
    wx.showModal({
      title: '删除模型',
      content: target ? `确认删除「${target.title}」？删除后不可恢复。` : '确认删除这个模型？',
      confirmText: '删除',
      confirmColor: '#343c3e',
      success: (res) => {
        if (!res.confirm) return;
        deleteGeneratedModel(id);
        this.loadModels();
        wx.showToast({ title: '已删除', icon: 'success' });
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

  openDetail(event) {
    const id = event.currentTarget.dataset.id;
    const model = this.data.models.find((item) => String(item.id) === String(id));
    if (!model) {
      wx.showToast({ title: '模型不存在', icon: 'none' });
      return;
    }
    wx.setStorageSync('maiya3d_model_detail', model);
    wx.navigateTo({ url: '/pages/model-detail/index' });
  },
});
