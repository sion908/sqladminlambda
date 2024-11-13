class CognitoAuthManager {
  constructor(config) {
      this.userPool = new AmazonCognitoIdentity.CognitoUserPool({
          UserPoolId: config.userPoolId,
          ClientId: config.clientId
      });
  }

  async signIn(username, password) {
      return new Promise((resolve, reject) => {
          const authData = {
              Username: username,
              Password: password
          };

          const cognitoUser = new AmazonCognitoIdentity.CognitoUser({
              Username: username,
              Pool: this.userPool
          });

          const authDetails = new AmazonCognitoIdentity.AuthenticationDetails(authData);

          cognitoUser.authenticateUser(authDetails, {
              onSuccess: (session) => {
                  const tokens = {
                      idToken: session.getIdToken().getJwtToken(),
                      refreshToken: session.getRefreshToken().getToken()
                  };
                  sessionStorage.setItem('idToken', tokens.idToken);
                  this._refreshToken = tokens.refreshToken;
                  resolve(tokens);
              },
              onFailure: (err) => {
                  reject(err);
              },
              newPasswordRequired: (userAttributes, requiredAttributes) => {
                  reject({ code: 'NewPasswordRequired', userAttributes, requiredAttributes });
              }
          });
      });
  }

  getErrorMessage(error) {
      switch(error.code) {
          case 'NotAuthorizedException':
              return 'Invalid username or password';
          case 'UserNotConfirmedException':
              return 'Please verify your email address';
          case 'NewPasswordRequired':
              return 'Please change your password on first login';
          default:
              return 'An error occurred during login';
      }
  }
}
