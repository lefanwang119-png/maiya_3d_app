import { REVIEW_STATUS } from './generatedModels';

export const DEMO_MODEL_REVIEW_KEY = 'maiya_demo_my_model_review_status';

export function getDemoModelReviewMap() {
  const reviewMap = wx.getStorageSync(DEMO_MODEL_REVIEW_KEY);
  return reviewMap && typeof reviewMap === 'object' ? reviewMap : {};
}

function normalizeReviewItem(id, value) {
  if (typeof value === 'boolean') {
    return {
      id,
      reviewStatus: value ? REVIEW_STATUS.PUBLISHED : REVIEW_STATUS.HIDDEN,
      submittedAt: null,
      reviewedAt: null,
      reviewReason: '',
    };
  }
  if (value && typeof value === 'object') {
    return {
      id,
      reviewStatus: value.reviewStatus || REVIEW_STATUS.HIDDEN,
      submittedAt: value.submittedAt || null,
      reviewedAt: value.reviewedAt || null,
      reviewReason: value.reviewReason || '',
    };
  }
  return {
    id,
    reviewStatus: REVIEW_STATUS.PUBLISHED,
    submittedAt: null,
    reviewedAt: null,
    reviewReason: '',
  };
}

export function getDemoModelReview(id) {
  const reviewMap = getDemoModelReviewMap();
  return normalizeReviewItem(id, reviewMap[id]);
}

export function setDemoModelReviewStatus(id, reviewStatus, patch = {}) {
  const reviewMap = getDemoModelReviewMap();
  reviewMap[id] = normalizeReviewItem(id, {
    ...getDemoModelReview(id),
    ...patch,
    reviewStatus,
  });
  wx.setStorageSync(DEMO_MODEL_REVIEW_KEY, reviewMap);
  return reviewMap[id];
}

export function submitDemoModelReview(id) {
  return setDemoModelReviewStatus(id, REVIEW_STATUS.PENDING, {
    submittedAt: Date.now(),
    reviewedAt: null,
    reviewReason: '',
  });
}

export function withdrawDemoModelReview(id) {
  return setDemoModelReviewStatus(id, REVIEW_STATUS.HIDDEN, {
    reviewedAt: null,
  });
}

export function approveDemoModelReview(id) {
  return setDemoModelReviewStatus(id, REVIEW_STATUS.PUBLISHED, {
    reviewedAt: Date.now(),
    reviewReason: '',
  });
}

export function rejectDemoModelReview(id, reason = '内容或模型质量暂未达到精选标准') {
  return setDemoModelReviewStatus(id, REVIEW_STATUS.REJECTED, {
    reviewedAt: Date.now(),
    reviewReason: reason,
  });
}

export function filterVisibleDemoModels(models) {
  return models.filter((item) => {
    if (!item.myModelId) return true;
    return getDemoModelReview(item.myModelId).reviewStatus === REVIEW_STATUS.PUBLISHED;
  });
}
