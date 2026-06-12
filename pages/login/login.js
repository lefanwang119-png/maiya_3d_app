import images from '~/config/images';

Page({
  data: {
    logo: images.figma.logo,
    defaultAvatar: images.figma.avatar,
    avatarUrl: '',
    nickname: '',
    isSubmitting: false,
  },

  onChooseAvatar(event) {
    const avatarUrl = event.detail.avatarUrl || '';
    this.setData({ avatarUrl });
  },

  onNicknameInput(event) {
    this.setData({ nickname: event.detail.value || '' });
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.switchTab({ url: '/pages/my/index' });
  },

  login() {
    if (this.data.isSubmitting) return;
    const nickname = String(this.data.nickname || '').trim() || 'Admin';
    const avatarUrl = this.data.avatarUrl || this.data.defaultAvatar;

    this.setData({ isSubmitting: true });
    wx.login({
      success: (res) => {
        const userInfo = {
          name: nickname,
          nickName: nickname,
          image: avatarUrl,
          avatarUrl,
          loginCode: res.code || '',
          loginAt: Date.now(),
        };
        wx.setStorageSync('access_token', `local_${Date.now()}`);
        wx.setStorageSync('user_info', userInfo);
        const app = getApp();
        if (app && app.globalData) {
          app.globalData.userInfo = userInfo;
        }
        wx.showToast({ title: '登录成功', icon: 'success' });
        setTimeout(() => {
          this.setData({ isSubmitting: false });
          wx.switchTab({ url: '/pages/my/index' });
        }, 350);
      },
      fail: () => {
        this.setData({ isSubmitting: false });
        wx.showToast({ title: '微信登录失败，请重试', icon: 'none' });
      },
    });
  },
});
