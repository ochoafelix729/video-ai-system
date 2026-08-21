"use strict";
var TutorConfig;
(function (TutorConfig) {
    const defaults = {
        backendUrl: "http://localhost:8000",
        cognitoDomain: "",
        cognitoClientId: "",
    };
    async function load() {
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
    TutorConfig.load = load;
})(TutorConfig || (TutorConfig = {}));
