import { expect, test } from "bun:test";
import { apiClient } from "../src/services/api/request";
import { listReviewMembers } from "../src/services/api/project-reviews";

test("review members unwrap the actual native page before the dialog renders its rows", async () => {
    const previous = apiClient.defaults.adapter;
    try {
        apiClient.defaults.adapter = async (config) => {
            expect(config.url).toBe("/projects/owned-project/members");
            return { config, status: 200, statusText: "OK", headers: {}, data: { code: 0, msg: "ok", data: { members: [{ id: "grant", userId: "reviewer", username: "审片者", role: "reviewer", active: true, revision: 1 }] } } };
        };
        const members = await listReviewMembers("owned-project");
        expect(members.map((member) => member.username)).toEqual(["审片者"]);
    } finally {
        apiClient.defaults.adapter = previous;
    }
});
