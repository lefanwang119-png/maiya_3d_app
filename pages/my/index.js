import request from '~/api/request';
import { requestRechargePayment } from '~/api/payment';
import {
  addGeneratedModel,
  getGeneratedModels,
  getStatusMeta,
  REVIEW_STATUS,
  submitGeneratedModelReview,
  withdrawGeneratedModelReview,
} from '~/utils/generatedModels';
import {
  getDemoModelReview,
  submitDemoModelReview,
  withdrawDemoModelReview,
} from '~/utils/myModelVisibility';
import { getPointLogs, getPointsBalance, rechargePoints } from '~/utils/points';
import { demoMyModels } from '~/utils/demoMyModels';
import images from '~/config/images';

function decorateMyModel(item) {
  const reviewStatus = item.reviewStatus || (item.isPublic ? REVIEW_STATUS.PUBLISHED : REVIEW_STATUS.HIDDEN);
  const statusMeta = getStatusMeta(reviewStatus);
  return {
    ...item,
    reviewStatus,
    isPublic: reviewStatus === REVIEW_STATUS.PUBLISHED,
    statusText: statusMeta.text,
    actionText: statusMeta.actionText,
    actionHint: statusMeta.hint,
  };
}

function getDemoModels() {
  return demoMyModels.map((item) => decorateMyModel({
    ...item,
    reviewStatus: getDemoModelReview(item.id).reviewStatus,
    reviewReason: getDemoModelReview(item.id).reviewReason,
  }));
}

