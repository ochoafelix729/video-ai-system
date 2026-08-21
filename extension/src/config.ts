namespace TutorConfig {
  export interface RuntimeConfig {
    backendUrl: string;
    cognitoDomain: string;
    cognitoClientId: string;
  }

  const defaults: RuntimeConfig = {
    backendUrl: "http://localhost:8000",
    cognitoDomain: "",
    cognitoClientId: "",
  };

  export async function load(): Promise<RuntimeConfig> {
    const stored = await chrome.storage.sync.get([
      "backendUrl",
      "cognitoDomain",
      "cognitoClientId",
    ]);
    return {
      backendUrl: typeof stored.backendUrl === "string" ? stored.backendUrl : defaults.backendUrl,
      cognitoDomain: typeof stored.cognitoDomain === "string"
        ? stored.cognitoDomain
        : defaults.cognitoDomain,
      cognitoClientId: typeof stored.cognitoClientId === "string"
        ? stored.cognitoClientId
        : defaults.cognitoClientId,
    };
  }
}
