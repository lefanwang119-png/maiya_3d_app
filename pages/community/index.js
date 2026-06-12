import images from '~/config/images';

const STORAGE_KEY = 'community_models_v1';
const FOLLOW_KEY = 'community_follow_authors_v1';
const NOTICE_KEY = 'community_notice_v1';

const DEFAULT_MODELS = [
  {
    id: 101,
    title: '头戴耳机打印成品',
    desc: '耳机造型打印成品，适合展示和收藏。',
    author: '官方',
    image: images.figma.headphone,
    format: 'GLB',
    likes: 128,
    createdAt: Date.now() - 86400000 * 2,
    comments: [{ id: 1, author: '模型玩家', content: '结构很漂亮', createdAt: Date.now() - 86000000 }],
  },
  {
    id: 102,
    title: '渐变花瓶数字模型',
    desc: '已针对家用打印机优化壁厚。',
    author: '打印实验室',
    image: images.figma.cardRibbed,
    format: 'OBJ',
    likes: 96,
    createdAt: Date.now() - 86400000,
    comments: [],
  },
  {
    id: 103,
    title: '折纸飞鸟桌面摆件',
    desc: '适合礼物和桌面展示，欢迎交流建议。',
    author: '官方',
    image: images.figma.cardVase,
    format: 'GLB',
    likes: 77,
    createdAt: Date.now() - 43200000,
    comments: [],
  },
];

function formatTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}-${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function normalizeComment(item) {
  const createdAt = item.createdAt || Date.now();
  return { ...item, createdAt, createdAtText: item.createdAtText || formatTime(createdAt) };
}

function normalizeModel(item) {
  return {
    ...item,
    likes: Number(item.likes || 0),
    comments: Array.isArray(item.comments) ? item.comments.map(normalizeComment) : [],
    createdAt: item.createdAt || Date.now(),
    createdAtText: formatTime(item.createdAt || Date.now()),
  };
}

function normalizeNotice(item) {
  const createdAt = item.createdAt || Date.now();
  return { ...item, createdAt, createdAtText: item.createdAtText || formatTime(createdAt), read: Boolean(item.read) };
}

Page({
  data: {
    models: [],
    filteredModels: [],
    top3: [],
    followedAuthors: [],
    feedMode: 'all',
    focusAuthor: '',
    notices: [],
    unreadNoticeCount: 0,
    showNoticePanel: false,
    showPublish: false,
    publishTitle: '',
    publishDesc: '',
    publishFormat: 'GLB',
    publishImage: '',
    selectedModel: null,
    selectedAuthorFollowed: false,
    showDetail: false,
    commentText: '',
  },

  onShow() {
    this.bootstrapModels();
    this.loadFollowAuthors();
    this.loadNotices();
  },

  bootstrapModels() {
    const local = wx.getStorageSync(STORAGE_KEY);
    const localList = Array.isArray(local) ? local : [];
    const defaultIds = DEFAULT_MODELS.map((item) => String(item.id));
    const merged = [
      ...DEFAULT_MODELS,
      ...localList.filter((item) => !defaultIds.includes(String(item.id))),
    ];

    const models = merged.map(normalizeModel).sort((a, b) => b.createdAt - a.createdAt);
    const focusAuthor = wx.getStorageSync('community_focus_author');
    if (focusAuthor) {
      wx.removeStorageSync('community_focus_author');
      this.setData({ feedMode: 'followed', focusAuthor });
    } else {
      this.setData({ feedMode: 'all', focusAuthor: '' });
    }
    this.persistAndRender(models);
  },

  persistAndRender(models) {
    wx.setStorageSync(STORAGE_KEY, models);
    const top3 = models.slice().sort((a, b) => b.likes - a.likes).slice(0, 3).map((item, index) => ({ ...item, rank: index + 1 }));
    this.setData({ models, top3 }, () => this.applyFeedFilter());
  },

  loadFollowAuthors() {
    const followedAuthors = wx.getStorageSync(FOLLOW_KEY);
    this.setData({ followedAuthors: Array.isArray(followedAuthors) ? followedAuthors : [] }, () => this.applyFeedFilter());
  },

  persistFollowAuthors(followedAuthors) {
    wx.setStorageSync(FOLLOW_KEY, followedAuthors);
    this.setData({ followedAuthors }, () => this.applyFeedFilter());
  },

  applyFeedFilter() {
    const { models, feedMode, followedAuthors, focusAuthor } = this.data;
    let filteredModels = models.slice();
    if (feedMode === 'followed') {
      filteredModels = focusAuthor
        ? filteredModels.filter((item) => item.author === focusAuthor)
        : filteredModels.filter((item) => followedAuthors.includes(item.author));
    }
    this.setData({ filteredModels });
  },

  switchFeedMode(e) {
    const mode = e.currentTarget.dataset.mode === 'followed' ? 'followed' : 'all';
    this.setData({ feedMode: mode }, () => this.applyFeedFilter());
  },

  clearFocusAuthor() {
    this.setData({ focusAuthor: '' }, () => this.applyFeedFilter());
  },

  loadNotices() {
    const notices = wx.getStorageSync(NOTICE_KEY);
    const nextNotices = Array.isArray(notices) ? notices.map(normalizeNotice).sort((a, b) => b.createdAt - a.createdAt) : [];
    this.persistNotices(nextNotices);
  },

  persistNotices(notices) {
    wx.setStorageSync(NOTICE_KEY, notices);
    const unreadNoticeCount = notices.filter((item) => !item.read).length;
    this.setData({ notices, unreadNoticeCount });

    const app = getApp();
    if (app && typeof app.setUnreadNum === 'function') app.setUnreadNum(unreadNoticeCount);
  },

  pushNoticeIfFollowed(model) {
    if (!model || !model.author) return;
    if (!this.data.followedAuthors.includes(model.author)) return;
    const notice = normalizeNotice({ id: Date.now(), modelId: model.id, author: model.author, title: model.title, read: false, createdAt: Date.now() });
    const notices = [notice, ...this.data.notices].slice(0, 100);
    this.persistNotices(notices);
  },

  openPublish() {
    this.setData({ showPublish: true, publishTitle: '', publishDesc: '', publishFormat: 'GLB', publishImage: '' });
  },

  closePublish() {
    this.setData({ showPublish: false });
  },

  onTitleInput(e) { this.setData({ publishTitle: e.detail.value || '' }); },
  onDescInput(e) { this.setData({ publishDesc: e.detail.value || '' }); },
  chooseFormat(e) { this.setData({ publishFormat: e.currentTarget.dataset.value }); },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: ({ tempFiles }) => {
        const file = tempFiles && tempFiles[0];
        if (!file) return;
        this.setData({ publishImage: file.tempFilePath });
      },
    });
  },

  publishModel() {
    const title = String(this.data.publishTitle || '').trim();
    const desc = String(this.data.publishDesc || '').trim();
    if (!title) return wx.showToast({ title: '请输入标题', icon: 'none' });

    const userInfo = wx.getStorageSync('user_info') || {};
    const author = userInfo.name || userInfo.nickName || '用户';
    const model = normalizeModel({
      id: Date.now(),
      title,
      desc: desc || '暂无简介',
      author,
      image: this.data.publishImage || images.figma.cardRibbed,
      format: this.data.publishFormat,
      likes: 0,
      createdAt: Date.now(),
      comments: [],
    });

    const models = [model, ...this.data.models];
    this.persistAndRender(models);
    this.pushNoticeIfFollowed(model);
    this.setData({ showPublish: false });
    wx.showToast({ title: '已发布', icon: 'success' });
  },

  openDetail(e) {
    const id = Number(e.currentTarget.dataset.id);
    const selectedModel = this.data.models.find((item) => item.id === id);
    if (!selectedModel) return;
    this.setData({ selectedModel, selectedAuthorFollowed: this.data.followedAuthors.includes(selectedModel.author), showDetail: true, commentText: '' });
  },

  closeDetail() {
    this.setData({ showDetail: false, selectedModel: null, commentText: '' });
  },

  toggleFollowAuthor() {
    const selectedModel = this.data.selectedModel;
    if (!selectedModel) return;
    const author = selectedModel.author;
    const followed = this.data.followedAuthors.includes(author);
    const followedAuthors = followed ? this.data.followedAuthors.filter((item) => item !== author) : [...this.data.followedAuthors, author];
    this.persistFollowAuthors(followedAuthors);
    this.setData({ selectedAuthorFollowed: !followed });
  },

  likeModel(e) {
    const id = Number(e.currentTarget.dataset.id);
    const models = this.data.models.map((item) => (item.id === id ? { ...item, likes: item.likes + 1 } : item));
    this.persistAndRender(models);
    const selectedModel = this.data.selectedModel && this.data.selectedModel.id === id ? models.find((item) => item.id === id) : this.data.selectedModel;
    this.setData({ selectedModel });
  },

  onCommentInput(e) { this.setData({ commentText: e.detail.value || '' }); },

  publishComment() {
    const selected = this.data.selectedModel;
    if (!selected) return;
    const content = String(this.data.commentText || '').trim();
    if (!content) return wx.showToast({ title: '请输入评论', icon: 'none' });

    const userInfo = wx.getStorageSync('user_info') || {};
    const author = userInfo.name || userInfo.nickName || '用户';
    const now = Date.now();
    const nextComment = { id: now, author, content, createdAt: now, createdAtText: formatTime(now) };
    const models = this.data.models.map((item) => (item.id !== selected.id ? item : { ...item, comments: [nextComment, ...(item.comments || [])] }));
    this.persistAndRender(models);
    this.setData({ selectedModel: models.find((item) => item.id === selected.id), commentText: '' });
  },

  openNoticePanel() { this.setData({ showNoticePanel: true }); },
  closeNoticePanel() { this.setData({ showNoticePanel: false }); },

  markAllNoticesRead() {
    const notices = this.data.notices.map((item) => ({ ...item, read: true }));
    this.persistNotices(notices);
  },

  openNoticeModel(e) {
    const id = Number(e.currentTarget.dataset.id);
    const noticeId = Number(e.currentTarget.dataset.noticeId);
    const notices = this.data.notices.map((item) => (item.id === noticeId ? { ...item, read: true } : item));
    this.persistNotices(notices);
    this.setData({ showNoticePanel: false });

    const selectedModel = this.data.models.find((item) => item.id === id);
    if (!selectedModel) return;
    this.setData({ selectedModel, selectedAuthorFollowed: this.data.followedAuthors.includes(selectedModel.author), showDetail: true, commentText: '' });
  },

  goBackHome() {
    this.setData({ showPublish: false, showDetail: false, selectedModel: null, showNoticePanel: false });
    wx.switchTab({ url: '/pages/home/index' });
  },

  exitToModel() {
    this.setData({ showPublish: false, showDetail: false, selectedModel: null, showNoticePanel: false });
    wx.switchTab({ url: '/pages/model/index' });
  },

  noop() {},
});

