import { deleteGeneratedModel, getGeneratedModels, saveGeneratedModels } from '../../utils/generatedModels';

function formatTime(value) {
  if (!value) return '刚刚';
  const date = new Date(value);
  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

Page({
  data: {
    models: [],
    hasChanges: false,
  },

  onShow() {
    this.loadModels();
  },

  loadModels() {
    const models = getGeneratedModels().map((item) => ({
      ...item,
      createdAtText: formatTime(item.createdAt),
      visibilityText: item.isPublic ? '公开到精选模型' : '仅自己可见',
    }));
    this.setData({ models, hasChanges: false });
  },

  handleBack() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/my/index' }) });
  },

  togglePublic(event) {
    const id = event.currentTarget.dataset.id;
    const checked = Boolean(event.detail.value);
    const models = this.data.models.map((item) => {
      if (String(item.id) !== String(id)) return item;
      return {
        ...item,
        isPublic: checked,
        tag: checked ? '公开' : '隐藏',
        visibilityText: checked ? '公开到精选模型' : '仅自己可见',
      };
    });
    this.setData({ models, hasChanges: true });
  },

  saveChanges() {
    const savedModels = this.data.models.map((item) => ({
      ...item,
      tag: item.isPublic ? '公开' : '隐藏',
    }));
    saveGeneratedModels(savedModels);
    this.setData({
      hasChanges: false,
      models: savedModels.map((item) => ({
        ...item,
        visibilityText: item.isPublic ? '公开到精选模型' : '仅自己可见',
      })),
    });
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  deleteModel(event) {
    const id = event.currentTarget.dataset.id;
    const target = this.data.models.find((item) => String(item.id) === String(id));
    wx.showModal({
      title: '删除模型',
      content: target ? `确认删除「${target.title}」？删除后不会出现在我的模型和精选模型。` : '确认删除这个模型？',
      confirmText: '删除',
      confirmColor: '#ff6b6b',
      success: (res) => {
        if (!res.confirm) return;
        deleteGeneratedModel(id);
        const models = this.data.models.filter((item) => String(item.id) !== String(id));
        this.setData({ models, hasChanges: false });
        wx.showToast({ title: '已删除', icon: 'success' });
      },
    });
  },

  openResult(event) {
    const id = event.currentTarget.dataset.id;
    const model = this.data.models.find((item) => String(item.id) === String(id));
    if (!model || !model.assets) return wx.showToast({ title: '暂无生成资产', icon: 'none' });
    wx.setStorageSync('latestAi3dAssets', model.assets);
    wx.navigateTo({ url: '/pages/result/index' });
  },
  openDetail(event) {
    const id = event.currentTarget.dataset.id;
    const model = this.data.models.find((item) => String(item.id) === String(id));
    if (!model) return wx.showToast({ title: '鏆傛棤妯″瀷璇︽儏', icon: 'none' });
    wx.setStorageSync('maiya3d_model_detail', model);
    wx.navigateTo({ url: '/pages/model-detail/index' });
  },
});
