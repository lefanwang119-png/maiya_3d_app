const app = getApp();

Component({
  data: {
    value: 'home',
    pendingValue: '',
    aiPressed: false,
    aiExpanding: false,
    unreadNum: 0,
    list: [
      { value: 'home', label: '首页', url: '/pages/home/index' },
      { value: 'model', label: '模型', url: '/pages/model/index' },
      { value: 'shop', label: '商城', url: '/pages/shop/index' },
      { value: 'my', label: '我的', url: '/pages/my/index' }
    ]
  },
  lifetimes: {
    ready() {
      this.syncActive();
      this.setUnreadNum(app.globalData.unreadNum);
      app.eventBus.on('unread-num-change', (unreadNum) => this.setUnreadNum(unreadNum));
    }
  },
  pageLifetimes: {
    show() { this.syncActive(); }
  },
  methods: {
    syncActive() {
      const pages = getCurrentPages();
      const curPage = pages[pages.length - 1];
      if (!curPage) return;
      const match = /pages\/([^/]+)\/index/.exec(curPage.route);
      if (!match) return;
      this.setData({ value: match[1] });
    },
    handleChange(e) {
      const { value } = e.currentTarget.dataset;
      const item = this.data.list.find((tab) => tab.value === value);
      if (!item || item.value === this.data.value) return;
      wx.switchTab({ url: item.url });
    },
    openAi() {
      wx.navigateTo({ url: '/pages/ai/index' });
    },
    setUnreadNum(unreadNum) {
      this.setData({ unreadNum });
    }
  }
});