import { PullRequestUrl } from "./PullRequestUrl";

export function createDummyPullRequestUrl(
	value = "https://example.com/owner/repo/pull/1",
): PullRequestUrl {
	return PullRequestUrl.reconstruct(value);
}
