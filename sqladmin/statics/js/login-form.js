class LoginFormManager {
  constructor(formId, config, isLocal = false) {
    this.form = document.getElementById(formId);
    this.alert = document.getElementById('login-alert');
    this.spinner = document.getElementById('login-spinner');
    this.isLocal = isLocal;
    
    // ローカル環境用の設定
    if (this.isLocal) {
      this.motoConfig = {
        baseUrl: 'http://localhost:4000',
        region: config.region,
        userPoolId: config.userPoolId,
        clientId: config.clientId
      };
    }
    
    this.auth = new CognitoAuthManager(config);
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleSubmit();
    });
  }

  showLoading() {
    this.spinner.classList.remove('d-none');
    this.alert.classList.add('d-none');
  }

  hideLoading() {
    this.spinner.classList.add('d-none');
  }

  showError(message) {
    this.alert.textContent = message;
    this.alert.classList.remove('d-none');
  }

  getMotoHeaders() {
    return {
      'Authorization': 'AWS4-HMAC-SHA256 Credential=mock_access_key/20220524/us-east-1/cognito-idp/aws4_request, SignedHeaders=content-length;content-type;host;x-amz-date, Signature=asdf',
      'Content-Type': 'application/json',
    };
  }

  async signInWithMoto(username, password) {
    const response = await fetch(`${this.motoConfig.baseUrl}/auth/login`, {
      method: 'POST',
      headers: this.getMotoHeaders(),
      body: JSON.stringify({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: this.motoConfig.clientId,
        AuthParameters: {
          USERNAME: username,
          PASSWORD: password
        }
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Authentication failed');
    }

    const authResult = await response.json();
    return {
      idToken: authResult.AuthenticationResult.IdToken,
      accessToken: authResult.AuthenticationResult.AccessToken,
      refreshToken: authResult.AuthenticationResult.RefreshToken
    };
  }

  async handleSubmit() {
    this.showLoading();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
      // isLocalフラグに基づいてサインイン方法を切り替え
      const tokens = this.isLocal 
        ? await this.signInWithMoto(username, password)
        : await this.auth.signIn(username, password);

      // 認証成功後、HTMXを使用してページを更新
      htmx.ajax('GET', '/admin', {
        headers: {
          'Authorization': `Bearer ${tokens.idToken}`
        },
        target: 'body',
        swap: 'outerHTML'
      });

    } catch (error) {
      this.hideLoading();
      this.showError(this.getErrorMessage(error));
    }
  }

  getErrorMessage(error) {
    const errorMessages = {
      NotAuthorizedException: 'Invalid username or password',
      UserNotFoundException: 'User does not exist',
      UsernameExistsException: 'Username already exists',
      InvalidPasswordException: 'Password does not meet requirements',
      CodeMismatchException: 'Invalid verification code',
      ExpiredCodeException: 'Verification code has expired',
      default: 'An error occurred during authentication'
    };

    return errorMessages[error.name] || errorMessages.default;
  }
}

// グローバルに公開
window.LoginFormManager = LoginFormManager;