import images from '~/config/images';

const FOLLOW_KEY = 'community_follow_authors_v1';
const HOME_COMMENTS = [
  {
    id: 1,
    author: 'Admin',
    avatar: images.figma.avatar,
    date: '2026.04.23',
    content: '模型细节很完整，适合打印与展示。',
  },
];

const categories = [
  { title: '精品', subTitle: '潮玩', type: 'feature', icon: 'M' },
  { title: '周边', subTitle: '好物', type: 'goods', icon: 'A' },
  { title: '摆件', subTitle: '桌面', type: 'feature', icon: 'I' },
  { title: '模型', subTitle: '数字', type: 'goods', icon: 'Y' },
];

const works = [
  {
    id: 1,
    image: images.figma.cardVase,
    title: '折纸飞鸟桌面摆件',
    author: '官方',
    category: '摆件',
    likes: 33,
    downloads: 99,
  },
  {
    id: 2,
    image: images.figma.cardRibbed,
    title: '渐变花瓶数字模型',
    author: '官方',
    category: '模型',
    likes: 33,
    downloads: 99,
  },
  {
    id: 3,
    image: images.figma.cardVase,
    title: '折纸飞鸟桌面摆件',
    author: '官方',
    category: '潮玩',
    likes: 33,
    downloads: 99,
  },
  {
    id: 4,
    image: images.figma.cardRibbed,
    title: '渐变花瓶数字模型',
    author: '官方',
    category: '模型',
    likes: 33,
    downloads: 99,
  },
  {
    id: 'bouquet-home',
    image: '/static/featured/bouquet-cover.jpg',
    previewVideo: '/static/featured/bouquet-preview-h264.mp4',
    previewVideoUrl: '',
    title: '多彩花束',
    author: '官方',
    category: '摆件',
    likes: 33,
    downloads: 99,
    tag: '新作',
  },
  {
    id: 'silver-vase-home-h264',
    image: '/static/featured/silver-vase-cover.png',
    previewVideo: '/static/featured/silver-vase-preview-h264.mp4',
    previewVideoUrl: '',
    title: '银色花瓶数字模型',
    author: '官方',
    category: '模型',
    likes: 33,
    downloads: 99,
    tag: '新作',
    format: 'MP4',
    description: '银色质感花瓶实拍预览，适合展示打印成品质感。',
  },
];

function buildWaterfallColumns(list) {
  const columns = [[], []];
  list.forEach((item, index) => {
    const columnIndex = index % 2;
    const cardIndex = columns[columnIndex].length;
    columns[columnIndex].push({
      ...item,
      waterfallTall: (cardIndex + columnIndex) % 2 === 1,
    });
  });
  return columns;
}

Page({
  data: {
    images: {
      logo: images.figma.logo,
      avatar: images.figma.avatar,
    },
    categories,
    works,
    visibleWorks: works,
    workColumns: buildWaterfallColumns(works),
    searchText: '',
    followedAuthors: [],
    selectedWork: null,
    selectedLiked: false,
    selectedFollowed: false,
    likedWorkIds: [],
    showDetail: false,
    homeComments: HOME_COMMENTS,
    homeCommentText: '',
  },

  onShow() {
    this.refreshFollowedAuthors();
  },

  onSearchInput(event) {
    this.setData({ searchText: event.detail.value || '' }, () => this.applyFilters());
  },

  applyFilters() {
    const keyword = String(this.data.searchText || '').trim().toLowerCase();
    const visibleWorks = works.filter((item) => {
      const text = `${item.title} ${item.author} ${item.category || ''}`.toLowerCase();
      return !keyword || text.includes(keyword);
    });
    this.setData({
      visibleWorks,
      workColumns: buildWaterfallColumns(visibleWorks),
    });
  },

  refreshFollowedAuthors() {
    const followedAuthors = wx.getStorageSync(FOLLOW_KEY);
    this.setData({ followedAuthors: Array.isArray(followedAuthors) ? followedAuthors : [] });
  },

  openCategory(event) {
    const { type } = event.currentTarget.dataset;
    wx.switchTab({
      url: type === 'goods' ? '/pages/shop/index' : '/pages/model/index',
    });
  },

  openWork(event) {
    const id = event.detail && event.detail.id;
    const selectedWork = this.data.visibleWorks.find((item) => String(item.id) === String(id));
    if (!selectedWork) return;
    this.setData({
      selectedWork,
      selectedLiked: this.data.likedWorkIds.includes(selectedWork.id),
      selectedFollowed: this.data.followedAuthors.includes(selectedWork.author),
      homeComments: HOME_COMMENTS,
      homeCommentText: '',
      showDetail: true,
    });
  },

  closeDetail() {
    this.setData({ showDetail: false });
  },

  toggleSelectedLike() {
    const selectedWork = this.data.selectedWork;
    if (!selectedWork) return;
    const id = selectedWork.id;
    const liked = this.data.likedWorkIds.includes(id);
    const likedWorkIds = liked
      ? this.data.likedWorkIds.filter((item) => item !== id)
      : [...this.data.likedWorkIds, id];
    const nextWork = {
      ...selectedWork,
      likes: Math.max(0, (selectedWork.likes || 0) + (liked ? -1 : 1)),
    };
    const nextWorks = works.map((item) => (String(item.id) === String(id) ? nextWork : item));
    const visibleWorks = this.data.visibleWorks.map((item) => (String(item.id) === String(id) ? nextWork : item));
    works.splice(0, works.length, ...nextWorks);
    this.setData({
      works: nextWorks,
      visibleWorks,
      workColumns: buildWaterfallColumns(visibleWorks),
      likedWorkIds,
      selectedLiked: !liked,
      selectedWork: nextWork,
    });
  },

  toggleSelectedFollow() {
    const author = this.data.selectedWork && this.data.selectedWork.author;
    if (!author) return;
    const followedAuthors = this.data.followedAuthors.includes(author)
      ? this.data.followedAuthors.filter((item) => item !== author)
      : [...this.data.followedAuthors, author];
    wx.setStorageSync(FOLLOW_KEY, followedAuthors);
    this.setData({
      followedAuthors,
      selectedFollowed: followedAuthors.includes(author),
    });
  },

  onHomeCommentInput(event) {
    this.setData({ homeCommentText: event.detail.value || '' });
  },

  publishHomeComment() {
    const content = String(this.data.homeCommentText || '').trim();
    if (!content) {
      wx.showToast({ title: '先写点评论内容', icon: 'none' });
      return;
    }
    const userInfo = wx.getStorageSync('user_info') || {};
    this.setData({
      homeComments: [{
        id: Date.now(),
        author: userInfo.name || userInfo.nickName || '我',
        avatar: userInfo.image || userInfo.avatarUrl || images.figma.avatar,
        date: '刚刚',
        content,
      }, ...this.data.homeComments],
      homeCommentText: '',
    });
  },

  downloadSelectedModel() {
    const selectedWork = this.data.selectedWork;
    if (!selectedWork) return;
    wx.showToast({ title: '已加入下载队列', icon: 'success' });
  },

  buySelectedProduct() {
    wx.switchTab({ url: '/pages/shop/index' });
  },

  openCommunity() {
    wx.removeStorageSync('community_focus_author');
    wx.navigateTo({ url: '/pages/community/index' });
  },

  openFollowedAuthor(event) {
    const author = event.currentTarget.dataset.author;
    if (author) wx.setStorageSync('community_focus_author', author);
    wx.navigateTo({ url: '/pages/community/index' });
  },
});
