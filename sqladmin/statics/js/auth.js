// auth.js
const AuthLib = {
  // 設定
  config: {
    loginPath: '/admin/login',
    protectedPaths: ['/admin/'], // 保護されたパスのプレフィックス
    loginRequiredEvent: 'auth:loginRequired',
    authCheckEvent: 'auth:check',
  },

  is_logout_confirmed: false,

  // トークン管理
  token: {
    get: () => localStorage.getItem('idToken'),
    set: (token) => localStorage.setItem('idToken', token),
    remove: () => localStorage.removeItem('idToken'),

    isValid: () => {
      const token = localStorage.getItem('idToken');
      if (!token) return false;

      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.exp * 1000 > Date.now();
      } catch (e) {
        return false;
      }
    }
  },

  // HTMX設定とイベント処理
  setupHtmx: () => {
    // HTMXの設定前イベント（ヘッダー追加）
    htmx.on('htmx:configRequest', (event) => {
      const path = event.detail.path;
      // ログインパスへのリクエストはスキップ
      if (path && path.endsWith(AuthLib.config.loginPath)) {
        AuthLib.is_logout_confirmed = false;
        return;
      }
      if (path && path.endsWith('/logout')) {
        console.log(AuthLib.is_logout_confirmed)
        // confirmフラグをチェック（イベントデータから確認状態を取得）
        if (AuthLib.is_logout_confirmed) {
          return;
        }else if ((!AuthLib.is_logout_confirmed) && (!confirm('ログアウトしてもよろしいですか？'))) {
          AuthLib.is_logout_confirmed = true
          return;
        }
      }

      const token = AuthLib.token.get();
      if (token) {
        event.detail.headers['Authorization'] = `Bearer ${token}`;
      }
    });

    // HTMXのコンテンツロード後イベント
    htmx.on('htmx:afterOnLoad', (event) => {
      const response = event.detail.xhr.response;
      const path = event.detail.requestConfig?.path;

      // ログインパスの場合
      if (path && path.endsWith('/login')) {
        event.preventDefault();
        AuthLib.handleLoginResponse(response);
        return;
      }
      // ログアウトパスの場合
      if (path && path.endsWith('/logout')) {
        event.preventDefault();
        AuthLib.handleLogoutResponse(response);
        return;
      }

      try {
        const data = JSON.parse(response);
        if (data.status === 'success' && data.idToken) {
          AuthLib.token.set(data.idToken);
        }
        // 新しくロードされた要素に対して認証チェックを実行
        AuthLib.checkNewContent(event.detail.elt);
      } catch (e) {
        // JSONでない場合は、新しいコンテンツの認証チェックのみ実行
        AuthLib.checkNewContent(event.detail.elt);
      }
    });

    // HTMXのコンテンツスワップ前イベント
    htmx.on('htmx:beforeSwap', (event) => {
      // 認証が必要なパスかチェック
      const path = event.detail.requestConfig?.path;
      if (AuthLib.isProtectedPath(path) && !AuthLib.token.isValid()) {
        // 認証が必要な場合、スワップをキャンセルしてログインページへ
        event.preventDefault();
        AuthLib.redirectToLogin();
        return;
      }
    });

    // エラー処理
    htmx.on('htmx:responseError', (event) => {
      if (event.detail.xhr.status === 401) {
        event.preventDefault(); // デフォルトのエラー処理を防止
        AuthLib.handleUnauthorized();
      }
    });

    // HTMXのページ遷移イベント
    htmx.on('htmx:beforeTransition', (event) => {
      if (AuthLib.isProtectedPath(event.detail.requestConfig.path)) {
        if (!AuthLib.token.isValid()) {
          event.preventDefault();
          AuthLib.redirectToLogin();
        }
      }
    });
  },

  // 新しくロードされたコンテンツの認証チェック
  checkNewContent: (element) => {
    if (!element) return;

    // data-auth-required属性を持つ要素をチェック
    const authRequired = element.querySelector('[data-auth-required]');
    if (authRequired && !AuthLib.token.isValid()) {
      AuthLib.redirectToLogin();
      return;
    }

    // カスタムイベントの発火
    element.dispatchEvent(new CustomEvent(AuthLib.config.authCheckEvent, {
      bubbles: true,
      detail: { isAuthenticated: AuthLib.token.isValid() }
    }));
  },

  // 保護されたパスかどうかのチェック
  isProtectedPath: (path) => {
    if (!path) return false;
    return AuthLib.config.protectedPaths.some(prefix => path.startsWith(prefix));
  },

  // 未認証時の処理
  handleUnauthorized: () => {
    AuthLib.token.remove();
    AuthLib.redirectToLogin();
    // カスタムイベントの発火
    document.dispatchEvent(new CustomEvent(AuthLib.config.loginRequiredEvent));
  },

  // ログインページへのリダイレクト
  redirectToLogin: () => {
    const currentPath = window.location.pathname;
    const loginUrl = `${AuthLib.config.loginPath}?next=${encodeURIComponent(currentPath)}`;
    window.location.href = loginUrl;
  },

  handleLogoutResponse: (response) => {
    try {
      const data = JSON.parse(response);
      if (data.status === 'success') {
        // トークンの削除
        AuthLib.token.remove();

        // メッセージ表示（もしあれば）
        if (data.html) {
          const logoutMessage = document.getElementById('logout-message');
          if (logoutMessage) {
            logoutMessage.innerHTML = data.html;
          }
        }

        // イベントの発火
        document.dispatchEvent(new CustomEvent('auth:logout', {
          detail: { success: true }
        }));

        // リダイレクト
        if (data.redirect) {
          window.location.href = data.redirect;
        }
      }
    } catch (e) {
      console.error('Failed to parse logout response:', e);
      // エラー時も強制的にログアウト
      AuthLib.token.remove();
      window.location.href = AuthLib.config.loginPath;
    }
  },

  handleLoginResponse: (response) => {
    try {
      const data = JSON.parse(response);
      if (data.status === 'success' && data.idToken) {
        // トークンの保存
        AuthLib.token.set(data.idToken);

        // メッセージ表示（もしあれば）
        if (data.html) {
          const loginMessage = document.getElementById('login-message');
          if (loginMessage) {
            loginMessage.innerHTML = data.html.replace(/&quot;/g, '"');
          }
        }

        // イベントの発火
        document.dispatchEvent(new CustomEvent('auth:login', {
          detail: { success: true }
        }));

        // リダイレクト
        if (data.redirect) {
          // URLパラメータからリダイレクト先を取得
          // const params = new URLSearchParams(window.location.search);
          // const nextUrl = params.get('next') || data.redirect;

          const params = new URLSearchParams(window.location.search);
          const nextUrl = params.get('next') || data.redirect;
          const token = AuthLib.token.get();

          htmx.ajax('GET', nextUrl, {
            headers: {
              'Authorization': `Bearer ${token}`
            },
            target: 'body',
            swap: 'outerHTML'
          });
        }
      } else if (data.status === 'error') {
        // エラーメッセージの表示
        const loginMessage = document.getElementById('login-message');
        if (loginMessage && data.html) {
          loginMessage.innerHTML = data.html;
        }

        // エラーイベントの発火
        document.dispatchEvent(new CustomEvent('auth:loginError', {
          detail: { message: data.message || 'Login failed' }
        }));
      }
    } catch (e) {
      console.error('Failed to parse login response:', e);
    }
  },

  // 初期化
  init: (config = {}) => {
    // 設定のマージ
    Object.assign(AuthLib.config, config);

    // HTMXのセットアップ
    AuthLib.setupHtmx();

    // 初期ページロード時のチェック
    document.addEventListener('DOMContentLoaded', () => {
      AuthLib.checkNewContent(document.body);
    });
  }
};

// グローバルに公開
window.AuthLib = AuthLib;