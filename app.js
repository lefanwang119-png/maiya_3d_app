// app.js
import config from './config';
import createBus from './utils/eventBus';

App({
  onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({
        env: config.cloudEnvId || undefined,
        traceUser: true,
      });
    }

    const updateManager = wx.getUpdateManager();

    updateManager.onCheckForUpdate(() => {});

    updateManager.onUpdateReady(() => {
      wx.showModal({
        title: '更新提示',
        content: '新版本已经准备好，是否重启应用？',
        success(res) {
          if (res.confirm) {
            updateManager.applyUpdate();
          }
        },
      });
    });

    this.getUnreadNum();
  },

  globalData: {
    userInfo: null,
    unreadNum: 0, // 未读消息数量
    socket: null, // SocketTask 对象
  },

  // 全局事件总线
  eventBus: createBus(),

  // 初始化 WebSocket
  connect() {
    this.globalData.socket = null;
  },

  // 获取未读消息数量
  getUnreadNum() {
    this.globalData.unreadNum = 0;
    this.eventBus.emit('unread-num-change', 0);
  },

  // 设置未读消息数量
  setUnreadNum(unreadNum) {
    this.globalData.unreadNum = unreadNum;
    this.eventBus.emit('unread-num-change', unreadNum);
  },
});
