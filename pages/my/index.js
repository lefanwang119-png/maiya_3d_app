import request from '~/api/request';
import { requestRechargePayment } from '~/api/payment';
import { getGeneratedModels } from '~/utils/generatedModels';
import { getPointLogs, getPointsBalance, rechargePoints } from '~/utils/points';
import images from '~/config/images';

const myModels = [
  { id: 1, title: '头戴耳机打印成品', image: images.figma.headphone, likes: 33, downloads: 99 },
  { id: 2, title: '头戴耳机展示模型', image: images.figma.headphone, likes: 33, downloads: 99 },
  { id: 3, title: '头戴耳机潮玩模型', image: images.figma.headphone, likes: 33, downloads: 99 },
  { id: 4, title: '头戴耳机收藏摆件', image: images.figma.headphone, likes: 33, downloads: 99 },
];

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
    isPaying: false,
    myModels,
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
    const generatedModels = getGeneratedModels();
    this.setData({ myModels: [...generatedModels, ...myModels] });
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
      const info = await request('/api/genPersonalInfo').then((res) => res.data.data);
      return info;
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

  openModel(event) {
    const { id } = event.currentTarget.dataset;
    const model = this.data.myModels.find((item) => String(item.id) === String(id));
    if (model && model.assets) {
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
