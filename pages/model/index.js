import images from '~/config/images';
import { getPublicGeneratedModels } from '~/utils/generatedModels';

const filters = ['全部', '潮玩', '摆件', '模型'];

const bannerMap = {
  全部: {
    title: 'MAIYA MODEL',
    subTitle: '精选模型推荐',
    image: images.figma.windmill,
  },
  潮玩: {
    title: 'TOY STYLE',
    subTitle: '潮玩角色专区',
    image: images.figma.headphone,
  },
  摆件: {
    title: 'DESK ART',
    subTitle: '桌面摆件设计',
    image: images.figma.cardVase,
  },
  模型: {
    title: '3D MODEL',
    subTitle: '数字模型集合',
    image: images.figma.cardRibbed,
  },
};

const models = [
  {
    id: 1,
    title: '折纸飞鸟桌面摆件',
    image: images.figma.cardVase,
    category: '摆件',
    author: 'Admin',
    likes: 33,
    downloads: 99,
    tag: '精选',
    format: 'GLB',
    polygons: '12.8k',
    size: '8.4MB',
    description: '细节完整，适合展示和 3D 打印。',
  },
  {
    id: 2,
    title: '渐变花瓶数字模型',
    image: images.figma.cardRibbed,
    category: '模型',
    author: 'Admin',
    likes: 33,
    downloads: 99,
    tag: '精选',
    format: 'OBJ',
    polygons: '6.2k',
    size: '4.1MB',
    description: '轻量资源，适合移动端预览与二次创作。',
  },
  {
    id: 3,
    title: '头戴耳机打印成品',
    image: images.figma.headphone,
    category: '潮玩',
    author: 'Admin',
    likes: 33,
    downloads: 99,
    tag: '精选',
    format: 'GLB',
    polygons: '18.5k',
    size: '11.2MB',
    description: '可用于潮玩商品展示和 3D 打印预览。',
  },
  {
    id: 4,
    title: '头戴耳机展示模型',
    image: images.figma.headphone,
    category: '潮玩',
    author: 'Admin',
    likes: 33,
    downloads: 99,
    tag: '精选',
    format: 'GLB',
    polygons: '9.7k',
    size: '6.9MB',
    description: '适合场景布置、AIGC 参考和作品展示。',
  },
];

const initialComments = [
  {
    id: 1,
    author: 'Admin',
    avatar: images.figma.avatar,
    date: '2026.04.23',
    content: '模型细节很完整，适合打印与展示。',
  },
];

