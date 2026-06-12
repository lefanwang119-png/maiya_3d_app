const FIGMA_FILES = [
  'logo.png',
  'avatar.png',
  'card-vase.png',
  'card-ribbed.png',
  'headphone.png',
  'category-feature.png',
  'category-goods.png',
  'vip-banner.png',
];

const CLOUD_FOLDER = 'figma';

async function uploadSingle(localPath, cloudPath) {
  try {
    const res = await wx.cloud.uploadFile({
      cloudPath,
      filePath: localPath,
    });
    return { success: true, fileID: res.fileID, cloudPath };
  } catch (err) {
    return { success: false, cloudPath, error: err.errMsg || err.message };
  }
}

export async function uploadFigmaImages() {
  if (!wx.cloud) {
    console.error('请先开通云开发');
    return;
  }

  const results = [];
  for (const fileName of FIGMA_FILES) {
    const localPath = `/static/figma/${fileName}`;
    const cloudPath = `${CLOUD_FOLDER}/${fileName}`;
    const result = await uploadSingle(localPath, cloudPath);
    results.push(result);
  }

  const successCount = results.filter((r) => r.success).length;
  console.log(`上传完成: ${successCount}/${results.length}`);
  results.forEach((r) => {
    if (r.success) {
      console.log(`✅ ${r.cloudPath} → ${r.fileID}`);
    } else {
      console.error(`❌ ${r.cloudPath} → ${r.error}`);
    }
  });

  return results;
}

export default uploadFigmaImages;