/**
 * macOS 公证（Notarization）钩子脚本
 *
 * electron-builder 在完成代码签名后会调用此 afterSign 钩子。
 * 脚本使用 @electron/notarize 将应用提交到 Apple notarytool 进行公证。
 *
 * 触发条件：以下环境变量必须全部存在，否则跳过公证（适用于本地未签名构建）：
 *   - APPLE_ID
 *   - APPLE_APP_SPECIFIC_PASSWORD
 *   - APPLE_TEAM_ID
 */

const { notarize } = require('@electron/notarize');
const path = require('path');
const fs = require('fs');

/**
 * 查找应用 .app 包路径
 * electron-builder 打包后的产物在 out/<target-dir>/<ProductName>.app
 * @param {import('electron-builder').AfterPackContext} context
 */
function resolveAppPath(context) {
  const appOutDir = context.appOutDir;
  const appName = context.packager.appInfo.productName;
  return path.join(appOutDir, `${appName}.app`);
}

exports.default = async function (context) {
  // 仅 macOS 需要公证
  if (context.electronPlatformName !== 'darwin') {
    return;
  }

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env;

  // 未配置 Apple 公证凭证时跳过（本地构建等场景）
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    console.log('⚠️  未配置 APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID，跳过公证');
    return;
  }

  const appPath = resolveAppPath(context);

  if (!fs.existsSync(appPath)) {
    console.warn(`⚠️  未找到应用包: ${appPath}，跳过公证`);
    return;
  }

  console.log(`🔒 开始公证: ${appPath}`);

  await notarize({
    tool: 'notarytool',
    appPath,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID,
  });

  console.log('✅ 公证完成');
};