Page({
  data: {
    images: {
      logo: images.figma.logo,
      avatar: images.figma.avatar,
    },
    banner: bannerMap.全部,
    searchText: '',
    filters,
    activeFilter: '全部',
    models,
    visibleModels: models,
    selectedModel: null,
    selectedFavorited: false,
    favoritedIds: [],
    likedIds: [],
    selectedLiked: false,
    comments: initialComments,
    commentText: '',
    selectedBrand: 'Bambu Lab',
    selectedFileType: 'X1 Carbon',
    showDetail: false,
    showFilter: false,
    printerBrands: ['Bambu Lab', 'ANKER'],
    fileTypes: ['X1 Carbon', 'P1P', 'P1S', 'A1', 'A1 mini'],
  },

  onShow() {
    wx.removeStorageSync('pending_open_model_id');
    this.refreshPublicModels();
  },

  refreshPublicModels(done) {
    const nextModels = [...getPublicGeneratedModels(), ...models];
    this.setData({ models: nextModels }, () => {
      this.applyFilters();
      if (typeof done === 'function') done();
    });
  },

  openPendingModel() {
    const pendingId = wx.getStorageSync('pending_open_model_id');
    if (!pendingId) return;
    wx.removeStorageSync('pending_open_model_id');
    const selectedModel = this.data.models.find((item) => String(item.id) === String(pendingId));
    if (!selectedModel) return;
    this.setData({
      selectedModel,
      selectedFavorited: this.data.favoritedIds.includes(selectedModel.id),
      selectedLiked: this.data.likedIds.includes(selectedModel.id),
      commentText: '',
      showDetail: true,
    });
  },

  onSearchInput(event) {
    this.setData({ searchText: event.detail.value || '' }, () => this.applyFilters());
  },

  chooseFilter(event) {
    const activeFilter = event.currentTarget.dataset.value;
    this.setData({
      activeFilter,
      banner: bannerMap[activeFilter] || bannerMap.全部,
    }, () => this.applyFilters());
  },

  chooseBrand(event) {
    this.setData({ selectedBrand: event.currentTarget.dataset.value });
  },

  chooseFileType(event) {
    this.setData({ selectedFileType: event.currentTarget.dataset.value });
  },

  applyFilters() {
    const { activeFilter } = this.data;
    const keyword = String(this.data.searchText || '').trim().toLowerCase();
    const visibleModels = this.data.models.filter((item) => {
      const searchableText = [
        item.title,
        item.author,
        item.category,
        item.tag,
        item.format,
        item.polygons,
        item.size,
        item.description,
      ].filter(Boolean).join(' ').toLowerCase();
      const matchKeyword = !keyword || searchableText.includes(keyword);
      const matchFilter = activeFilter === '全部' || item.category === activeFilter;
      return matchKeyword && matchFilter;
    });
    this.setData({ visibleModels });
  },

  openFilterSheet() {
    this.setData({ showFilter: true });
  },

  closeFilterSheet() {
    this.setData({ showFilter: false });
  },

  openModel(event) {
    const rawId = event.currentTarget.dataset.id;
    const selectedModel = this.data.models.find((item) => String(item.id) === String(rawId));
    if (!selectedModel) return;
    this.setData({
      selectedModel,
      selectedFavorited: this.data.favoritedIds.includes(selectedModel.id),
      selectedLiked: this.data.likedIds.includes(selectedModel.id),
      commentText: '',
      showDetail: true,
    });
  },

  closeDetail() {
    this.setData({ showDetail: false });
  },

  toggleFavorite(event) {
    const id = event.currentTarget.dataset.id || (this.data.selectedModel && this.data.selectedModel.id);
    if (!id) return;
    const favoritedIds = this.data.favoritedIds.includes(id)
      ? this.data.favoritedIds.filter((item) => item !== id)
      : [...this.data.favoritedIds, id];
    this.setData({
      favoritedIds,
      selectedFavorited: this.data.selectedModel ? favoritedIds.includes(this.data.selectedModel.id) : false,
    });
  },

  toggleLike() {
    const selectedModel = this.data.selectedModel;
    if (!selectedModel) return;
    const id = selectedModel.id;
    const liked = this.data.likedIds.includes(id);
    const likedIds = liked ? this.data.likedIds.filter((item) => item !== id) : [...this.data.likedIds, id];
    const nextModel = {
      ...selectedModel,
      likes: Math.max(0, selectedModel.likes + (liked ? -1 : 1)),
    };
    const nextModels = this.data.models.map((item) => (item.id === id ? nextModel : item));
    this.setData({
      likedIds,
      selectedLiked: !liked,
      selectedModel: nextModel,
      models: nextModels,
      visibleModels: this.data.visibleModels.map((item) => (item.id === id ? nextModel : item)),
    });
  },

  onCommentInput(event) {
    this.setData({ commentText: event.detail.value || '' });
  },

  publishComment() {
    const content = String(this.data.commentText || '').trim();
    if (!content) {
      wx.showToast({ title: '先写点评论内容', icon: 'none' });
      return;
    }
    const userInfo = wx.getStorageSync('user_info') || {};
    const comment = {
      id: Date.now(),
      author: userInfo.name || userInfo.nickName || '我',
      avatar: userInfo.image || userInfo.avatarUrl || images.figma.avatar,
      date: '刚刚',
      content,
    };
    this.setData({
      comments: [comment, ...this.data.comments],
      commentText: '',
    });
    wx.showToast({ title: '评论已发布', icon: 'success' });
  },

  noop() {},

  downloadModel() {
    const selectedModel = this.data.selectedModel;
    if (!selectedModel) return;
    if (selectedModel.assets) {
      wx.setStorageSync('latestAi3dAssets', selectedModel.assets);
      wx.navigateTo({ url: '/pages/result/index' });
      return;
    }
    const nextModel = {
      ...selectedModel,
      downloads: selectedModel.downloads + 1,
    };
    this.setData({
      selectedModel: nextModel,
      models: this.data.models.map((item) => (item.id === nextModel.id ? nextModel : item)),
      visibleModels: this.data.visibleModels.map((item) => (item.id === nextModel.id ? nextModel : item)),
    });
    wx.showActionSheet({
      itemList: [`下载 ${selectedModel.format}`, '复制模型信息'],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.showToast({ title: '已加入下载队列', icon: 'success' });
        } else {
          wx.setClipboardData({
            data: `${selectedModel.title} / ${selectedModel.format} / ${selectedModel.size}`,
          });
        }
      },
    });
  },

  createSimilar() {
    wx.showActionSheet({
      itemList: ['用 AI 生成同款', '去商城购买成品'],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.navigateTo({
            url: '/pages/ai/index',
            animationType: 'fade',
            animationDuration: 240,
          });
          return;
        }
        wx.switchTab({ url: '/pages/shop/index' });
      },
    });
  },
});
