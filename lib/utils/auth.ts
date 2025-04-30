export const getAuthToken = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(chrome.runtime.lastError || new Error('No token available'));
      } else {
        resolve(token);
      }
    });
  });
};

export const getAuthTokenInteractive = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(chrome.runtime.lastError || new Error('Failed to get auth token'));
      } else {
        resolve(token);
      }
    });
  });
};

export const removeAuthToken = (token: string): Promise<void> => {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, () => {
      resolve();
    });
  });
};

/**
 * Checks if the given OAuth token has all required scopes.
 * @param token The OAuth token to check.
 * @param requiredScopes Array of required scope strings.
 * @returns Promise that resolves to true if all required scopes are present, false otherwise.
 */
export const checkTokenScopes = async (
  token: string,
  requiredScopes: string[]
): Promise<boolean> => {
  const res = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${token}`);
  if (!res.ok) return false;
  const data = await res.json();
  const grantedScopes = (data.scope || '').split(' ');
  return requiredScopes.every(scope => grantedScopes.includes(scope));
};
