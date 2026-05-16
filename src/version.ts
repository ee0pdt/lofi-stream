declare const __GIT_SHA__: string;
export const VERSION = typeof __GIT_SHA__ !== "undefined" ? __GIT_SHA__ : "dev";
