namespace TutorAuth {
  interface StoredTokens {
    accessToken: string;
    expiresAt: number;
  }

  function encodeBase64Url(bytes: Uint8Array): string {
    let value = "";
    for (const byte of bytes) {
      value += String.fromCharCode(byte);
    }
    return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  }

  function createVerifier(): string {
    return encodeBase64Url(crypto.getRandomValues(new Uint8Array(48)));
  }

  async function createChallenge(verifier: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    return encodeBase64Url(new Uint8Array(digest));
  }

  async function getStoredToken(): Promise<string | null> {
    const stored = await chrome.storage.local.get(["accessToken", "expiresAt"]);
    if (
      typeof stored.accessToken === "string"
      && typeof stored.expiresAt === "number"
      && stored.expiresAt > Date.now() + 60_000
    ) {
      return stored.accessToken;
    }
    return null;
  }

  export async function getAccessToken(config: TutorConfig.RuntimeConfig): Promise<string> {
    const existingToken = await getStoredToken();
    if (existingToken !== null) {
      return existingToken;
    }
    if (!config.cognitoDomain || !config.cognitoClientId) {
      if (new URL(config.backendUrl).hostname === "localhost") {
        return "local-development-token";
      }
      throw new Error("Cognito is not configured for this extension build.");
    }

    const verifier = createVerifier();
    const challenge = await createChallenge(verifier);
    const redirectUri = chrome.identity.getRedirectURL("oauth2");
    const authorizationUrl = new URL("/oauth2/authorize", config.cognitoDomain);
    authorizationUrl.searchParams.set("client_id", config.cognitoClientId);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("scope", "openid email");
    authorizationUrl.searchParams.set("redirect_uri", redirectUri);
    authorizationUrl.searchParams.set("code_challenge_method", "S256");
    authorizationUrl.searchParams.set("code_challenge", challenge);

    const redirectedTo = await chrome.identity.launchWebAuthFlow({
      url: authorizationUrl.toString(),
      interactive: true,
    });
    if (!redirectedTo) {
      throw new Error("Sign-in did not return an authorization code.");
    }
    const code = new URL(redirectedTo).searchParams.get("code");
    if (!code) {
      throw new Error("Sign-in response did not contain an authorization code.");
    }

    const tokenResponse = await fetch(new URL("/oauth2/token", config.cognitoDomain), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: config.cognitoClientId,
        code,
        code_verifier: verifier,
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenResponse.ok) {
      throw new Error(`Sign-in token exchange failed (${tokenResponse.status}).`);
    }
    const payload = await tokenResponse.json() as {
      access_token?: unknown;
      expires_in?: unknown;
    };
    if (typeof payload.access_token !== "string") {
      throw new Error("Sign-in token response was invalid.");
    }
    const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : 3600;
    const tokens: StoredTokens = {
      accessToken: payload.access_token,
      expiresAt: Date.now() + expiresIn * 1000,
    };
    await chrome.storage.local.set(tokens);
    return tokens.accessToken;
  }
}
