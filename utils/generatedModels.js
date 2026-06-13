import images from '../config/images';

const GENERATED_MODELS_KEY = 'maiya_generated_models';
const MAX_GENERATED_MODELS = 80;

export const REVIEW_STATUS = {
  HIDDEN: 'hidden',
  PENDING: 'pending',
  PUBLISHED: 'published',
  REJECTED: 'rejected',
};

function resolveStatus(model = {}) {
  if (model.reviewStatus) return model.reviewStatus;
  if (model.status && Object.values(REVIEW_STATUS).includes(model.status)) return model.status;
  if (model.isPublic) return REVIEW_STATUS.PUBLISHED;
  return REVIEW_STATUS.HIDDEN;
}

export function getStatusMeta(status) {
  const metaMap = {
    [REVIEW_STATUS.HIDDEN]: {
      text: '未提交',
      actionText: '申请发布',
      hint: '仅自己可见，申请后等待管理员审核',
    },
    [REVIEW_STATUS.PENDING]: {
      text: '审核中',
      actionText: '撤回申请',
      hint: '管理员审核通过后才会进入精选模型推荐',
    },
    [REVIEW_STATUS.PUBLISHED]: {
      text: '已发布',
      actionText: '隐藏',
      hint: '已通过审核，正在模型页展示',
    },
    [REVIEW_STATUS.REJECTED]: {
      text: '未通过',
      actionText: '重新申请',
      hint: '可调整信息后重新提交审核',
    },
  };
  return metaMap[status] || metaMap[REVIEW_STATUS.HIDDEN];
}

function normalizeGeneratedModel(model = {}) {
  const reviewStatus = resolveStatus(model);
  const statusMeta = getStatusMeta(reviewStatus);
  const isPublished = reviewStatus === REVIEW_STATUS.PUBLISHED;
  return {
    ...model,
    title: model.title || 'AI 生成模型',
    image: model.image || model.previewImagePath || model.previewImageUrl || images.figma.cardRibbed,
    category: model.category || '模型',
    author: model.author || '我',
    likes: Number(model.likes || 0),
    downloads: Number(model.downloads || 0),
    tag: isPublished ? '精选' : statusMeta.text,
    format: model.format || (model.glbUrl || model.glbPath ? 'GLB' : model.objUrl || model.objPath ? 'OBJ' : 'FILE'),
    polygons: model.polygons || 'AI',
    size: model.size || '生成资产',
    description: model.description || '由 MAIYA 3D AI Studio 生成的模型。',
    createdAt: model.createdAt || Date.now(),
    submittedAt: model.submittedAt || null,
    reviewedAt: model.reviewedAt || null,
    publishedAt: model.publishedAt || null,
    reviewReason: model.reviewReason || '',
    reviewStatus,
    status: reviewStatus,
    isGenerated: true,
    isPublic: isPublished,
    featured: isPublished,
    assets: model.assets || {},
  };
}

export function getGeneratedModels() {
  const models = wx.getStorageSync(GENERATED_MODELS_KEY);
  return Array.isArray(models) ? models.map(normalizeGeneratedModel) : [];
}

export function getPublicGeneratedModels() {
  return getGeneratedModels().filter((item) => item.reviewStatus === REVIEW_STATUS.PUBLISHED);
}

export function getPendingGeneratedModels() {
  return getGeneratedModels().filter((item) => item.reviewStatus === REVIEW_STATUS.PENDING);
}

export function addGeneratedModel(model) {
  const createdAt = Date.now();
  const wantsReview = Boolean(model.isPublic || model.submitForReview);
  const nextModel = normalizeGeneratedModel({
    id: `generated-${createdAt}`,
    ...model,
    createdAt,
    submittedAt: wantsReview ? createdAt : null,
    reviewStatus: wantsReview ? REVIEW_STATUS.PENDING : REVIEW_STATUS.HIDDEN,
  });
  const models = [nextModel, ...getGeneratedModels()].slice(0, MAX_GENERATED_MODELS);
  wx.setStorageSync(GENERATED_MODELS_KEY, models);
  return nextModel;
}

export function saveGeneratedModels(models) {
  const safeModels = Array.isArray(models) ? models.map(normalizeGeneratedModel) : [];
  wx.setStorageSync(GENERATED_MODELS_KEY, safeModels.slice(0, MAX_GENERATED_MODELS));
  return getGeneratedModels();
}

export function updateGeneratedModel(id, patch = {}) {
  const nextModels = getGeneratedModels().map((item) => {
    if (String(item.id) !== String(id)) return item;
    return normalizeGeneratedModel({ ...item, ...patch });
  });
  return saveGeneratedModels(nextModels);
}

export function submitGeneratedModelReview(id) {
  return updateGeneratedModel(id, {
    reviewStatus: REVIEW_STATUS.PENDING,
    submittedAt: Date.now(),
    reviewedAt: null,
    publishedAt: null,
    reviewReason: '',
  });
}

export function withdrawGeneratedModelReview(id) {
  return updateGeneratedModel(id, {
    reviewStatus: REVIEW_STATUS.HIDDEN,
    reviewedAt: null,
    publishedAt: null,
  });
}

export function approveGeneratedModel(id) {
  const now = Date.now();
  return updateGeneratedModel(id, {
    reviewStatus: REVIEW_STATUS.PUBLISHED,
    reviewedAt: now,
    publishedAt: now,
    reviewReason: '',
  });
}

export function rejectGeneratedModel(id, reason = '内容或模型质量暂未达到精选标准') {
  return updateGeneratedModel(id, {
    reviewStatus: REVIEW_STATUS.REJECTED,
    reviewedAt: Date.now(),
    publishedAt: null,
    reviewReason: reason,
  });
}

export function deleteGeneratedModel(id) {
  const nextModels = getGeneratedModels().filter((item) => String(item.id) !== String(id));
  return saveGeneratedModels(nextModels);
}
