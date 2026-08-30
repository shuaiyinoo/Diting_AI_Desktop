import { app as electronApp } from 'electron';
import { ElectronEgg } from 'ee-core';
import { Lifecycle } from './preload/lifecycle';
import { preload } from './preload';

/**
 * 关闭 WebRTC 的 mDNS 候选隐藏
 *
 * Chromium 默认把本机 IP 伪装成 xxx.local（mDNS），以保护隐私。
 * 但内网场景下，若两端都只有 mDNS 候选，彼此解析不了对方的 .local 域名，
 * 就会「SDP 交换正常、画面始终不出来」—— 这是内网 WebRTC 连不上的头号原因。
 *
 * 关掉后本机会提供真实 IP 的 host 候选，内网可直连。
 * 另需在后端 common-stomp.yml 的 coturn.stun-urls 配置 STUN，
 * 让另一端也能拿到真实地址（浏览器端不受本开关控制）。
 *
 * ⚠️ 必须在 app.run() 之前调用，否则不生效。
 */
electronApp.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns');

// new app
const app = new ElectronEgg();

// register lifecycle
const life = new Lifecycle();
app.register("ready", life.ready);
app.register("electron-app-ready", life.electronAppReady);
app.register("window-ready", life.windowReady);
app.register("before-close", life.beforeClose);

// register preload
app.register("preload", preload);

// run
app.run();
