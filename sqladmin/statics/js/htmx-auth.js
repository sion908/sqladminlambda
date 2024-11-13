class HtmxAuthManager {
  constructor() {
    this.setupHtmxAuth();
  }

  setupHtmxAuth() {
    // リクエストにトークンを追加
    htmx.on('htmx:configRequest', (evt) => {
      const token = sessionStorage.getItem('idToken');
      if (token) {
        evt.detail.headers['Authorization'] = `Bearer ${token}`;
      }
    });

    // 認証エラーのハンドリング
    htmx.on('htmx:responseError', (evt) => {
      if (evt.detail.xhr.status === 401) {
        window.location.href = '/login';
      }
    });
  }
}

// 自動初期化
document.addEventListener('DOMContentLoaded', () => {
  new HtmxAuthManager();
});
