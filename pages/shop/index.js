import images from '~/config/images';

const categories = ['全部', '潮玩', '摆件', '模型'];
const filterCategories = ['全部', '潮玩', '摆件', '模型', '打印'];
const sortLabels = ['推荐', '销量', '价格'];

const products = [
  {
    id: 1,
    name: '头戴耳机打印成品',
    image: images.figma.headphone,
    category: '潮玩',
    price: 35,
    sold: 216,
    tag: '热门',
    desc: '桌面展示模型，适合摆放和收藏。',
  },
  {
    id: 2,
    name: '折纸飞鸟桌面摆件',
    image: images.figma.cardVase,
    category: '摆件',
    price: 39,
    sold: 602,
    tag: '热门',
    desc: '适合送礼和桌面展示的装饰模型。',
  },
  {
    id: 3,
    name: '渐变花瓶数字模型',
    image: images.figma.cardRibbed,
    category: '模型',
    price: 68,
    sold: 139,
    tag: '热门',
    desc: '适合 3D 打印和数字展示。',
  },
];

const initialComments = [
  { id: 1, author: '官方', avatar: images.figma.avatar, date: '2026.04.23', content: '做工细节不错。' },
];

Page({
  data: {
    images: { logo: images.figma.logo, avatar: images.figma.avatar },
    searchText: '',
    categories,
    filterCategories,
    activeCategory: '全部',
    products,
    visibleProducts: products,
    selectedProduct: null,
    showDetail: false,
    showFilter: false,
    cartCount: 0,
    cartTotal: 0,
    hasCart: false,
    cartTitle: '购物车',
    cartSummary: '选择你的商品',
    sortMode: '推荐',
    likedIds: [],
    favoritedIds: [],
    selectedLiked: false,
    selectedFavorited: false,
    comments: initialComments,
    commentText: '',
    selectedCategoryFilter: '全部',
  },

  onSearchInput(e) {
    this.setData({ searchText: e.detail.value || '' }, () => this.applyFilters());
  },

  chooseCategory(e) {
    const value = e.currentTarget.dataset.value;
    this.setData({ activeCategory: value, selectedCategoryFilter: value }, () => this.applyFilters());
  },

  openFilterSheet() {
    this.setData({ showFilter: true });
  },

  closeFilterSheet() {
    this.setData({ showFilter: false });
  },

  chooseCategoryFilter(e) {
    const value = e.currentTarget.dataset.value;
    this.setData({ selectedCategoryFilter: value, activeCategory: value, showFilter: false }, () => this.applyFilters());
  },

  switchSort() {
    const currentIndex = sortLabels.indexOf(this.data.sortMode);
    const nextSortMode = sortLabels[(currentIndex + 1) % sortLabels.length];
    this.setData({ sortMode: nextSortMode }, () => this.applyFilters());
  },

  applyFilters() {
    const { searchText, sortMode, activeCategory } = this.data;
    const keyword = String(searchText || '').trim().toLowerCase();
    let visibleProducts = products.filter((item) => {
      const text = `${item.name} ${item.category} ${item.desc}`.toLowerCase();
      const matchKeyword = !keyword || text.includes(keyword);
      const matchCategory = activeCategory === '全部' || item.category === activeCategory;
      return matchKeyword && matchCategory;
    });

    if (sortMode === '销量') visibleProducts = visibleProducts.slice().sort((a, b) => b.sold - a.sold);
    if (sortMode === '价格') visibleProducts = visibleProducts.slice().sort((a, b) => a.price - b.price);
    this.setData({ visibleProducts });
  },

  openProduct(e) {
    const id = Number(e.currentTarget.dataset.id);
    const selectedProduct = products.find((item) => item.id === id);
    if (!selectedProduct) return;
    this.setData({
      selectedProduct,
      selectedLiked: this.data.likedIds.includes(id),
      selectedFavorited: this.data.favoritedIds.includes(id),
      commentText: '',
      showDetail: true,
    });
  },

  closeDetail() {
    this.setData({ showDetail: false });
  },

  jumpTag(e) {
    const value = e.currentTarget.dataset.value || '全部';
    this.setData({ activeCategory: value, selectedCategoryFilter: value, showDetail: false }, () => this.applyFilters());
  },

  addToCart(e) {
    const id = Number(e.currentTarget.dataset.id || (this.data.selectedProduct && this.data.selectedProduct.id));
    const product = products.find((item) => item.id === id);
    if (!product) return;
    const cartCount = this.data.cartCount + 1;
    const cartTotal = this.data.cartTotal + product.price;
    this.setData({
      cartCount,
      cartTotal,
      hasCart: cartCount > 0,
      cartTitle: `购物车 ${cartCount} 件`,
      cartSummary: `合计 ¥${cartTotal}`,
    });
    wx.showToast({ title: '已加入购物车', icon: 'success' });
  },

  toggleLike() {
    const product = this.data.selectedProduct;
    if (!product) return;
    const liked = this.data.likedIds.includes(product.id);
    this.setData({
      likedIds: liked ? this.data.likedIds.filter((id) => id !== product.id) : [...this.data.likedIds, product.id],
      selectedLiked: !liked,
    });
  },

  toggleFavorite() {
    const product = this.data.selectedProduct;
    if (!product) return;
    const favorited = this.data.favoritedIds.includes(product.id);
    this.setData({
      favoritedIds: favorited ? this.data.favoritedIds.filter((id) => id !== product.id) : [...this.data.favoritedIds, product.id],
      selectedFavorited: !favorited,
    });
  },

  onCommentInput(e) {
    this.setData({ commentText: e.detail.value || '' });
  },

  publishComment() {
    const content = String(this.data.commentText || '').trim();
    if (!content) return wx.showToast({ title: '请输入评论', icon: 'none' });
    const userInfo = wx.getStorageSync('user_info') || {};
    const comment = {
      id: Date.now(),
      author: userInfo.name || userInfo.nickName || '用户',
      avatar: userInfo.image || userInfo.avatarUrl || images.figma.avatar,
      date: '刚刚',
      content,
    };
    this.setData({ comments: [comment, ...this.data.comments], commentText: '' });
  },

  buyNow() {
    if (this.data.selectedProduct) wx.showToast({ title: '购买成功', icon: 'success' });
    this.setData({ showDetail: false });
  },

  checkout() {
    if (!this.data.cartCount) return wx.showToast({ title: '购物车为空', icon: 'none' });
    this.setData({ cartCount: 0, cartTotal: 0, hasCart: false, cartTitle: '购物车', cartSummary: '选择你的商品' });
    wx.showToast({ title: '结算成功', icon: 'success' });
  },

  noop() {},
});