Page({
  data: {
    images: {
      logo: images.figma.logo,
      avatar: images.figma.avatar,
    },
    isLoad: false,
    service: [],
    personalInfo: {},
    pointsBalance: 0,
    incomeTotal: '0.00',
    incomeLikes: 0,
    incomeRate: 0.1,
    pointLogs: [],
    showRecharge: false,
    showUploadPanel: false,
    isPaying: false,
    isSavingUpload: false,
    myModels: [],
    uploadForm: {
      title: '',
      description: '',
      image: '',
      filePath: '',
      fileName: '',
      format: '',
    },
    rechargeNote: '支付成功后积分会自动到账',
    rechargeOptions: [
      { points: 50, price: '5.00', badge: '轻量体验' },
      { points: 100, price: '10.00', badge: '常用' },
      { points: 300, price: '30.00', badge: '推荐' },
      { points: 500, price: '50.00', badge: '批量创作' },
    ],
  },

  onLoad() {
    this.getServiceList();
  },

  async onShow() {
    const token = wx.getStorageSync('access_token');
    this.refreshPoints();
    this.refreshIncome();
    this.refreshMyModels();

    if (token) {
      const personalInfo = await this.getPersonalInfo();
      this.setData({ isLoad: true, personalInfo });
    } else {
      this.setData({ isLoad: false, personalInfo: {} });
    }
  },

  refreshPoints() {
    const pointLogs = getPointLogs().slice(0, 3).map((item) => ({
      ...item,
      pointsText: `${item.points > 0 ? '+' : ''}${item.points}`,
      pointsClass: item.points > 0 ? 'plus' : 'minus',
    }));
    this.setData({ pointsBalance: getPointsBalance(), pointLogs });
  },

  refreshIncome() {
    const userInfo = wx.getStorageSync('user_info') || {};
    const username = userInfo.name || userInfo.nickName || '';
    const models = wx.getStorageSync('community_models_v1') || [];
    const ownedModels = Array.isArray(models) ? models.filter((item) => item.author === username) : [];
    const incomeLikes = ownedModels.reduce((sum, item) => sum + Number(item.likes || 0), 0);
    const incomeTotal = (incomeLikes * this.data.incomeRate).toFixed(2);
    this.setData({ incomeLikes, incomeTotal });
  },

  refreshMyModels() {
    const generatedModels = getGeneratedModels().map(decorateMyModel);
    this.setData({ myModels: [...generatedModels, ...getDemoModels()] });
  },

  getServiceList() {
    request('/api/getServiceList')
      .then((res) => {
        const { service } = res.data.data;
        this.setData({ service });
      })
      .catch(() => {
        this.setData({ service: [] });
      });
  },

  async getPersonalInfo() {
    const localInfo = wx.getStorageSync('user_info');
    if (localInfo) {
      return {
        name: localInfo.name || localInfo.nickName || 'Admin',
        image: localInfo.image || localInfo.avatarUrl || images.figma.avatar,
      };
    }

    try {
      return await request('/api/genPersonalInfo').then((res) => res.data.data);
    } catch (err) {
      return { name: 'Admin', image: images.figma.avatar };
    }
  },

  onLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  onNavigateTo() {
    wx.showActionSheet({
      itemList: ['退出登录'],
      success: (res) => {
        if (res.tapIndex !== 0) return;
        wx.removeStorageSync('access_token');
        wx.removeStorageSync('user_info');
        const app = getApp();
        if (app && app.globalData) app.globalData.userInfo = null;
        this.setData({ isLoad: false, personalInfo: {} });
        wx.showToast({ title: '已退出登录', icon: 'success' });
      },
    });
  },

  handleProfileTap() {
    if (this.data.isLoad) {
      this.onNavigateTo();
      return;
    }
    this.onLogin();
  },

  openRecharge() {
    this.setData({ showRecharge: true });
  },

  closeRecharge() {
    if (this.data.isPaying) return;
    this.setData({ showRecharge: false });
  },

  openOrders() {
    wx.navigateTo({ url: '/pages/my/orders/index' });
  },

  openIncome() {
    wx.showModal({
      title: '创作收入',
      content: `累计点赞：${this.data.incomeLikes}\n换算规则：1 赞 = ¥${this.data.incomeRate}\n预计收入：¥${this.data.incomeTotal}`,
      showCancel: false,
      confirmText: '我知道了',
    });
  },

  openGeneratedManage() {
    wx.navigateTo({ url: '/pages/generated/index' });
  },

  resetUploadForm() {
    this.setData({
      uploadForm: {
        title: '',
        description: '',
        image: '',
        filePath: '',
        fileName: '',
        format: '',
      },
      isSavingUpload: false,
    });
  },

  openUploadPanel() {
    this.resetUploadForm();
    this.setData({ showUploadPanel: true });
  },

  closeUploadPanel() {
    if (this.data.isSavingUpload) return;
    this.setData({ showUploadPanel: false });
  },

  onUploadTitleInput(event) {
    this.setData({ 'uploadForm.title': event.detail.value || '' });
  },

  onUploadDescInput(event) {
    this.setData({ 'uploadForm.description': event.detail.value || '' });
  },

  chooseUploadCover() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file || !file.tempFilePath) return;
        this.setData({ 'uploadForm.image': file.tempFilePath });
      },
      fail: () => {},
    });
  },

  chooseUploadFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['glb', 'obj'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file || !file.path) return;
        const fileName = file.name || file.path.split('/').pop() || 'model.glb';
        const ext = fileName.split('.').pop().toUpperCase();
        if (!['GLB', 'OBJ'].includes(ext)) {
          wx.showToast({ title: '请选择 GLB 或 OBJ 文件', icon: 'none' });
          return;
        }
        this.setData({
          'uploadForm.filePath': file.path,
          'uploadForm.fileName': fileName,
          'uploadForm.format': ext,
        });
      },
      fail: () => {},
    });
  },

  saveUploadedModel() {
    const form = this.data.uploadForm;
    const title = String(form.title || '').trim();
    const description = String(form.description || '').trim();
    if (!title) {
      wx.showToast({ title: '请填写模型名称', icon: 'none' });
      return;
    }
    if (!form.filePath) {
      wx.showToast({ title: '请上传 GLB 或 OBJ 文件', icon: 'none' });
      return;
    }
    if (!form.image) {
      wx.showToast({ title: '请上传模型图片', icon: 'none' });
      return;
    }

    this.setData({ isSavingUpload: true });
    addGeneratedModel({
      title,
      image: form.image,
      category: '模型',
      isPublic: false,
      submitForReview: false,
      format: form.format || 'FILE',
      description: description || '用户上传的本地模型。',
      size: form.fileName || '本地文件',
      assets: {
        source: 'manual-upload',
        modelPath: form.filePath,
        fileName: form.fileName,
        format: form.format,
        previewImagePath: form.image,
        description,
      },
    });

    this.setData({ showUploadPanel: false });
    this.resetUploadForm();
    this.refreshMyModels();
    wx.showToast({ title: '已添加到我的模型', icon: 'success' });
  },

  toggleMyModelPublish(event) {
    const id = event.currentTarget.dataset.id;
    const target = this.data.myModels.find((item) => String(item.id) === String(id));
    if (!target) return;

    if (target.isGenerated) {
      if (target.reviewStatus === REVIEW_STATUS.PENDING || target.reviewStatus === REVIEW_STATUS.PUBLISHED) {
        withdrawGeneratedModelReview(id);
      } else {
        submitGeneratedModelReview(id);
      }
    } else {
      if (target.reviewStatus === REVIEW_STATUS.PENDING || target.reviewStatus === REVIEW_STATUS.PUBLISHED) {
        withdrawDemoModelReview(id);
      } else {
        submitDemoModelReview(id);
      }
    }

    this.refreshMyModels();

    wx.showToast({
      title: target.isGenerated
        ? (target.reviewStatus === REVIEW_STATUS.PENDING || target.reviewStatus === REVIEW_STATUS.PUBLISHED ? '已隐藏' : '已提交审核')
        : (target.reviewStatus === REVIEW_STATUS.PENDING || target.reviewStatus === REVIEW_STATUS.PUBLISHED ? '已隐藏' : '已提交审核'),
      icon: 'success',
    });
  },

  openModel(event) {
    const { id } = event.currentTarget.dataset;
    const model = this.data.myModels.find((item) => String(item.id) === String(id));
    if (model && model.assets && Object.keys(model.assets).length) {
      wx.setStorageSync('latestAi3dAssets', model.assets);
      wx.navigateTo({ url: '/pages/result/index' });
      return;
    }

    wx.showActionSheet({
      itemList: ['查看模型信息', '去模型页浏览'],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.showModal({
            title: model ? model.title : '模型信息',
            content: model ? model.description || '暂无更多信息' : '未找到模型信息',
            showCancel: false,
          });
          return;
        }
        wx.switchTab({ url: '/pages/model/index' });
      },
    });
  },

  recharge(event) {
    const points = Number(event.currentTarget.dataset.points);
    if (!points || this.data.isPaying) return;

    this.setData({ isPaying: true, rechargeNote: '正在拉起微信支付...' });
    requestRechargePayment({ points })
      .then(() => {
        rechargePoints(points, {
          amountFen: Math.round(points * 10),
          title: `充值${points}积分`,
        });
        this.setData({ showRecharge: false, isPaying: false, rechargeNote: '支付成功后积分会自动到账' });
        this.refreshPoints();
        wx.showToast({ title: '充值成功', icon: 'success' });
      })
      .catch((err) => {
        this.setData({ isPaying: false, rechargeNote: '支付成功后积分会自动到账' });
        wx.showToast({ title: err.message || '支付未完成', icon: 'none', duration: 3000 });
      });
  },

  noop() {},
});
