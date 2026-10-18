// Every internal link goes through here, because the site is served under /orrery on GitHub Pages.
const base = import.meta.env.BASE_URL.replace(/\/$/, "");

export const url = (path = "") => `${base}/${path.replace(/^\//, "")}`;

export const repo = "https://github.com/Sagargupta16/orrery";
export const blob = (path: string) => `${repo}/blob/main/${path}`;
export const npm = "https://www.npmjs.com/package/@sagargupta1610/orrery";
