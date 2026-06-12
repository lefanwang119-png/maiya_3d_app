import images from '../config/images';

const GENERATED_MODELS_KEY = 'maiya_generated_models';

export function getGeneratedModels() {
  return wx.getStorageSync(GENERATED_MODELS_KEY) || [];
}

export function getPublicGeneratedModels() {
  return getGeneratedModels().filter((item) => item.isPublic);
}

export function addGeneratedModel(model) {
  const createdAt = Date.now();
  const nextModel = {
    id: `generated-${createdAt}`,
    title: model.title || 'AI 生成模型',
    image: model.image || model.previewImagePath || model.previewImageUrl || images.figma.cardRibbed,
    category: model.category || '模型',
    author: model.author || '我',
    likes: 0,
    downloads: 0,
    tag: model.isPublic ? '公开' : '私有',
    format: model.glbUrl || model.glbPath ? 'GLB' : model.objUrl || model.objPath ? 'OBJ' : 'FILE',
    polygons: model.polygons || 'AI',
    size: model.size || '生成资产',
    description: model.description || '由 MAIYA 3D AI Studio 生成的模型。',
    createdAt,
    isGenerated: true,
    isPublic: Boolean(model.isPublic),
    assets: model.assets || {},
  };
  const models = [nextModel, ...getGeneratedModels()].slice(0, 80);
  wx.setStorageSync(GENERATED_MODELS_KEY, models);
  return nextModel;
}


export function saveGeneratedModels(models) {
  const safeModels = Array.isArray(models) ? models : [];
  wx.setStorageSync(GENERATED_MODELS_KEY, safeModels.slice(0, 80));
  return getGeneratedModels();
}

export function updateGeneratedModel(id, patch = {}) {
  const models = getGeneratedModels();
  const nextModels = models.map((item) => {
    if (String(item.id) !== String(id)) return item;
    const nextItem = {
      ...item,
      ...patch,
      isPublic: typeof patch.isPublic === 'boolean' ? patch.isPublic : item.isPublic,
    };
    nextItem.tag = nextItem.isPublic ? '公开' : '隐藏';
    return nextItem;
  });
  return saveGeneratedModels(nextModels);
}

export function deleteGeneratedModel(id) {
  const nextModels = getGeneratedModels().filter((item) => String(item.id) !== String(id));
  return saveGeneratedModels(nextModels);
}