const electron = require('electron');
console.log('electron keys:', Object.keys(electron));
console.log('electron.app:', typeof electron.app);
console.log('electron.app value:', electron.app);
if (electron.app) {
  console.log('getAppPath:', electron.app.getAppPath());
}
