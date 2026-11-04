const test = require("node:test");
const assert = require("node:assert/strict");
const { getRepairConfig, missingGithubTokens, githubTokenName } = require("../../config/repair/repairConfig");

const KEYS = ["REPAIR_GITHUB_TOKEN", "REPAIR_WEBSITE_GITHUB_TOKEN"];

function withEnv(values, fn) {
    const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
    for (const k of KEYS) {
        if (values[k] === undefined) delete process.env[k];
        else process.env[k] = values[k];
    }
    try {
        fn();
    } finally {
        for (const k of KEYS) {
            if (saved[k] === undefined) delete process.env[k];
            else process.env[k] = saved[k];
        }
    }
}

test("each repo uses its own token when both are set", () => {
    withEnv({ REPAIR_GITHUB_TOKEN: "backend-token", REPAIR_WEBSITE_GITHUB_TOKEN: "website-token" }, () => {
        const { githubTokens } = getRepairConfig();
        assert.equal(githubTokens.backend, "backend-token");
        assert.equal(githubTokens.website, "website-token");
        assert.deepEqual(missingGithubTokens(), []);
        assert.equal(githubTokenName("website"), "REPAIR_WEBSITE_GITHUB_TOKEN");
        assert.equal(githubTokenName("backend"), "REPAIR_GITHUB_TOKEN");
    });
});

test("the website falls back to the one token, as before", () => {
    withEnv({ REPAIR_GITHUB_TOKEN: "one-token" }, () => {
        const { githubTokens } = getRepairConfig();
        assert.equal(githubTokens.website, "one-token");
        assert.equal(githubTokens.backend, "one-token");
        assert.deepEqual(missingGithubTokens(), []);
        assert.equal(githubTokenName("website"), "REPAIR_GITHUB_TOKEN");
    });
});

test("only the website token set: the backend token is reported missing", () => {
    withEnv({ REPAIR_WEBSITE_GITHUB_TOKEN: "website-token" }, () => {
        assert.deepEqual(missingGithubTokens(), ["REPAIR_GITHUB_TOKEN"]);
    });
});

test("no tokens: both are reported missing", () => {
    withEnv({}, () => {
        assert.deepEqual(missingGithubTokens(), ["REPAIR_GITHUB_TOKEN", "REPAIR_WEBSITE_GITHUB_TOKEN"]);
    });
});
